---
title: "Harnesses Are Becoming State"
tags: [ blog, agents, evaluation ]
mathjax: true
---

<img src="{{ '/assets/images/harnesses-becoming-state-cover.png' | relative_url }}" alt="Harnesses Are Becoming State" width="2752" height="1536" loading="lazy">

I recently wrote about the evaluator being the under-hyped part of self-improving agents. Self-evolving agents have picked up real traction, and the object being updated has changed shape along the way. Prompts, memory, skills, sub-agent definitions, and sometimes control flow are becoming persistent, agent-editable state rather than code a team writes once and leaves alone.

That doesn't mean the evaluator problem has gone away, it's the same question, just harder: "Did this edit improve the agent without eroding what the parent could already do?" That's harder than the version I was asking previously, and I want to dig into why.

Until recently, an agent's harness was defined by its prompts, tools, memory, and sub-agent wiring, as code: someone wrote it, shipped it, and it stayed put until a person changed it. Lately, a bunch of projects and labs are landing on a similar move within days of each other. [Prime Intellect's Prime Agent](https://www.primeintellect.ai/blog/prime-agent) formalizes this directly as a `Continual Harness`, prompt, sub-agents, skills, and memory refined online from the agent's own trajectory, and [Harness-R1](https://arxiv.org/abs/2608.02276) goes a step further, training a dedicated policy whose job is to propose harness edits from failure trajectories. Prompts are becoming persistent, agent-edited artifacts rather than fixed text a developer supplied. The system can spawn new sub-agents, rename them, and reuse them later. Skills are becoming records the agent creates and retires on its own. In the more ambitious versions, even the control flow around all of this becomes something the system proposes changes to and, after some review, absorbs.

Nothing is shocking (even though it's quite cool, I admit) about an agent writing or scratching notes. What actually matters is that the note, skill, or routing rule persists, affects later execution, and can become the new default without a human authoring the change.

## What weights already learned the hard way

This isn't the first time a part of the ML stack turned from a fixed, human-authored artifact into something continuously updated and re-shipped. Model weights went through exactly that shift already, and the machinery that grew up around it is worth borrowing from, not because a harness is a model, but because the underlying question is the same: how do you trust a candidate you haven't fully tested yet?

The part of that machinery worth stealing isn't the checkpoint itself, it's what surrounds it. Nobody serious ships a new model by comparing one frozen snapshot to another and calling it a day. The actual pattern is staged: [shadow run](https://atlan.com/know/shadow-deployment-for-ml-models/) the candidate first, feeding it real traffic without letting its answers reach anyone, just to see if it behaves sanely at all. Then give it a small slice of real users, a [canary](https://www.qwak.com/post/shadow-deployment-vs-canary-release-of-machine-learning-models), small enough that a bad surprise is cheap. Only then does it get the rest of the traffic, with the option to pull back at any point. Nothing about that process assumes you can fully judge a candidate before it ever sees the real world. It actually assumes you can't, and builds a way to find out safely instead.

To the best of my knowledge, almost nothing like that exists for harness edits today. An edit either gets applied or it doesn't. There's no shadow phase where a candidate prompt or a new sub-agent routing rule runs alongside the current one on real sessions without affecting the user, and no canary phase where it only touches a fraction of traffic before becoming the default everywhere. Given how cheap harness edits are to make, this staged rollout might actually be easier to build for harnesses than it was for weights.

There's a second, more specific thing worth borrowing. A good chunk of ML has spent years on the problem of [judging a new decision policy using only data collected under the old one](https://proceedings.mlr.press/v48/thomasa16.pdf). The technique works by reweighting old outcomes by how differently the new policy would have acted, and it has one clean, well-documented way of breaking: if the new policy does something the old one never did, there's simply no data to reweight. Comparing a candidate harness against history works fine when the edit is a small variation on established behavior, and it fails precisely when the edit does something genuinely new. So basically, the riskier the edit, the less the past can tell you about it.

Put those two together and the honest version of this section isn't "harnesses need a checkpoint." It's that ML already has two answers to a harder question than the one I was originally asking: how do you evaluate something before you can afford to just try it? Harness-editing systems have adopted neither the staged-rollout habit nor a real accounting of when comparing against history stops being trustworthy.

## Naming the pieces that used to be one thing

A year ago, an agent's full state was just weights plus one fixed harness object, $A_t = (\theta_t, \Sigma_t)$, where $\theta_t$ is the model's weights and $\Sigma_t$ is everything around it (prompts, tools, memory, and control logic a person wrote once and left alone). What's happening now is that $\Sigma_t$ is splitting into four parts that each move on their own:

$$
\Sigma_t := (\rho_t, M_t, T_t, g_t)
$$

where

$$
\begin{aligned}
\rho_t &:= \text{prompt},\\
M_t &:= \text{memory},\\
T_t &:= \text{tool set},\\
g_t &:= \text{control logic}.
\end{aligned}
$$

(leaving out, for simplicity, the rest of the execution state, sub-agent topology, permissions, and so on, that doesn't sit neatly in any one of the four). The weights $\theta_t$ stay fixed while this happens, $\Sigma_t$ is the one being edited.

That decomposition matters for one reason: once $\Sigma_t$ is a product of mutable parts, an update to any one of them changes the behavior of the whole composition, not just the part that changed.

## What it takes to trust an edit

Given that, the interesting question isn't just whether an edit is good, it's that an edit lands on one of four separable pieces while whatever judges it has to weigh what happens to all four together. So it's worth separating proposing an edit from promoting it, and being specific about what each step actually sees. Three things are doing distinct work here: $U$ proposes a candidate edit, $E$ evaluates it, and $G$ decides whether it gets promoted.

$$
\tilde{\Sigma}_{t+1} = U(A_{1:t},\ \tau_{1:t}) \qquad \Sigma_{t+1} = G\Big(\Sigma_t,\ \tilde{\Sigma}_{t+1},\ E\big(\pi_{\theta_t}
$$

$$
(\Sigma_t, \cdot),\ \pi_{\theta_t}(\tilde{\Sigma}_{t+1}, \cdot);\ \mathcal{X}\big)\Big)
$$

$U$ proposes a candidate edit from the trajectory history $\tau_{1:t}$, the running log of past sessions, not a single snapshot. $E$ is the evaluator: it doesn't score the candidate in isolation, it compares parent and candidate side by side under matched conditions, and it returns whether the triggering capability improved, whether anything the parent already handled got worse, and what it cost. $G$ is the gate: it only lets the candidate replace the parent once a minimum improvement on the triggering capability is met, no regression shows up on the anchor tasks, and the cost stays under budget. The key thing is that this isn't just "the one case that prompted the edit looks better."

**TL;DR:** propose locally, then evaluate against the parent on held-out tasks the edit wasn't shaped by, and promote only through the gate.

That comparison is harder to run cleanly than the notation suggests, because matched conditions assume the evaluation itself is replayable. Some environments simply can't be replayed exactly: an external API changes its response between runs, a webpage the agent reads has moved on, a teammate on the other end of a message answers differently the second time. That's on top of the more obvious problem: rerunning parent and candidate on the same tasks without one of them sending a real email or writing to a real database. Where the harness's tools have side effects, or the environment itself isn't static, the gate needs a sandbox, a shadow run, or a restriction to non-destructive, reproducible tasks, otherwise "the same held-out tasks" quietly stops being true for both arms of the comparison. And even a well-built gate only proves the parent's old abilities survived on the specific tasks it happened to check, not on everything the parent could do. Those checks need fresh tasks added over time, otherwise the agent proposing edits can learn exactly what the gate looks for and quietly write around it.

Two further problems show up as soon as $G$ is taken seriously, and neither is solved just by having a gate. First, because an edit can land on any single piece of $\Sigma_t$ while the others stay put, if a prompt edit, a memory write, and a routing change land together, a better or worse outcome doesn't tell you which one caused it, so accepting a bundle isn't the same as being able to diagnose it later. That needs something like an ablation or a leave-one-out replay, not just an aggregate score. Second, every promoted edit changes the distribution of trajectories the harness produces next, which changes the evidence the next edit gets proposed from. A locally reasonable specialization can, over many small steps, quietly erode a capability that's no longer being exercised. A held-out check performed once per edit doesn't catch that. It needs an anchor set of older tasks that gets replayed periodically.

There's a further problem $G$ doesn't fix on its own: $E$ isn't a stable oracle just because it's written down. If the harness can observe how $E$ scores things, or if $E$ is itself learned from the same traces the edits are proposed from, a candidate can learn to look good to $E$ without actually being better, the same Goodhart problem from a year ago, now aimed at the gate instead of the agent. This isn't hypothetical: [Prime Agent's own writeup](https://www.primeintellect.ai/blog/prime-agent) describes exactly this happening in a Factorio benchmark, where the refinement loop that had been building legitimate skills found an exploit and turned to building efficient cheating skills instead, once cheating scored better than the intended goal. And promotion through $G$ only ever governs versioned state; it doesn't undo a tool call, a message already sent, or a memory another session already copied before the edit was rolled back. Rollback restores $\Sigma_t$, not the world.

## Who gets to nominate a failure?

I've been writing $U(A_{1:t}, \tau_{1:t})$ as if the trajectory history were a clean input someone just hands over. It isn't, and it's worth being precise about why it's harder now than it used to be. When a harness was code, you had a commit history: you could reconstruct why a component looked the way it did, and the traces were just evidence you used alongside that record. When the harness is state, $\Sigma_t$ doesn't carry a diff of its own past, the traces are the closest thing left to provenance. Deciding which sessions are worth learning from is, quietly, deciding what the harness's own history is even allowed to mean, and that happens upstream of anything $E$ or $G$ ever sees.

Most sessions don't fail in a way that points at the harness. A user asks for something genuinely hard, the model reasons poorly for reasons that have nothing to do with the prompt or the tools available. Feeding one of those into $U$ as "evidence the harness should change" produces an edit that fixes nothing, or worse, overfits to a one-off. So picking the traces that actually implicate $\Sigma_t$, rather than $\theta_t$ or the task itself, is a judgment call that has to happen before the update rule ever runs, and that ambiguity only got sharper once $\Sigma_t$ stopped being one thing: with $\rho_t, M_t, T_t, g_t$ each independently editable, "was it the harness" quietly hides a second question, "was it which piece of the harness." It's the same attribution problem as credit assignment across components, just one level earlier: before you can ask which part of the harness caused a bad outcome, you have to have already decided the harness was even the right thing to blame.

There's a selection bias hiding in here too. A single dramatic failure, an agent stuck in a loop, a tool call that clearly went wrong, is salient and easy to turn into a proposed edit. A small amount of friction repeated across thousands of ordinary sessions, nothing failing outright, just slightly the wrong tool chosen slightly too often, is exactly the kind of signal that never gets flagged as a candidate trace at all, even though it might matter more in aggregate than the dramatic failure does. If trace selection only surfaces the loud failures, $U$ ends up patching the visible potholes while the slow, distributed inefficiencies never generate a proposal in the first place, which means they never reach $G$ either, gated or not.

And the traces go stale faster than you'd expect. Once an edit is promoted, $\Sigma_{t+1}$ starts producing a different distribution of sessions than $\Sigma_t$ did, so the backlog of traces still sitting around from before the edit is no longer fully representative of how the harness currently behaves. A trace that motivated a fix last week might describe a failure mode the harness doesn't even produce anymore, or might describe one that's newly relevant only because of the last edit. This is barely a problem when a human edits the harness once a quarter and can just eyeball whether the old traces still apply; it becomes a real one once $\Sigma_t$ is allowed to keep rewriting itself without anyone re-grounding the backlog in between. Trace selection isn't a one-time filtering step you do before training $U$, it's a moving target that has to keep up with $\Sigma_t$ itself, which starts to look a lot like the same evaluator problem. Before you can evaluate an edit, you need something that can evaluate whether a trace is even worth learning from.

Nobody has a good answer yet for what a held-out development set even looks like here. In ordinary ML, curating that set is almost a solved ritual: sample it to match production, freeze it, refresh it on a schedule, never let it leak into training. For a harness that keeps changing the very distribution of sessions it produces, it's not obvious a frozen set is even the right shape for the job, versus something more like a rolling, continuously refreshed slice of recent, untouched sessions.

## Building the part nobody built

If harnesses keep moving this way, the thing I'd want sitting next to them is a real version of $G$, built the way described above: parent and candidate compared under matched, ideally sandboxed conditions on the same held-out tasks, with explicit non-regression checks rather than one aggregate score, and an anchor set of older tasks rotated and replayed on a schedule, not just at the moment of promotion. It has to be a runtime gate rather than something closer to a PR review, because there's no guarantee a person is reading the edit before it ships, the harness can propose changes to itself faster than anyone could meaningfully review each one by hand. And underneath that, something that decides which traces are even allowed to generate a candidate edit in the first place, so $U$ isn't just reacting to whichever failure happened to be loudest.

Here's how I'd actually check whether any of this matters: take the same agent and run it three ways. One version never updates its harness at all. One self-edits and auto-promotes every proposal, no gate. One self-edits behind $G$. Give all three the same edit budget and the same amount of time, then test all three on a set of tasks none of them has seen, not the proposer, not the gate, nobody. If the gated version breaks less often on those unseen tasks than the un-gated one, even if it also accepted fewer edits along the way, that's a real signal the gate is doing something. If it doesn't, then I was wrong that moving the evaluator up a level actually helps, and that's worth knowing too. Either way, it wouldn't undo the original prediction, just relocate it: the evaluator gap wouldn't have closed, it would just mean it didn't move to $G$, and I'd still be looking for where it went.
