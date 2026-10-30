---
title: "One Linear layer broke my INT8 encoder"
date: 2026-10-30
last_modified_at: 2026-10-30
tags: [blog, nlp, quantization, deployment]
permalink: /one-linear-layer-broke-my-int8-encoder/
excerpt: "One FP32 exemption recovered most of an INT8 classifier's lost quality. Then batching changed 67 individual decisions behind a similar aggregate score."
header:
  teaser: /assets/images/ultrabert/batching-preview.png
image: /assets/images/ultrabert/batching-preview.png
---

I converted a fine-tuned UltraBERT classifier to dynamic INT8 and watched test macro-F1 fall from **77.23 to 28.90**. The saved model reloaded correctly. Its predictions were still bad.

The failure was unusually concentrated: quantizing one Linear projection was enough to severely degrade the checkpoint. Keeping that projection in FP32 while quantizing the other 168 Linear modules recovered most of the lost quality.

This is a failure-localization story. I found a sensitive operation and tested an exemption; I have not identified the precise numerical mechanism behind its sensitivity. The practical result was a **55.5% smaller deployment artifact and 23% lower median CPU latency**, with an observed 0.63-point macro-F1 cost on the validation remainder.

## Find the part that changes the answer

The task was to predict a merged newsletter-section label from an article summary. I fine-tuned [UltraBERT-150M](https://huggingface.co/dmis-lab/UltraBERT-150M) for three epochs, selected the checkpoint on validation macro-F1, and capped inputs at 256 tokens. The target comes from mapped newsletter sections rather than independently annotated topics; that limits what a score says about semantic understanding.

The conversion used PyTorch 2.8.0's eager dynamic INT8 path, the x86 engine, and default per-tensor weight quantization. All 169 `nn.Linear` modules were converted; embeddings and normalization stayed FP32. For this path, activations are quantized during execution as well as weights being pre-quantized. Floating-point inputs and outputs do not make its internal operation equivalent to FP32 computation with rounded weights. [PyTorch explanation](https://pytorch.org/blog/quantization-in-practice/).

On the existing 1,221-example test evaluation, **95.4% of INT8 predictions landed in just two of five classes**. Security went from 49/57 correct in FP32 to 4/57; Research & Engineering went from 105/145 to 9/145. Reloaded INT8 logits matched the pre-export logits within `assert_close` tolerances, so serialization did not explain the collapse. [Original results](/assets/data/ultrabert/original-comparison.json), [confusion counts](/assets/data/ultrabert/group-ablation.json).

I moved the investigation to 64 fixed, stratified validation articles. They became a diagnostic workspace, not an independent confirmation set.

Changing batch size and removing padding did not restore quality. The useful partition was the module group: quantizing attention alone scored 80.91 macro-F1 against FP32's 81.08; quantizing only the feed-forward network, or FFN, scored 29.26. Quantizing only the classifier changed no predictions. Per-channel weights did not rescue the all-Linear or FFN-only recipes. [Group ablations](/assets/data/ultrabert/group-ablation-notes.txt).

## Separate rounded weights from the runtime path

Each UltraBERT FFN expands the hidden representation through two branches, gates one with SiLU, multiplies their outputs, and projects the product back to the hidden width:

![UltraBERT FFN branches and the down projection, with the measured checkpoint's dimensions](/assets/images/ultrabert/ffn-structure.svg)

```python
hidden = silu(gate_proj(x)) * up_proj(x)
output = down_proj(hidden)
```

The measured checkpoint maps 768 features to 1,024 in each branch, then back to 768. The down projection receives the gated product rather than the original hidden state. That makes it a useful experimental boundary; it does not prove the multiplication caused the failure. [Model implementation](https://huggingface.co/dmis-lab/UltraBERT-150M/blob/6563895568657abedabf6478435a250080c00440/modeling_ultrabert.py).

| Intervention on the 64 diagnostic articles | Macro-F1 |
| --- | ---: |
| FP32 | 81.08 |
| Quantize gate + up; preserve down projections | 81.08 |
| Quantize down projections only | 30.88 |
| Round all FFN weights to INT8 values; compute in FP32 | 79.99 |

Quantizing gate and up projections changed no class predictions on this subset, although their logits moved. Quantizing down projections alone reproduced severe degradation.

The rounded-weight control helped interpret that result. I dequantized the INT8 FFN weights into FP32 Linear operations, retaining the weight-rounding error while removing the dynamic INT8 execution path. Only one prediction changed. Weight rounding alone was insufficient to reproduce the collapse. The remaining runtime quantization/kernel path contributed substantially; this control does not distinguish activation quantization from backend arithmetic effects. [Interventions and control](/assets/data/ultrabert/projection-trace.json).

## The biggest numerical error was not the best lead

I traced each quantized FFN operator using its actual input from the FP32 trajectory, excluding propagated upstream quantization error. The largest reported valid-token relative RMS error was in layer 14's **up projection**: 35.1% for dynamic INT8 versus 5.8% for rounded weights with FP32 computation. Yet quantizing all up projections left every diagnostic class prediction unchanged.

The end-to-end sweep told a different story. Quantizing only the **first FFN block** changed 32/64 predictions and reduced macro-F1 to 36.07. The other 23 blocks, tested individually, each changed at most one prediction.

![Quantizing only FFN block 0 drops macro-F1 from 81.08 to 36.07; individually quantizing any other block scores 79.99–81.08](/assets/images/ultrabert/block-sensitivity.svg)

*Each intervention quantizes the Linear modules inside one entire FFN block and keeps the rest of the model FP32. The range summarizes 23 separate runs, one per block; it is not a confidence interval. All runs use the same 64 diagnostic articles.*

Local numerical error and task sensitivity answer different questions. Some perturbations leave class decisions unchanged; others do not. Ranking isolated errors alone would not have pointed to the first block as the most damaging intervention. Large activation max/RMS ratios also appeared in the traces, but I have not demonstrated that outliers or padding caused the failure. [Trace results](/assets/data/ultrabert/projection-trace-notes.txt).

## Test the intersection, then the exemption

The projection sweep implicated down projections; the block sweep implicated the first FFN. I tested their intersection directly:

```text
ultrabert.layers.0.mlp.down_proj
```

![On 64 diagnostic articles, FP32 scores 81.08 macro-F1, all Linear modules INT8 scores 31.33, only block 0 down INT8 scores 36.07, and preserving that projection scores 77.57](/assets/images/ultrabert/single-layer-rescue.svg)

*These repeated diagnostic measurements guided the exemption. Broader validation and deployment measurements follow below.*

Quantizing that single projection reduced diagnostic macro-F1 from 81.08 to **36.07**. Quantizing all 169 Linear modules scored 31.33. Preserving that projection while quantizing the other 168 scored **77.57**, recovering 46.25 points relative to indiscriminate conversion.

It was an incomplete rescue: five of 64 predictions still differed from FP32. But the intervention tested a concrete cause of degradation, and the exemption tested a corresponding recovery. Each variant started from the same FP32 checkpoint. [Targeted results](/assets/data/ultrabert/single-projection-notes.txt).

The selection logic is small:

```python
exempt = "ultrabert.layers.0.mlp.down_proj"
linear_names = {
    name for name, module in fp32.named_modules()
    if isinstance(module, torch.nn.Linear)
}
quantized = torch.ao.quantization.quantize_dynamic(
    fp32.cpu().eval(), linear_names - {exempt},
    dtype=torch.qint8, inplace=False,
)
```

For a runnable version, [bert-squeeze's selective quantization example](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/README.md) compares full conversion with explicit exclusions, records the backend and module selection, exports/reloads both artifacts, and checks quality across input policies. It includes a pinned public-checkpoint demo; the demo's eight sentences exercise the workflow and do not reproduce this study's scores.

The [study package](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/STUDY.md) also contains frozen dataset reconstruction and the targeted experiment runner; the real checkpoint passed a fresh x86 package check, while public publication and download verification are pending. The exact measured UltraBERT checkpoint remains in my Modal volume. Reproducing these numbers requires that artifact and the frozen dataset. The example accepts a local checkpoint, but an exemption that helped mine is not a recommended default for another encoder. The standalone [study runner](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/reproduce.py) pins Torch 2.8.0 and Transformers 5.16.1; the standalone example avoids the training package's adapter dependency boundary.

## The rescue still changes with batching

I froze the exemption before evaluating the other **1,156 validation articles**, excluding all 64 diagnostic hashes. These examples were new to the quantization ablations, although the original checkpoint selection used full validation. I did not evaluate the rescued recipe on test data.

| Input policy | FP32 macro-F1 | INT8 with exemption |
| --- | ---: | ---: |
| Batch 16, padding 256 | 77.47 | 76.45 |
| Batch one, padding 256 | 77.47 | 77.18 |
| Batch one, actual length, capped at 256 | 77.47 | 76.84 |

The frozen recipe stayed within 0.29–1.03 points of FP32 under these policies. I did not rerun the failing all-Linear control on this remainder; the controlled rescue comparison remains the 64-example diagnostic. [Final report](/assets/data/ultrabert/final-verification.json).

**Similar aggregate scores did not mean stable per-request decisions.** FP32 predictions were identical across all three policies. INT8 changed 67 predictions between batch 16 and batch one at fixed padding, and 73 between batch 16/fixed padding and batch one/actual length. Those are disagreements with its own batch-16 predictions, not additional error counts.

At fixed padding, those 67 changes included 33 corrections against the dataset labels, 28 lost matches, and six changes that still disagreed with the label. The higher aggregate score concealed regressions on individual articles.

<a href="{{ '/experiments/ultrabert-batching/' | relative_url }}"><img src="{{ '/assets/images/ultrabert/batching-preview.png' | relative_url }}" alt="The same Copilot summary changes from Headlines and News in a batch to Guides and Resources alone, with fixed padding. Explore all recorded predictions." width="1600" height="1040" loading="lazy"></a>

**[Explore the predictions →](/experiments/ultrabert-batching/)** Keep an article fixed and compare the two policies side by side.

 The first changed example in validation order describes GitHub Copilot's development capabilities. The rescued INT8 model predicts Headlines & News in a batch of 16 and Guides & Resources when processed alone, with padding fixed at 256 in both cases. The explorer shows all 1,156 articles, including unchanged decisions, alongside the FP32 control. Its class scores are softmax-normalized outputs, not calibrated confidence.

For this recipe, batching and padding belong in the serving contract. A score measured under one policy cannot establish identical decisions under another. Reload equivalence passed on all 1,156 examples at batch 16 and on 32 probes under both batch-one policies, but that checks serialization fidelity within a policy, not invariance across policies.

## Measure both size and useful work

The final deployment comparison paired the models on a new CPU worker:

| Measurement | FP32 | INT8 with exemption |
| --- | ---: | ---: |
| Serialized deployment size | 607.7 MB | 270.5 MB |
| Actual-length median latency | 146.3 ms | 112.7 ms |
| Actual-length p95 latency | 228.5 ms | 174.9 ms |

The artifact was **55.5% smaller**; median latency was **23% lower**, a 1.30× speedup. Compression and speed improved by different factors. These timings do not isolate memory traffic, activation-quantization overhead, or individual kernels.

Padding was a larger lever here: FP32's median fell from 333.4 ms with fixed padding to 146.3 ms at actual length. Comparing padded FP32 with unpadded INT8 would incorrectly attribute both changes to quantization.

Both models used the same 32 texts, three repeats, 20 warmup calls and two Torch threads; timings included tokenization plus a batch-one forward pass. Median actual input length was 67 tokens. The CPU model was hidden. The 96 samples per path do not establish production tail behavior, and serialized bytes do not measure runtime memory. A later fresh-environment run matched all validation-remainder F1 scores but produced different timings and two different diagnostic INT8 scores. The original measurements remain the figures reported here; the [reproduction note](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/STUDY.md#fresh-x86-verification-result) records the differences and pinned software versions. Their cause has not been isolated. [Full protocol](/assets/data/ultrabert/final-verification-notes.txt).

## What this benchmark can tell us

The dataset also needs restraint. My cross-newsletter mapping put 564 infosec “Strategies & Tactics” articles in Business & Strategy and 217 fintech deep dives in Research & Engineering. Exact text deduplication left 70 test records whose source URL also occurred in training, including some near-identical summaries. URL overlap alone is not proof of duplicated content; some links were reused homepages. [Source audit](/assets/data/ultrabert/source-audit-notes.txt).

These limitations weaken claims about semantic classification or future newsletters. They do not explain the numerical degradation and recovery of a fixed checkpoint on identical inputs. The [methodology](/experiments/ultrabert-batching/evidence/) records the 12,205 retained examples, train/validation/test split, one training seed, and frozen revisions. Neither the diagnostic nor remainder comparison establishes statistical equivalence.

I would still check the smaller FP32 baseline before adopting this recipe. In the original same-worker comparison, Ettin-32M was 4.6 times smaller and had 6.8 times lower median latency than UltraBERT FP32, at a cost of 5.53 test macro-F1 points. That is a different tradeoff, measured under fixed padding; those timings cannot be combined with the final worker's measurements. [Original comparison](/assets/data/ultrabert/original-comparison.json).

The transferable result is the debugging method: partition modules, distinguish weight rounding from the runtime path, test a localized intervention and exemption, then freeze the recipe and validate its actual serving policy. For this checkpoint, preserving one projection produced a useful candidate. Understanding the precise numerical cause—and deciding whether its remaining prediction sensitivity is acceptable—are still open questions.
