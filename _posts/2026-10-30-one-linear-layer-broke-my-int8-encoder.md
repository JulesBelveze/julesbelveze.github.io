---
title: "One Linear layer broke my INT8 encoder"
date: 2026-10-30
last_modified_at: 2026-11-05
tags: [blog, nlp, quantization, deployment]
permalink: /one-linear-layer-broke-my-int8-encoder/
classes: ""
excerpt: "I tried to make a small encoder cheaper to serve. One projection broke the INT8 conversion; batching made the recovery more complicated than its score suggested."
header:
  teaser: /assets/images/ultrabert/batching-preview.png
image: /assets/images/ultrabert/batching-preview.png
---

{::options smart_quotes="apos,apos,ldquo,rdquo" /}

My [last two posts][previous] argued that if your job is classification, a
fine-tuned encoder is still hard to beat. Once I had a model that worked, the
next question came naturally: can I make it smaller and faster on CPU without
losing much quality?

I went for dynamic INT8 quantization first, mostly because it's the lazy option
(in a good way). You keep the trained checkpoint, lower the precision of the
Linear operations, and get cheaper inference without training anything new. I
expected a boring tradeoff measurement. Instead, my fine-tuned UltraBERT dropped
from **77 to 29 macro-F1**. It still returned labels; it just put almost all of
them in two classes.

This post is the trail I followed from that collapse down to a single Linear
projection. Along the way, some measurements that looked useful sent me in the
wrong direction, and keeping that one projection in FP32 brought back most of
the quality. Then a serving check showed that a recovered score didn't mean the
model behaved the same when I changed how requests were batched.

The question I kept coming back to: **what evidence would actually convince me
this compressed model is worth deploying?** Getting a smaller file is easy. I
wanted to know where its predictions broke, whether a targeted fix could help,
and what was still different once the score looked fine again.

## Finding which model component breaks under INT8

Same task as before: newsletter-section classification, where the model predicts
a section from an article summary. Same disclosure as before too: my dataset, my
label mapping. This time I used a fresh, text-deduplicated split, so don't
compare these scores with the earlier leaderboard.[^methods]

I fine-tuned [UltraBERT-150M][ultrabert] and converted its Linear modules with
PyTorch's eager dynamic INT8 path. Embeddings and normalization stayed FP32. The
implementation matters here: everything below is about Torch 2.8's x86 path,
not every way of running an encoder in INT8.

My first suspicion was boring: maybe I broke something when saving and
reloading. A quantized artifact has to rebuild the right module types and packed
weights, so a reload bug would easily explain a big drop. It wasn't that. The
reloaded model reproduced its pre-export predictions. Changing the batch size or
removing padding didn't bring the quality back either.

Converting every Linear module at once changed too many things to give me a
lead. So I picked a fixed diagnostic subset of 64 validation articles and
quantized groups of modules one at a time, always starting from the same FP32
checkpoint. The goal was to find one group that reproduced the collapse on its
own before going layer by layer.

Quantizing only attention stayed close to FP32. Quantizing the feed-forward
networks (FFNs) caused a big drop. Keeping the classifier in FP32 didn't rescue
anything. So the FFNs alone were enough to trigger the problem, without touching
attention or the classifier. That's where I went digging.

## Testing weight rounding inside the FFN

UltraBERT's FFN has two branches. The gate projection goes through a SiLU and
gets multiplied element by element with the up projection. Then a down
projection maps the product back to the hidden width.

![The two FFN branches meet at an element-wise product, followed by the down projection.](/assets/images/ultrabert/ffn-structure.svg)

```python
hidden = silu(gate_proj(x)) * up_proj(x)
output = down_proj(hidden)
```

All three are Linear layers, but they don't see the same thing. Gate and up get
the incoming hidden state; down gets the product of the two branches. That made
me want to test them separately instead of treating the whole FFN as one block.

Quantizing the gate and up projections didn't change a single prediction on the
diagnostic subset. Quantizing the down projections reproduced the failure. That
told me where to look, not why. It doesn't show that the multiplication, or
anything specific about its output, is the cause.

Next I tried the simplest explanation I could think of: maybe rounding the FFN
weights is just that damaging. I rounded them to their INT8 values, dequantized
them, and ran everything in FP32. Same weight approximation, no dynamic INT8
execution. Quality stayed close to the reference.

That distinction turned out to matter. [Dynamic quantization][pytorch] doesn't
only pre-quantize weights; it also quantizes activations at runtime. An
operation can take and return float tensors and still do different arithmetic
internally than an FP32 operation with rounded weights. If you only look at the
stored weights, you miss that part.

So weight rounding alone wasn't enough to cause the collapse. Runtime
quantization and kernel execution played a big part, but this experiment can't
tell activation quantization apart from backend arithmetic effects. It narrowed
the question; it didn't answer it.

## Comparing tensor error with prediction changes

The other obvious approach was to measure how much error each quantized FFN
operator introduces and start with the worst one. To keep that fair, I fed each
operator the exact input it gets in the FP32 model, so its error wouldn't
already include errors coming from quantized operators upstream.

The largest local error was in an **up projection** much later in the network.
Yet quantizing every up projection hadn't changed a single prediction.

That one stuck with me. A perturbation in the middle of the network still has to
travel through everything after it, and its size tells you nothing about
whether it will reorder the final class scores. A classifier can absorb a big
numerical change and still pick the same label, while a smaller one can push a
decision across a class boundary. Local error and end-to-end interventions
answer different questions, and I'd been treating them as the same one.

So I went back to interventions and quantized whole FFN blocks one at a time.
The first block alone caused a big drop; each of the others barely moved the
score. Now I had two clues from two independent sets of experiments: the down
projections were sensitive, and the first FFN block was sensitive.

The spot where they overlap was the obvious suspect, but I still had to test it
directly:

```text
ultrabert.layers.0.mlp.down_proj
```

## Recovering quality with one FP32 projection

I ran two experiments on that projection, each answering a different question:

- **Quantize only that projection.** Is converting it enough, on its own, to
  break the model?
- **Quantize everything except that projection.** Can the rest of the INT8
  model work fine with that one exception?

Both came back the way I hoped. Quantizing just the first down projection caused
a big drop. Keeping it in FP32 while quantizing the other 168 Linear modules
recovered most of the lost quality.

![Four matched interventions: FP32 reference, all Linear modules INT8, only the first down projection INT8, and all except that projection INT8.](/assets/images/ultrabert/single-layer-rescue.svg)

*All four variants use the same 64 diagnostic articles and start from the same
FP32 checkpoint.*

This was much more useful than knowing which tensor had the biggest error: one
localized change explained both the failure and the recovery. The recovery
wasn't complete, and it doesn't prove this is the only sensitive operation, but
it gave me a concrete recipe to test on more data.

## Checking whether batch size changes the predictions

By this point the 64-article subset had guided several of my choices, so it
couldn't also be what confirmed them. I froze the exemption and evaluated it on
the rest of validation, which I hadn't used for the diagnosis. (The original
checkpoint selection used the full validation set, so this still isn't a clean
holdout.)

Macro-F1 stayed within about a point of FP32 across every batching and padding
policy I tried. Good news, but one question kept bugging me: was the model making
the same decisions on each article, or just getting roughly the same number
right?

For serving, that difference matters a lot. Batch size is usually an
infrastructure knob you turn for throughput. If the classifier feeds a routing
system and its label changes when you turn that knob, the same request can go
down a different path. So instead of assuming a close aggregate score meant
close behavior, I compared the decisions directly.

At fixed padding, going from batches of 16 to one article at a time changed
**67 of 1,156 INT8 decisions**. FP32 changed none. The funny part is that the
score actually went up a bit: processing articles alone fixed 33 mistakes
against the dataset labels but introduced 28 new ones. The remaining six
switched between two labels that were both wrong.

So a slightly higher score was hiding a mix of fixes and regressions, and the
serving policy decided which requests got which answer. That's why the score
alone couldn't settle whether to deploy.

Here's the first changed example in validation order, a summary about GitHub
Copilot. In a batch it's Headlines & News; alone it becomes Guides & Resources.
Same summary, same checkpoint, same padding length.

<div class="prediction-explorer-inline">
  <iframe id="ultrabert-predictions" class="prediction-explorer-frame" src="{{ '/experiments/ultrabert-batching/' | relative_url }}?embed=1" title="Compare the same article's predictions in a batch and alone" loading="lazy" height="1100" hidden></iframe>
  <noscript><img src="{{ '/assets/images/ultrabert/batching-preview.png' | relative_url }}" alt="The same Copilot summary changes predicted class when processed alone instead of in a batch." width="1600" height="900" loading="lazy"></noscript>
</div>
<script src="{{ '/assets/js/ultrabert-embed.js' | relative_url }}" defer></script>

Try another article, switch the processing policy, or compare with FP32. The
bars show normalized model scores, not calibrated confidence.
[Open the full explorer →](/experiments/ultrabert-batching/)

To be clear, this doesn't blame any specific article it was batched with:
moving from a batch to a single forward pass also changes the shape of the
computation. What it does show is that this recipe's decisions depend on the
batching policy. FP32 on the same inputs is the control, and the INT8
comparison shows behavior the aggregate score was hiding.

And the reload check I started with couldn't have caught this. It verifies that
the saved model reproduces its own behavior under one policy, which is useful,
but it says nothing about how the model behaves under another.

## Measuring the size and latency tradeoff

After all that, I still owed myself an answer to the original question: what did
the exemption actually buy in size, latency and quality?

On the final paired CPU comparison, the deployment artifact was **about 55%
smaller** than FP32, with **23% lower median latency** at actual input length,
for less than a point of macro-F1 under that policy. That makes it a reasonable
candidate on these numbers, though its sensitivity to batching still has to be
weighed against whatever it ends up being used for.[^measurement]

Note that the size and speed gains are very different. Size is what you store;
latency is the work of running the model. I didn't isolate per-kernel costs, so
I can't say exactly where the time went, but halving the file clearly doesn't
halve the forward pass.

Honestly, padding was the bigger speed lever in this run: removing fixed-length
padding more than halved FP32 median latency. Had I compared padded FP32 with
unpadded INT8, I'd have credited quantization for a gain that mostly came from
processing less padding. Keeping the serving policy matched made the (smaller)
quantization gain easier to read.

Before adopting the exemption, I'd also benchmark a smaller FP32 model. The
small Ettin baseline was much faster in the original comparison, at a quality
cost. Whether that's acceptable depends on the task, but compression should earn
the extra moving parts it brings.

{% include ultrabert-investigation.html %}

## What to check before deploying a quantized model

This started as a compression experiment, and what I mostly got out of it is a
way to judge the model that comes out the other end. Targeted interventions
showed where the conversion damaged the checkpoint and whether one exception
could fix it. The serving comparison showed why that fix had to be checked
decision by decision, not just with an overall score.

I put the conversion, exemption and reload checks in a [standalone bert-squeeze
example][example] that works with a public demo checkpoint or your own
classifier. The UltraBERT checkpoint I measured isn't public yet, so you can't
reproduce these exact scores for now. And the projection I kept in FP32 is a
finding about this checkpoint, not a default I'd copy to another encoder.

I still don't know the precise numerical reason that layer is so sensitive. What
I'll take into the next deployment is the process: isolate one change, check
that the fix really recovers the behavior you care about, then measure under
the policy you actually plan to serve. A smaller model with a recovered
benchmark score is a candidate, not a verdict, and the individual predictions
are part of validating it.

[^methods]: The [methods and recorded results](/experiments/ultrabert-batching/evidence/)
    cover the split, label mapping, ablations and runtime pins. The newsletter
    taxonomy has ambiguous mappings, and some source articles still overlap
    after text deduplication. This is a numerical case study on one checkpoint,
    not evidence that it generalizes to future newsletters. I didn't evaluate
    the rescued recipe on test data.

[^measurement]: The paired CPU measurements used the same worker, inputs and
    thread settings. They don't establish production tail latency or runtime
    memory use. A fresh-runtime check matched the final validation scores but
    differed on two diagnostic INT8 scores and on timings. I kept both
    observations on the methods page; I haven't figured out the cause yet.

[previous]: /zero-shot-plateau/
[ultrabert]: https://huggingface.co/dmis-lab/UltraBERT-150M
[pytorch]: https://pytorch.org/blog/quantization-in-practice/
[example]: https://github.com/JulesBelveze/bert-squeeze/blob/539aeaed5fa96789c3c1e7c3c6dcd505e9adba79/examples/selective_quantization/README.md
