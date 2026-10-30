---
title: "UltraBERT INT8: protocol and recorded evidence"
permalink: /experiments/ultrabert-batching/evidence/
layout: single
---

[Read the article](/one-linear-layer-broke-my-int8-encoder/) · [Explore the predictions](/experiments/ultrabert-batching/)

## Scope

This case study compares a fine-tuned UltraBERT checkpoint with variants of PyTorch 2.8.0 eager dynamic INT8 on the x86 engine. It is a failure-localization study on one checkpoint, task and training seed, not a comparison of quantization runtimes or proof of generalization to other models.

The exact fine-tuned checkpoint is not publicly released yet. The [standalone example](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/README.md) exercises conversion, module exclusions, export/reload and input-policy checks on a pinned public sentiment model or your own checkpoint. Its demo does **not** reproduce the article's scores. The [study instructions](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/STUDY.md) document the missing checkpoint-release step and the successful owner-side fresh-runtime check.

## Frozen data and training

The source is [JulesBelveze/tldr_news at the frozen revision](https://huggingface.co/datasets/JulesBelveze/tldr_news/tree/5ee6c613484aa6ac96fac7827a5659409897cc5b). Input is summary text only. Five labels map newsletter sections to Business & Strategy, Guides & Resources, Headlines & News, Research & Engineering, and Security. These are operational section labels, not independently annotated semantic topics.

Normalized exact-text deduplication and conflicting-label quarantine retain 12,205 articles: 9,764 training, 1,220 validation, 1,221 test. The stratified split uses seed 42. Remaining source-article overlap and mapping ambiguity are described in the [source audit](/assets/data/ultrabert/source-audit-notes.txt). No relabeling or split replacement occurred during quantization diagnosis.

UltraBERT-150M and Ettin-32M were fine-tuned for three epochs with the same initial AdamW learning rate of 3e-5, a 256-token cap and 918 optimizer updates. Best validation macro-F1 selects the checkpoint. This is one seed and a shared initial recipe, not an equally tuned model ranking. The UltraBERT classifier has 151,036,421 parameters. Source model revisions and dataset checksums are recorded in the [study manifest](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/study.json) and [data manifest](/assets/data/ultrabert/data-manifest.json).

## Keep the scopes separate

| Stage | Articles | Purpose |
| --- | ---: | --- |
| Original model comparison | 1,221 test | FP32, all-Linear INT8 and smaller FP32 baseline |
| Diagnosis and targeted rescue | 64 validation | Repeated ablations that selected the exemption |
| Frozen-recipe verification | 1,156 remaining validation | FP32 vs the selected exemption under three input policies |

The 1,156 remainder articles were excluded from quantization diagnosis, but had participated in the original checkpoint selection. The rescued recipe was not evaluated on test data.

The exemption is `ultrabert.layers.0.mlp.down_proj`. Other 168 Linear modules use INT8; embeddings and normalization remain FP32. Quality uses batch 16/fixed padding, batch one/fixed padding, and batch one/actual length capped at 256. Predictions in the interactive page follow the recorded text-hash order and preserve all 1,156 examples. Default example selection is the first disagreement in validation order; it is not hand-picked.

## Recorded results

These JSON files are recorded evidence, not freshly rerun evaluations. Historical notes retain the conclusions and next steps written at the time; later stages address some of those then-pending checks.

| Evidence | Scope and companion notes |
| --- | --- |
| [Original comparison](/assets/data/ultrabert/original-comparison.json) | Original CPU worker, test scores and fixed-padding latency |
| [Group ablations](/assets/data/ultrabert/group-ablation.json) | [Notes](/assets/data/ultrabert/group-ablation-notes.txt); article bodies removed from this report copy |
| [Projection/block trace](/assets/data/ultrabert/projection-trace.json) | [Notes](/assets/data/ultrabert/projection-trace-notes.txt); 64-example diagnosis |
| [Single-projection intervention](/assets/data/ultrabert/single-projection.json) | [Notes](/assets/data/ultrabert/single-projection-notes.txt); 64-example rescue |
| [Final verification](/assets/data/ultrabert/final-verification.json) | [Notes](/assets/data/ultrabert/final-verification-notes.txt); 1,156-example remainder and paired deployment measurements |
| [Fresh package check](/assets/data/ultrabert/release-verification.json) | Separate runtime/worker observation; not a replacement for historical values |

The fresh package check reconstructed the data and subset orders exactly and matched all six remainder macro-F1 scores. Two diagnostic INT8 scores and latency measurements differed; their cause has not been isolated. The [reproduction note](https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/STUDY.md#fresh-x86-verification-result) preserves both observations. Public checkpoint download/inference remains unverified.

## Deployment measurement

The final paired CPU worker used two Torch threads and one interop thread. Local tokenization plus batch-one forward latency used the same 32 seeded validation texts, three repeats and 20 warmups: 96 samples per path. Median actual input length was 67 tokens. CPU model was not exposed. These empirical percentiles do not establish an SLA, concurrency performance or cross-hardware stability. Serialized deployment size is not runtime memory.

FP32 actual-length median was 146.3 ms; selective INT8 was 112.7 ms on that worker. Do not combine those timings with the original worker's Ettin measurements. FP32 fixed-padding median was 333.4 ms, illustrating why padding policies must match when attributing speedup to quantization.

The numerical mechanism behind the sensitive projection remains unresolved. Weight-rounding controls implicate the runtime quantization/kernel path, but do not distinguish activation quantization from backend arithmetic effects.
