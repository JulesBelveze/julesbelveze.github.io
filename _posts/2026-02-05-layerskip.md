---
title: "LayerSkip: Early Exiting Grows up for LLMs"
tags: [ blog, inference ]
mathjax: true
---

LayerSkip: early exiting grows up for LLMs
==========================================

Why do decoder-only language models still run every token through every layer?

In the first post of this series, we looked at early exiting as an underused compression trick. The core idea was simple: easy inputs should not pay the same computational price as hard ones. We then dug into DeeBERT, which showed how to bolt exits onto BERT without redesigning the model. BERxiT pushed the idea further, fixing entropy-based confidence and lifting the "classification only" ceiling.

All three lived in the encoder world. They helped BERT decide when to stop **reflecting**.

LayerSkip moves the problem into a harder setting: **autoregressive generation with decoder-only LLMs**. Here, a bad early decision does not hurt a single prediction. It poisons the entire continuation. And standard LLM pretraining shapes intermediate layers in ways that make naive early exit fall apart.

* * *

## From BERT Exits to LLM Exits

In the **early exiting** post, the target was waste: running the same depth on "2 + 2 = 4" and complex reasoning tasks. The BERT-based methods that followed focused on classification. The model reads an input once, predicts a label once, stops.

DeeBERT answered a narrow but important question: if you freeze a strong encoder and add exits at each layer, how far can you cut computation before accuracy collapses? It kept the backbone intact, trained exits in a second stage, and used entropy as a confidence signal.

BERxiT reacted to the cracks in that setup. Entropy over task logits broke on regression and more complex outputs. Neural nets are also overconfident by default. BERxiT decoupled exit decisions from task predictions with separate exit heads and more careful training.

Decoder-only LLMs complicate this picture in ways I did not fully appreciate until reading the LayerSkip paper:

- They run one forward pass **per token**.  
- Each token depends on every previous token.  
- One wrong token can derail the rest of the sequence.

On these models, naive early exit does not degrade accuracy. It explodes it.

When the Meta team measured perplexity of intermediate Llama layers, they saw a sharp pattern. During standard pretraining, middle-layer perplexity increased over time, climbing from tens to hundreds or thousands. Final-layer perplexity improved, but intermediate layers drifted into a representational space the LM head could not decode.

Looking at token predictions layer-by-layer revealed another problem: **intermediate layers change their minds**. A layer might predict the correct token early, flip to something else in the middle, then flip back. This hesitation burns compute for nothing. The Meta team found that tokens in Llama 7B need an average of 23.45 out of 32 layers, suggesting 26% theoretical savings if you could exit perfectly. But the model was never trained to make that possible.

That is the first big difference from DeeBERT and BERxiT. On BERT-style encoders, you can often add exits to a frozen model and get usable predictions from middle layers. Classification tasks predict **one token** from a few options. Generation tasks predict **many tokens** from thousands of options, and errors compound. On encoders, middle layers hold up reasonably well for classification (MMLU drops from 55% to 49%). On decoders, generation collapses (Natural Questions drops from 25% to near zero). Early exit on LLMs requires retraining.

LayerSkip treats this as a training problem, not an inference trick.

* * *

## The Divergence Problem

Take a 32-layer Llama model. Train it in the usual way. At the end, attach the LM head to every layer and ask each one to predict the next token.

The final layer reaches a familiar perplexity on held-out text, around 4–5. Middle layers sit around three orders of magnitude worse. Perplexity at layer 16 can reach 1000+ on Wikipedia. From the model's point of view, these intermediate representations are not "almost there." They are unreadable.

Why? Standard training optimizes a single objective at the last layer. Every earlier layer learns to produce features that expect further transformation. No one asks them to be predictive on their own. The LM head never sees their outputs.

In the first post, we framed early exiting as a way to teach models computational self-awareness: "Do I know enough yet?" DeeBERT pushed that into practice by adding exits. But on decoder-only LLMs, the model has no way to answer that question. Its internal states at layer 8 or 16 are not aligned with the decoding head.

LayerSkip fixes this in two parts:

1. Change the training path so earlier layers cannot rely on later ones.  
2. Teach the LM head to decode from every layer, not just the last.

The first part is **layer dropout**. The second is **early exit loss**.

* * *

## Layer dropout: forcing earlier layers to carry weight

Layer dropout in LayerSkip is not the usual regularization trick. It rewrites the training contract.

In a standard transformer, each layer always runs. You can think of the model as a fixed ladder of depth 32. During pretraining, most of the interesting work slides up the ladder. Early layers handle local clean-up. Later layers do the heavy lifting.

LayerSkip randomizes that ladder. During training, each forward pass selects a different effective depth:

- Lower layers almost always run.  
- Upper layers run less and less often as you go up.  
- The probability of skipping a layer increases with depth and, in some setups, over training time.

The schedule is exponential, not linear. Experiments show exponential schedules achieve lower loss than constant dropout at equivalent average rates. That makes sense: early layers build the foundation, later layers refine. So the bottom layer has skip probability near zero, the top layer near one, with middle layers on a smooth curve between them.

Over the course of training, the model sees many versions of itself: "12-layer Llama," "20-layer Llama," "28-layer Llama," all sharing the same weights.

Two things happen.

First, upper layers lose their safety net. Since they sometimes disappear during training, earlier layers must learn to produce representations that are useful on their own. The model cannot postpone critical work to the last few blocks.

Second, intermediate states become more stable. When the top of the network sometimes vanishes, the lower part must behave in a way that remains meaningful under different depths. That lines up well with the goal of making intermediate layers readable by the LM head.

Meta's implementation keeps the compute overhead low. They sample dropout per sequence, remove dropped samples before computing each block, then concatenate outputs back. Random seeds synchronize across GPUs so each layer drops the same count of samples. Training cost stays close to baseline.

Layer dropout by itself slows down the divergence of middle-layer perplexity. But the LM head remains trained on final-layer features only. The second ingredient makes every layer speak its language.

* * *

## Early exit loss: training every layer to speak the LM head's language

To make early exit work, you need a decoding head that understands all layers. DeeBERT and BERxiT attached separate classification heads to each exit. LayerSkip does something cleaner: it keeps a **single shared LM head** and teaches it to decode from every layer. One model, one set of weights, one LM head. That matters for deployment.

Conceptually, you can think of this as turning language modeling into a multi-task problem. Instead of one task—"given the final layer, predict the next token"—the model solves a stack of related tasks: "given layer 1, predict the next token," "given layer 2, predict the next token," all the way up to layer 32.

During training, the LM head reads from each layer and computes a standard cross-entropy loss against the same target tokens. These losses are not treated equally:

- Deeper layers receive higher weight, because they have more processing and should be more accurate. The scaling is quadratic to reflect this.  
- Not every layer is supervised at every step. A curriculum turns different layers on and off across training.

The curriculum is the subtle piece. If you try to force every layer to predict from day one, training slows down and final accuracy tanks. This is not an optimization; it is essential. LayerSkip uses two schedules:

- A **gradual** schedule that starts supervising the top layer first, then slowly includes lower layers.  
- A **rotational** schedule that activates a subset of layers at each step (for example every 8th layer), then rotates which subset is active over time.

The rotational version works well in practice because it keeps per-step cost low while still giving every layer plenty of supervised updates.

The contrast with BERxiT is where the extra capacity lives. BERxiT added separate exit heads and predictors while leaving the backbone mostly untouched. LayerSkip keeps one LM head and reshapes the backbone so every layer's activations lie in a space that head can decode.

Layer dropout and early exit loss work together. Dropout forces early layers to be useful because late layers cannot always rescue them. Early exit loss tells early layers what "useful" means by showing them the LM head's objective directly. The result: intermediate representations stay in a region the LM head can actually read.

* * *

## Self-speculative decoding: draft, then verify with the same model

With training solved, you can exit early in two ways:

- Stop at a fixed layer for all tokens.  
- Use that layer as a **draft model** and verify with the full model.

The second mode is **self-speculative decoding**. The early-exiting post compared early exit to branch prediction. Here, that comparison becomes concrete: a cheap draft branch and an expensive verification branch.

The decoding loop looks like this:

1. **Draft phase**  
   Use the first few layers (up to some exit layer) to autoregressively generate a short block of tokens. Cache keys and values for these layers as usual, and keep the query state at the exit layer for the last draft token.

2. **Verify phase**  
   Run the same model on that draft block with all layers active. Reuse the cached states from layers below the exit and continue the forward pass from the exit layer upward. This produces a "verified" block of tokens.

3. **Accept or correct**  
   Compare draft and verified tokens. Accept the shared prefix. At the first disagreement, accept the verified token and discard the rest of the draft. Resume drafting from there.

Classic speculative decoding uses a separate small model for drafting and a large model for verification. That doubles the parameters you need in memory—around 18 GB for a 7B model with a quantized draft. LayerSkip runs both roles with a single model using just 14 GB, a 24% memory reduction, and a single set of caches.

The extra engineering trick is an **exit-query cache** at the exit layer. For each token, the model stores the query vector at that layer. During verification, it resumes attention from that stored query instead of recomputing all lower layers. This gives a direct latency win, on top of the gains from self-speculation itself.

Choosing the exit layer and draft length controls the trade-off:

- Shallow exits and long drafts generate tokens quickly but predict less precisely. That lowers the acceptance rate and increases the number of corrections.  
- Deeper exits and shorter drafts slow down drafting but improve acceptance.

Token acceptance rates tell you a lot about task difficulty. Summarization on CNN/DM reaches 69% acceptance at layer 8. Code generation on HumanEval drops to 45% at the same exit. Summarization tolerates early exit better; code needs deeper processing. Acceptance rate turns out to be a useful diagnostic for how well early exit fits a given task.

Across tasks, this setup yields real speedups without tanking generation quality. The exact numbers vary by model and benchmark, but the pattern holds: early layers can draft well once they have been trained to do so.

This is where the series themes reconnect:

- The **early exiting** post framed adaptive compute as the goal.  
- **DeeBERT** used entropy thresholds for early classification.  
- **BERxiT** introduced learned exits to avoid entropy's blind spots.  
- **LayerSkip** pushes the same instinct into generation, where the cost of a wrong exit compounds along the sequence.

* * *

## Limits and gotchas

LayerSkip solves the "intermediate layers are useless" problem for LLMs, but it does not solve everything.

**You need more training.**
DeeBERT and BERxiT could wrap a pre-trained BERT with exits and finetune. LayerSkip needs continual pretraining or full pretraining with layer dropout and early exit loss. Flipping `assistant_early_exit=8` on a standard Llama checkpoint hurts both speed and quality. Early layers lack the representations needed to draft useful tokens.

**Batching still hurts.**
In the DeeBERT post, batching was the main deployment pain. Different samples want to exit at different layers, while GPUs want uniform work. LayerSkip avoids per-sample exit decisions by fixing the exit layer for drafting, but speculative decoding itself fragments compute. Batching strategies help, but the tension between dynamic compute and static hardware remains.

**Task dependence is strong.**
Classification tasks handle early exit well. Open generation and reasoning tasks see a sharper drop in quality at shallow exits. For production use, you end up choosing exit layers per task or even per endpoint. That is system design, not a universal "fast mode."

**Bigger models are harder to retrofit.**
Llama3 models trained on 8 trillion tokens show stronger specialization of intermediate layers than Llama2 models trained on 2 trillion. My guess: longer pretraining on standard objectives makes intermediate layers more specialized and harder to retrain for early exit without hurting final-layer performance. Continual pretraining with LayerSkip on heavily-trained checkpoints creates a tougher trade-off. The method fits best when integrated into pretraining from the start, not bolted on after.

**Hyperparameters matter.**
Maximum dropout rate, early exit loss scale, and curriculum schedule all affect convergence and final quality. The paper gives sensible defaults, but different model sizes and domains still need tuning.

These are engineering constraints, not showstoppers. Similar constraints kept early exiting "under-hyped" in the first post. The core result stands: with the right training recipe, decoder-only LLMs can support early exit and self-speculation without throwing away accuracy.

* * *

## Where this leaves early exiting

Across the series, the story arcs from a simple complaint—"why run all layers for '2 + 2'?"—to a family of methods that teach models when to stop.

- The **early exiting** post framed the idea and its tension with current hardware and tooling.  
- **DeeBERT** showed that exits on BERT work if you respect training dynamics and separate backbone from exits.  
- **BERxiT** showed that exit decisions need their own heads and objectives when entropy collapses.  
- **LayerSkip** shows that decoder-only LLMs require early exit to be part of pretraining itself, not a wrapper.

What I find interesting is not the speedup alone. Early exiting forces us to surface something latent in deep models: a sense of how much computation a given input deserves. LayerSkip builds that sense into training itself.

If future base models adopt these recipes from day one, every release could ship with native support for early exit and self-speculative decoding. At that point, wasting the same compute on "2 + 2" and multi-step reasoning would look almost quaint.

* * *

## References

[1] Elhoushi, M., Shrivastava, A., Liskovich, D., Hosmer, B., Wasti, B., Lai, L., Aly, A., & Xia, M. (2024). **LayerSkip: Enabling Early Exit Inference and Self-Speculative Decoding**. ACL 2024.  
[2] Meta AI Research. **LayerSkip** GitHub repository.  
[3] HuggingFace. **Faster Text Generation with Self-Speculative Decoding**.  
[4] Xin, J., Tang, R., Lee, J., Yu, Y., & Lin, J. (2020). **DeeBERT: Dynamic Early Exiting for Accelerating BERT Inference**. ACL 2020.  
[5] Xin, J., Tang, R., Yu, Y., & Lin, J. (2021). **BERxiT: Early Exiting for BERT with Better Fine-Tuning and Extension to Regression**. EACL 2021.
