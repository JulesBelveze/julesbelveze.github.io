---
title: "Evaluation First: The Hidden Prerequisite for Self-Evolving Agents"
tags: [ blog, agents, evaluation ]
mathjax: true
---

<img src="{{ '/assets/images/evaluation-first-cover.png' | relative_url }}" alt="Evaluation First — the hidden prerequisite for self-improving agents" width="1158" height="1880" loading="lazy">

Most work on self-evolving agents optimizes the update mechanism: how to search for better prompts, extract reusable skills, or consolidate memory. The evaluator those update rules depend on is usually inherited from a benchmark rather than built.

That the evaluator matters is not news. "You can't optimize what you can't measure" is folk wisdom; the RLHF literature has said for years that the reward model, not the policy optimizer, is the bottleneck (Self-Rewarding Language Models opens on exactly this point, and RLAIF and Constitutional AI exist because the reward signal is the hard part). Test-driven development, regression testing, and CI gates encode the same ordering in software. So does every MLOps team that curates an eval set from production traces before touching a model.

This post is not claiming that insight. What it adds is narrower:

1. A **framing**: for the specific case of user-crafted agents on open-ended tasks, the evaluator is not inherited from anywhere, and naming it as a first-class, usually-unbuilt object clarifies why progress there is harder than the software-engineering results suggest.
2. A **recipe**: a concrete way to bootstrap a per-agent regression gate from deployment history with minimal hand labeling, and an honest account of where that recipe stops.

If you already gate every agent change on a curated eval, most of what follows will be familiar and the recipe is the only new part. That is the correct way to read this.

To make this more than "measure before you optimize," here is the prediction the post stands or falls on: take a set of deployed open-ended agents, run an identical scaffold-optimization loop (say GEPA) against (a) a generic benchmark and (b) a per-agent gate built as described below, and hold out a human-labeled per-agent test set as ground truth. The prediction is that (b) produces fewer regressions on the held-out set per unit of measured improvement than (a). If it does not, the recipe adds nothing over the status quo and this post is wrong.

## Why the software-engineering wins don't transfer

The strongest self-improving systems cluster in verifiable domains. Prompt optimizers like GEPA and OPRO search instructions against labeled benchmark examples. Agent Workflow Memory (AWM) mines reusable procedural templates from successful episodes and reports +51.1% relative success on WebArena. ExpeL distills natural-language rules from experience and reports double-digit relative gains over its base ReAct agent across HotpotQA, ALFWorld, and WebShop.

The common thread is not the update rule. It is that each system inherited a free oracle: WebArena hands AWM a binary pass/fail, ALFWorld gives ExpeL a verified completion signal, GEPA scores against labeled examples. None of them had to build the evaluator. Formally, any self-improvement step is:

$$A_{t+1} = U\bigl(A_{1:t},\ E(\pi_{\theta_t,\Sigma_t}\ ;\ \Sigma_t,\ C_t)\bigr)$$

$U$ is the update rule, the part the literature optimizes. $E$ is the evaluator that produces the signal $U$ consumes. In verifiable domains $E$ is a gift. For a user-crafted agent drafting strategy docs, synthesizing research, or coordinating a multi-step workflow, there is no benchmark, no oracle, no pass/fail at the end of a session. $E$ has to be built, per agent, and almost nobody builds it.

What about the systems that do build their own evaluator? The recursive-self-improvement frontier is the real counterexample to "almost nobody builds $E$," and it is worth engaging with directly. ADAS searches over agent designs, Gödel Agent rewrites its own code, and the Darwin-Gödel Machine explicitly co-evolves agents against a performance signal. These systems do confront the evaluator problem head-on, but note which evaluator they build: each still optimizes against a benchmark score (SWE-bench, coding tasks, math) that supplies a verifiable oracle. They build a sophisticated search over $E$-scored candidates; they do not solve the case where no oracle exists to score against in the first place. So they sharpen the point rather than refute it: even the systems most serious about self-modification inherit their ground truth from a verifiable benchmark. The open-ended, per-user case is still unaddressed.

## Why the obvious substitute fails

Open-ended completion is only partly observable. A session that ends with no follow-up could mean a perfect answer or a user who gave up. Outputs are non-deterministic across identical requests, and UI/web environments drift between runs: buttons move, login flows grow a step, pages vanish. By the time an evaluator runs, it may be grading a world that no longer exists. (Hold onto that last point; it comes back to bite our own proposal.)

LLM-as-judge is the obvious substitute, and the evidence on it should make you cautious, with an important caveat about where that evidence comes from. The most striking numbers we have seen (heuristic detectors beating LLM judges by roughly 5:1 on structural failure detection; a context-neglect case where judges scored near zero while an entity-coverage heuristic hit F1 = 0.978) come from a vendor blog post promoting a commercial detection tool, run on Patronus AI's TRAIL benchmark (roughly 148 real agent traces, 841 annotated errors, 20+ failure categories). It is not independent peer-reviewed work and it is a tempting statistic to over-quote. Read it accordingly: it is suggestive, and it is exactly the kind of result a vendor would surface selectively. TRAIL's own headline finding, that even the best LLM judge scores around 11% on the full task, points the same direction.

The finding also cuts two ways. If a cheap deterministic heuristic beats a judge on structural failures, that argues against building an elaborate learned evaluator for those cases; just run the heuristic. The finding we actually want to lean on is narrower and better supported: judges are weakest exactly where they are asked to make holistic, semantic calls, which is most of open-ended evaluation, and they do not degrade gracefully.

Two failure modes are more load-bearing than any single benchmark result:

- **Correlated errors.** When the same model family generates and grades, blind spots are shared, and the judge waves through what the generator produced. This is well documented as self-preference bias.
- **Goodhart under optimization.** The moment a judge becomes an optimization target, the agent learns to produce outputs that look right to the judge rather than are right. This is reward-model overoptimization (Gao, Schulman & Hilton quantify the gold-score decay as you optimize the proxy). The judge does not hold steady as the loop runs; it gets worse, because the optimizer is actively working against it.

## Building the evaluator first

The right ordering is to build $E$ before you lean on $U$. But "$E$" means two different things with two different confidence levels, and conflating them is the main way this idea goes wrong:

- **A regression gate**: did this proposed change degrade behavior the agent was already good at? This is constructible from history, and it is the whole of what this recipe delivers.
- **An improvement driver**: is this change better on what users actually need? This is a stronger claim, and the recipe below does not support it.

The construction is to watch an agent's sessions for signals in both directions.

- **Positive signals** (candidate successes): the user accepted the response without correcting it, reused the agent for a similar task, ended the session without rephrasing.
- **Negative signals** (candidate failures, essential rather than optional): the user corrected the output, retried, rephrased in frustration, or abandoned the session mid-task.

The negative signals matter because a set built only from successes certifies the status quo and is blind to the failures that never generated a success signal, the single biggest weakness of the naive version of this idea. Mining abandonment and correction directly is how you avoid a golden set that only knows what the agent already does. All of these signals are noisy and biased (the implicit-feedback literature established that reformulation and abandonment are confounded by presentation and position effects), so they are treated as candidates to be filtered, never as labels.

A critic model then probes each candidate. Two things matter here that the naive version glosses:

1. **What the critic is allowed to do.** It does not invent new tasks with unknown correct answers, which would smuggle back the oracle problem. Instead it applies metamorphic and invariance checks anchored to the original interaction: paraphrase the request (the answer should not change), add an irrelevant constraint (the answer should be robust), reorder entities the user named (all should still be covered). No new oracle required. Note the ceiling: invariance is not correctness. If the original answer was plausibly-but-subtly wrong, a paraphrase-invariant answer is still wrong; the metamorphic layer hardens against brittleness, not against a confidently-wrong anchor.
2. **The cross-family assumption is a hypothesis, not a fix.** Using a critic from a different model family is intended to reduce correlated errors, but this is reduction, not elimination: different families still share pretraining data and preference-tuning conventions, and there is evidence that reward hacking can transfer across judge families and survive ensembling. We treat cross-family as a mitigation to measure, not a solved problem.

A simpler version of this recipe would claim no hand-labeled data is needed at all. That is overstated. The regression gate itself (metamorphic invariances anchored to observed successes and failures) needs no hand labels, and that is the real efficiency claim. But two things around it do need humans: genuinely novel edge cases the critic surfaces are routed to a human review queue rather than auto-labeled, and the whole pipeline is calibrated against a small human-labeled audit set to estimate its error rate before anyone trusts it as a gate. Not label-free; label-light.

Survivors of both the signal filter and the critic become a per-agent test set, built from that agent's own history. Per-agent matters because a competitive-intelligence agent and an internal-scheduling agent have different task distributions and failure modes; pooling them yields a gate that fits neither.

## What it costs and what it risks

The gate runs between deployments, not in the request path, so the latency cost to the user is zero. The compute cost is not. Every candidate scaffold change runs the golden set through a separate critic model, per agent, per change. Across a fleet of thousands of agents that becomes a real recurring inference bill, and a naive implementation gates slowly. A workable version needs tiered gating (cheap deterministic checks first, the expensive critic only on what survives them), plus sampling, with the coverage that sampling drops logged openly rather than hidden.

There is also a privacy surface worth naming. The gate is built from user interaction history, which demands per-user isolation, PII scrubbing before the critic ever sees a trace, retention limits, and an opt-out. It also makes the "seed a thin agent's gate from similar agents" idea genuinely dangerous, because it risks leaking one user's data into another's evaluator. We would not ship cross-agent seeding without a data-governance model we do not yet have.

## What a reliable gate unlocks, and what it doesn't

With a trustworthy per-agent regression gate, the $U$ mechanisms the literature already built become safer to run: GEPA, OPRO, and DSPy can search against the per-agent set instead of a generic benchmark, and skill refinement and memory consolidation get a regression check before anything ships.

One caution: optimizing $U$ against a fixed golden set is textbook Goodhart. Run GEPA against the same set long enough and it overfits the set rather than the user. The mitigation is to hold out a rotating, critic-refreshed partition that $U$ never sees, and to monitor the divergence between the gated score and the held-out score; when they separate, the optimizer is gaming the gate. A gate is a regression guardrail; it is not, on its own, a hill worth climbing.

All of this operates on $\Sigma$ (the scaffold: prompts, memory, skill instructions, tool configs, workflow topology) rather than $\theta$, the weights. For deployed, per-user, often closed-weight agents, the scaffold is the only surface you can touch. The upside is that every element of $\Sigma$ is versionable, rollback-able, and testable without retraining, and the gate covers all of it.

## What we're still figuring out

Several parts of this are genuinely unsettled.

Proxy validity is the first. If the positive- and negative-signal classifiers proxy user satisfaction badly, the gate encodes engagement rather than correctness. Settling this requires an audit against human labels on real deployed agents, which we have not done.

Cold start is the second. Below roughly 30 sessions the set is too thin to discriminate. New agents therefore ship changes ungated, which is exactly when changes are riskiest. Cross-agent seeding is the obvious fix, and the privacy problem above is why it is not obviously safe.

Drift is the third, and it is symmetric with our own critique of the alternatives. A set built from an agent's first six weeks misses the tasks users bring in month four, and the "grading a world that no longer exists" problem we raised against LLM judges applies to our static set just as much. It needs a refresh policy: a sliding window, staleness detection that retires tests whose environment fingerprint has changed, and continuous re-mining. We have not characterized the right cadence.

Fixability is the fourth. Not every surfaced failure is fixable at the scaffold level; some are model-capability ceilings that no prompt, memory, or skill change can move. An evaluator that cannot separate the two sends effort to the wrong place, and we have not built that classifier.

The last is cross-agent generalization. A fix that clears one agent's set may not carry to another doing similar work, and we do not know how to distinguish a genuinely general fix from a context-specific one, or how to move it safely.

## Where to go from here

The self-evolving-agent literature has produced strong $U$ mechanisms on top of inherited oracles, including the recursive-self-improvement systems that build their own search but still score against a benchmark. The gap we care about is narrower: for agents deployed on tasks nobody specified in advance, the evaluator has to be constructed rather than assumed, and at a per-agent granularity. The contribution here is the specific construction (implicit bi-directional signals, metamorphic critic augmentation, cross-family hardening, per-agent scoping, label-light but not label-free) and the falsifiable prediction that it reduces regressions per unit of improvement against a real held-out set.

The defensible advice, stripped of everything unproven: validate your signal before you optimize against it, mine failures as carefully as successes, and never co-train the judge and the policy in the same model family. If you are building self-improving agents in production and have gone at the evaluator differently, we would like to compare notes.

*Further reading: Self-Rewarding Language Models · Constitutional AI / RLAIF · Scaling Laws for Reward Model Overoptimization (Gao, Schulman & Hilton) · TRAIL benchmark (Patronus AI) · Metamorphic testing literature · ADAS · Gödel Agent · Darwin-Gödel Machine · GEPA · AWM · ExpeL*
