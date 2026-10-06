---
title: "The Case for Small Specialized Models"
tags: [ blog, nlp, benchmark ]
date: 2026-10-05
last_modified_at: 2026-10-05
---

<img src="{{ '/assets/images/small-specialized-cover.png' | relative_url }}" alt="100 labels beat the 5B decision model: fine-tuned encoder label-efficiency curves crossing the Tev1-4B zero-shot line" width="2400" height="1350" fetchpriority="high">

One hot idea of 2026 is the "System-1" decision model: a small, non-autoregressive model
that classifies without generating text and returns calibrated probabilities in a single
forward pass. TypeSafe AI's **Jev** introduced it with crazy numbers ([~193×
faster, ~445× cheaper than an LLM][toms]), Together shipped an open clone, **Tev1-4B**
([the "$17" post][jev]), and the community followed with **laya**, **von**, and others.

Those speed and cost claims are measured against frontier LLMs, and are extremely competitive again them. 
But reading the launch posts, I realized I had no fresh numbers for the tool I default to: fine-tuned tiny encoders. 
The literature says fine-tuned small models [still beat zero-shot generative models on text
classification][ft], and the common production pattern is (hopefully) a cheap classifier that
routes traffic and escalates only the hard cases to an LLM.

So I measured both sides myself: a dataset of my own, Modal GPUs, the 4B model running locally,
and the original Jev through TypeSafe's API. One thing to get out of the way first: a model trained on
in-domain labels *should* beat a zero-shot one. What I wanted to know was what whether small models are still a thing 
in 2026, and how many labels it needs before it pays off. 
The answers: a 29 macro-F1 point lead over the best decision model, for about 100 labels, an hour of annotation. 
However, an check on AG News showed me where the decision models genuinely shine.

## A Taxonomy of My Own

[`tldr_news`][ds] is ~22k items from the TLDR newsletters, each carrying a `section`
label. The raw labels are messy (23 near-duplicate sections, an empty label, sponsor
rows), so I collapsed them into clean classes. The
per-class diagnostic below shows what that does. Tev collapses to 0.00 on it and laya to
0.25, while the fine-tuned models score around 0.9, because they learn the format from
length cues alone. A zero-shot model has no way to guess a newsletter's editorial
conventions, so I dropped the class and ran the comparison on the five content classes.

<img src="{{ '/assets/images/small-specialized-per-class-f1.png' | relative_url }}" alt="Per-class F1 heatmap: fine-tuned models score high everywhere, zero-shot models collapse on the Quick Links format label" width="1916" height="1071" loading="lazy">

The zero-shot models also grab at *Security* whenever they're unsure: on the six-class
run, Tev recalls 0.98 of Security items with 0.24 precision.

Full disclosure, so you can discount accordingly: this is my dataset, my label mapping,
and my class descriptions. All numbers below share the same seed-42 stratified split
(~1.2k test items), body-only input, macro-F1.

## Thirty Points Apart

| Model | Approach | Params | macro-F1 | ms/item (bs=1) | ms/item (bs=32) |
|---|---|---:|---:|---:|---:|
| **RoBERTa-base** | fine-tuned | 125M | **0.783** | 10.5 | 7.1 |
| ModernBERT-base | fine-tuned | 150M | 0.759 | 16.5 | 9.7 |
| DistilBERT-base | fine-tuned | 67M | 0.739 | 5.4 | **3.6** |
| FastBERT | early-exit | 251M | 0.732 | 11.8 | 8.4 |
| TheseusBERT | compression | 151M | 0.709 | 4.6 | **3.6** |
| Clef | zero-shot decision model | 27B | 0.419 | 341.2 ⁴ | n/a ⁴ |
| Tev1-4B | zero-shot decision model | 5B ¹ | 0.410 | 418.9 | 123.4 |
| Jev (API) | zero-shot decision model | undisclosed | 0.407 | n/a ² | n/a ² |
| laya | zero-shot decision model | 421M | 0.381 | 59.9 | n/a ³ |

¹ Named 4B; the checkpoint reports ≈5B parameters on its model card.
² Jev runs behind TypeSafe's API (p50 round trip ~250 ms); not comparable to local
single-GPU numbers, so it sits out the latency and cost columns.
³ laya's `Router.predict` has no batch API, so it runs single-item.
⁴ Clef (27B) doesn't fit the L4 used for the other rows; its latency is bs=1 on an H100,
so it sits out the cost column.

The gap is not subtle. The *worst* fine-tuned model here, TheseusBERT at 0.709, beats the
*best* zero-shot decision model, Cloudflare's 27B Clef at 0.419, by 29 macro-F1 points.
Against Tev1-4B, the zero-shot model that fits the same L4 harness, it also answers
34-91× faster. The original Jev, queried through TypeSafe's API with the same prompts,
lands at 0.407, tied with its open clone. Batching helps everyone (encoder per-item latency drops 25-40%), but the
ranking doesn't move, and Tev stays 13-34× slower even batched. FastBERT and TheseusBERT
are the compression architectures from my [early-exiting series][ee], trained here with
[bert-squeeze][bs].

Latency converts directly into money. Batched on a Modal L4 at $0.000222 per GPU-second:

| Model | ~$ / 1M classifications |
|---|---:|
| DistilBERT-base / TheseusBERT | **~$0.80** |
| RoBERTa-base | ~$1.58 |
| FastBERT | ~$1.86 |
| ModernBERT-base | ~$2.15 |
| laya | ~$13 (single-item; a batch API would cut this substantially) |
| Tev1-4B | ~$27 |

Plot accuracy against that cost:

<img src="{{ '/assets/images/small-specialized-cost-accuracy.png' | relative_url }}" alt="Accuracy versus cost per million classifications: fine-tuned encoders sit top-left, zero-shot decision models bottom-right" width="1881" height="1568" loading="lazy">

The purple arrow is a bonus: distilling a RoBERTa-large teacher into DistilBERT lifts it
from 0.73 to 0.76 at unchanged size, latency, and cost.

## Getting the Most Out of Zero-Shot

A comparison like this is only fair if the zero-shot side is set up carefully. I
improved it step by step:

1. **Six classes, terse prompts:** laya 0.22, Tev 0.27.
2. **Five content classes, richer descriptions:** laya 0.38, Tev 0.41.
3. **Title added to the input:** laya 0.38 (no change), Tev 0.42.
4. **Few-shot (10 exemplars) for Tev:** 0.06. A caveat rather than a gotcha: few-shot is
   outside Tev's documented single-shot format, so the collapse is unsurprising. The
   practical point stands, though. Unlike an LLM, you can't buy accuracy with exemplars.
   You use these models exactly as trained, or you fine-tune them.

The best zero-shot result, Clef at 0.419, still trails every fine-tuned model by
roughly 29 points.

## The Calibration Test

Calibrated probabilities are the decision models' signature claim, so I measured: ECE, Brier, NLL, and
reliability diagrams, with one-parameter temperature scaling for the encoders.

| Model | acc | ECE ↓ | Brier ↓ | NLL ↓ |
|---|---:|---:|---:|---:|
| RoBERTa-base | 0.78 | 0.096 → **0.028** (temp-scaled) | **0.333** | 0.640 |
| DistilBERT-base | 0.72 | 0.126 → 0.046 | 0.418 | 0.800 |
| laya | 0.36 | **0.033** | 0.752 | 1.501 |
| Tev1-4B | 0.41 | 0.327 | 0.860 | 1.969 |
| Jev (API) | 0.40 | 0.472 | 1.028 | 6.910 |
| Clef | 0.45 | 0.323 | 0.812 | 1.658 |

<img src="{{ '/assets/images/small-specialized-reliability.png' | relative_url }}" alt="Reliability diagram: laya hugs the diagonal, Tev1-4B and the original Jev sit deep in the overconfident region" width="1322" height="1436" loading="lazy">

Giving them a fair comparison: laya honors its ECE claim. An expected calibration error of
0.033 is genuinely good. But it's the calibration of a flat, underconfident distribution.
The model is unsure and mostly wrong, which is why its Brier and NLL are the
worst in the table. Tev's probabilities: ECE 0.327, systematically
overconfident, reliability curve well below the diagonal. And a temperature-scaled
RoBERTa ties laya on ECE at twice the accuracy (Brier 0.33 vs 0.75).

The original Jev is the sharpest version of this story. On AG News, where it is
comfortable, its probabilities are honest (ECE 0.076). On my taxonomy it returns
near-one-hot distributions while being wrong most of the time: ECE 0.472, NLL 6.9.
Calibration, it turns out, is as in-distribution as accuracy. Clef is the strongest
witness: Cloudflare trains it with an explicit Brier objective, and in-distribution it
shows, with the best calibration in this whole post (ECE 0.026 on AG News, better than
the raw encoders). On my taxonomy that same model runs overconfident at ECE 0.323. Its
reliability curve tracks Tev's, so I left it off the chart for legibility.

Two caveats. Temperature scaling itself consumes the labeled validation set: cheap, but
not zero labels. And at ~1.2k test items, ECE differences under ~0.02 sit inside binning
noise, so read 0.028 vs 0.033 as a tie. The robust signal is Brier and NLL, and there it
isn't close.

## Pricing the "No Labels" Promise

The strongest practical argument for zero-shot is skipping annotation entirely.
So let's price that convenience: fine-tune DistilBERT and RoBERTa on stratified
subsamples of the training set, three seeds each, and see where they cross the zero-shot
lines.

<img src="{{ '/assets/images/small-specialized-label-efficiency.png' | relative_url }}" alt="Macro-F1 versus number of labeled training examples: DistilBERT crosses the Tev1-4B line at 100 labels, RoBERTa at 50" width="1726" height="1413" loading="lazy">

Twenty-five labels isn't enough. DistilBERT sits at 0.27, below both zero-shot models.
Fifty ties laya, and RoBERTa already clears Tev on every seed there. At **one hundred
labels, even DistilBERT beats Tev1-4B on every seed** (0.49 vs 0.41), and from there both
curves just climb: RoBERTa hits 0.55 at 100, 0.66 at 1,000, and 0.78 on the full ~9,850.

A hundred labeled examples is an hour of annotation. The training bill is a rounding
error: the full fine-tune takes about five GPU-minutes, roughly $0.07 on a Modal L4,
about what it costs to *classify 2,500 items once* with Tev. On this taxonomy, skipping annotation costs
about 30 F1 points, and an hour of labeling buys them back.

## A Dataset That Isn't Mine: AG News

Everything above is one dataset: mine, with my label mapping. So I reran the core
comparison on **AG News**: four classes, official 120k/7.6k splits, nobody's taxonomy but
the benchmark's own.

| AG News (official test, macro-F1) | |
|---|---:|
| DistilBERT · fine-tuned (full train) | **0.944** |
| RoBERTa · fine-tuned (full train) | 0.944 |
| laya · zero-shot | 0.929 |
| Clef · zero-shot | 0.904 |
| Tev1-4B · zero-shot | 0.896 |
| Jev · zero-shot (API) | 0.884 |
| DistilBERT · fine-tuned on 100 labels | 0.851 |

<img src="{{ '/assets/images/small-specialized-dataset-gap.png' | relative_url }}" alt="Fine-tuned versus zero-shot gap per dataset: 37 points on tldr_news, 1.5 points on AG News" width="1616" height="1290" loading="lazy">

This partially cuts against my headline, and I'm reporting it anyway: on a canonical
benchmark taxonomy the zero-shot decision models are *good*. laya lands within 1.6 points
of a full fine-tune, and here zero-shot beats 100 labels.

But there's a reason - **AG News is in Tev's  training mixture.** Together's own recipe lists "AG News (1,500 examples)" among tev1's
training data ([their blog][jev]). For Tev, this is closer to an in-distribution
test than a zero-shot one. laya's training mixture is unpublished, but news-topic
classification is a standard decision-model demo, and its performance pattern points the same way.

## Where Each Approach Fits

The picture I ended up with is more useful than the one I started with. Decision models
are strong where the label schema resembles their training distribution: "zero-shot" in
practice means "in-distribution for someone else's training mixture." If your label
schema looks like a public benchmark, or if it genuinely changes at runtime, a decision
model will serve you well. If your taxonomy is your own (editorial
sections, internal ticket categories: the normal production case), a hundred labels plus
a $0.07 fine-tune gets you a small model that leads on accuracy, latency, cost, and,
after one temperature parameter, calibration too.

Even on tasks built for decision models, the small model holds up. 
On AG News, fine-tuned DistilBERT beats Laya 0.944 to 0.929, with a fraction of the latency and cost. 
And this is not just a quirk of the open clones: the original Jev scores 0.407 on my taxonomy and 0.884 on AG News, and Cloudflare's Clef, the biggest and best of them at 27B, follows the same curve at 0.419 and 0.904. 
The same result shows up across price points. System-1 really is faster when the alternative is a frontier LLM. 
Against a small fine-tuned encoder, though, the cost advantage disappears.

## Reproducing the Numbers

```python
from bert_squeeze.assistants import TrainAssistant
TrainAssistant(
    "automodel",
    general_kwargs={"labels": list(range(5)), "num_labels": 5},
    model_kwargs={"pretrained_model": "roberta-base"},  # or ModernBERT, DeBERTa, …
    data_kwargs={"dataset_config": {
        "path": "JulesBelveze/tldr_news", "text_col": "text",
        "label_col": "section", "label_map": SECTION_MAP,  # 5 content classes
        "stratify_by_column": "section"}},
)
```

Runs on Modal (T4/L4/H100) - methodology:

- **Training recipe**: every headline fine-tune is [bert-squeeze][bs]'s `TrainAssistant`
  with cross-entropy, AdamW at 2e-5, batch 32, max length 256, 3 epochs. The
  label-efficiency subsamples use a plain HF loop (AdamW at 3e-5, ~300 steps
  regardless of n); AG News full-data runs train 2 epochs. Encoders and Tev ran on
  transformers 4.57, FastBERT and TheseusBERT on 4.45 (their custom BERT graphs
  predate the 4.48 attention refactor), laya through its `laya` pip package.
- **Latency** is a warmed-up forward pass, seq 256, ms/item, all measured on the same
  L4. Tev ran locally in bf16 via HF `generate` (greedy, max 8 new tokens, chat
  template per its model card). That's a naive loop, not an optimized serving stack,
  so treat its numbers as an upper bound. laya is timed end to end through its
  `Router.predict` API, the only interface it exposes. ModernBERT is attention-kernel sensitive (roughly 2× faster
  with flash-attn than eager).
- **Variance**: the headline encoder numbers are single-seed. The label-efficiency runs
  put seed spread at ±0.01-0.02, enough to reorder adjacent encoders and nowhere near the
  30-point encoder-vs-zero-shot gap. Across experiments, DistilBERT's full-data runs
  landed 0.73-0.74 and RoBERTa's 0.77-0.80, which brackets the headline 0.783.
- The encoder eval drops a partial final batch (1,216 vs 1,232 test items, ~1%).
- The AG News check uses the official train/test splits, full test set (7,600 items,
  0 unparsed answers from any zero-shot model), and the same prompting protocol as the
  main runs.
- **Clef** ran locally from its open weights (`Cloudflare/clef`, Apache 2.0) on an H100
  via the bundled `joint_schema_model` code (torch 2.11, transformers 5.10), batch 16,
  same prompts and class descriptions as every other run.
- **Jev** was queried through TypeSafe's API (`jev-latest`, which resolved to
  `jev-1.13.0`), with the same class descriptions and body-only input as every other run,
  full test sets on both datasets, 0 unrecognized answers. Its probabilities come
  straight from the API response.
- Also tried: naive dynamic int8 quantization halved RoBERTa's CPU latency but cost 15 F1
  points. Quantization wants QAT or selective layers, not a one-liner. DeeBERT was
  excluded (a naive fine-tune doesn't provide its staged early-exit training).

## References

- Together AI, [*How to train your own Jev*][jev] · [Jev API docs][jevapi]
- Tom's Hardware, [*TypeSafe AI's Jev offers an alternative to LLMs*][toms]
- [*Fine-tuned small LLMs (still) significantly outperform zero-shot generative AI
  models in text classification*][ft]
- [`JulesBelveze/tldr_news`][ds] · [AG News][ag] · [laya][laya] · [Tev1-4B][tev] ·
  [Clef][clef]
- [bert-squeeze][bs], the compression library used for training, distillation, and the
  early-exit models · my [early-exiting series][ee]

[jev]: https://www.together.ai/blog/how-to-train-your-own-jev
[jevapi]: https://jevtypesafeai.com/jev/api
[toms]: https://www.tomshardware.com/tech-industry/artificial-intelligence/typesafe-ais-jev-offers-an-alternative-to-llms-that-claims-to-be-193x-faster-and-445x-cheaper-system-one-type-model-is-bespoke-for-probabilistic-decision-making
[ft]: https://arxiv.org/abs/2406.08660
[ds]: https://huggingface.co/datasets/JulesBelveze/tldr_news
[ag]: https://huggingface.co/datasets/fancyzhx/ag_news
[bs]: https://github.com/JulesBelveze/bert-squeeze
[ee]: https://julesbelveze.github.io/early-exiting/
[laya]: https://huggingface.co/convaiinnovations/laya
[tev]: https://huggingface.co/togethercomputer/Tev1-4B-experimental
[clef]: https://huggingface.co/Cloudflare/clef
