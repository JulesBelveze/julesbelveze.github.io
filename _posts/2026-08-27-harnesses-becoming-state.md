---
title: "Harnesses Are Becoming State"
tags: [ blog, agents, evaluation ]
date: 2026-09-08
last_modified_at: 2026-09-08
mathjax: true
---

<img src="{{ '/assets/images/harnesses-becoming-state-cover.png' | relative_url }}" alt="Harnesses Are Becoming State" width="2752" height="1536" fetchpriority="high">

I recently wrote about the evaluator being the under-hyped part of self-improving agents. Self-evolving agents have picked up real traction, and the object being updated has changed shape along the way. Prompts, memory, skills, sub-agent definitions, and sometimes control flow are becoming persistent, agent-editable state rather than code a team writes once and leaves alone.

That doesn't mean the evaluator problem has gone away, it's the same question but harder: "Did this edit improve the agent without eroding what the parent could already do?" That's harder than the version I was asking previously, and I want to dig into why.

Until recently, an agent's harness was defined by its prompts, tools, memory, and sub-agent wiring, all defined as code. Someone had to write it, ship it, and it stayed put until a person changed it. Lately, a bunch of projects and labs are landing on a similar move. [Prime Intellect's Prime Agent](https://www.primeintellect.ai/blog/prime-agent) formalizes this directly as a `Continual Harness`: prompt, sub-agents, skills, and memory refined online from the agent's own trajectory. [Harness-R1](https://arxiv.org/abs/2608.02276) goes a step further, training a dedicated policy whose job is to propose harness edits from failure trajectories.

Prompts are becoming persistent, agent-edited artifacts rather than fixed text a developer supplied. The system can spawn new sub-agents, rename them, and reuse them later. Skills are becoming records that the agent creates and retires on its own. In the more ambitious versions, even the control flow around all of this becomes something the system proposes changes to and, after some review, absorbs.

There is nothing surprising, even though it's quite cool, about an agent writing or scratching notes. What matters is that the note, skill, or routing rule persists, affects later execution, and can become the new default without a human authoring the change.

When the harness is code, a person changes a file and deploys a new version. There is a diff, a review, and a moment when the new version goes live.

When the harness is state, the lifecycle is different. The agent can write a memory, update a prompt, or change a routing rule while it is working. That change is there in the next session and will affect what the agent does. The evaluator now has to judge the change before it becomes part of the agent's default behavior.

Basically, a harness represented as code can be reviewed before deployment. A harness represented as state has to be trusted across the transitions that keep changing it. That is the problem this post is trying to describe.

## What weights already learned the hard way

This isn't the first time a part of the ML stack moved from a fixed artifact to a sequence of versioned states. Model weights went through that transition already, and the machinery that grew up around it is worth borrowing from. A harness is definitely not a model, but both raise the same operational question: *How do you trust the next state before making it the default?*

The useful part is everything around the checkpoint. Nobody ships a new model by comparing one frozen snapshot to another and calling it a day. The pattern used in practice is staged: [shadow run](https://atlan.com/know/shadow-deployment-for-ml-models/) the candidate first, feeding it real traffic without letting its answers reach anyone, just to see if it behaves sanely.

Only then give it a small slice of real users, a [canary](https://www.qwak.com/post/shadow-deployment-vs-canary-release-of-machine-learning-models), small enough that a bad surprise is cheap. Only then does it get the rest of the traffic, with the option to pull back at any point. This process assumes that a candidate cannot be fully judged before it sees the real world. It gives you a way to find out safely.

To the best of my knowledge, almost nothing like that exists for harness edits today. An edit either gets applied or it doesn't. There's no shadow phase where a candidate prompt or a new sub-agent routing rule runs alongside the current one on real sessions without affecting the user, and no canary phase where it only touches a fraction of traffic before becoming the default everywhere.

Given how cheap harness edits are to make, this staged rollout might actually be easier to build for harnesses than it was for weights.

ML has also spent years on the problem of [judging a new decision policy using only data collected under the old one](https://proceedings.mlr.press/v48/thomasa16.pdf). The method reweights old outcomes according to how differently the new policy would have acted. It has a clean failure mode: if the new policy does something the old one never did, there is no data to reweight.

Comparing a candidate harness against history works when the edit is a small variation on established behavior. It fails precisely when the edit does something genuinely new. The riskier the edit, the less the past can tell you about it.

Put together, these patterns suggest a more useful question than "Do harnesses need a checkpoint?" ML has developed ways to evaluate a candidate before exposing it to the world. Harness-editing systems have adopted neither the staged rollout nor a clear account of when comparisons against history stop being trustworthy.

## Naming the pieces that used to be one thing

As mentioned earlier, a year ago, an agent's harness was one fixed object around the model: its prompts, memory, tools, and control logic. Someone wrote those pieces, tested them, shipped them, and left them alone until the next deliberate change.

What's happening now is that the harness itself is becoming persistent state. It can be divided into four broad categories:

- **Prompts and instructions**
- **Durable memory**
- **Tools and tool configuration**
- **Control logic**, including routing, retries, and stopping rules

Sub-agent topology, permissions, and other execution details sit around these categories without fitting exactly into just one of them.

Each piece can change independently while still affecting the behavior of the whole composition. A memory update can alter which tool gets selected. A routing change can alter which skill gets retrieved. A prompt edit can change how the agent interprets the same tool result. The editable object is composed of parts, but the behavior those parts produce is joint.

<img src="{{ '/assets/images/harness-research-note.png' | relative_url }}" alt="Harness as code compared with harness as persistent state" width="2152" height="1275" loading="lazy">

## What it takes to trust an edit

Once the harness is state, each session can potentially produce a new version of that state. Three roles need to be separated:

- **The proposer $U$** looks at past sessions and suggests an edit.
- **The evaluator $E$** compares the current harness with the candidate on held-out tasks.
- **The gate $G$** decides whether the candidate becomes the new state.

In compact form:

$$
\text{candidate} = U(\text{past sessions})
$$

$$
\text{evaluation} = E(\text{parent},\ \text{candidate},\ \text{held-out tasks})
$$

$$
\text{new state} = G(\text{parent},\ \text{candidate},\ \text{evaluation})
$$

The evaluator does not score the candidate in isolation. It compares the parent and candidate under matched conditions, using held-out tasks that did not shape the edit. It asks whether the triggering capability improved, whether anything the parent already handled got worse, and what the change cost.

The gate promotes the candidate only when the evidence is good enough. The one case that prompted the edit looking better is not enough.

**TL;DR:** propose locally, evaluate against the parent on held-out tasks, and promote only through the gate.

That comparison is harder to run cleanly than the workflow suggests because matched conditions assume the evaluation itself is replayable. Some environments simply can't be replayed exactly: an external API changes its response between runs, a webpage the agent reads has moved on, or a teammate on the other end of a message answers differently the second time.

That's on top of the more obvious problem: rerunning parent and candidate on the same tasks without one of them sending a real email or writing to a real database. Where the harness's tools have side effects, or the environment itself isn't static, the gate needs a sandbox, a shadow run, or a restriction to non-destructive, reproducible tasks.

Otherwise, "the same held-out tasks" quietly stops being true for both arms of the comparison. Even a well-built gate only proves that the parent's old abilities survived on the specific tasks it happened to check, not on everything the parent could do. Those checks need fresh tasks added over time. Otherwise, the agent proposing edits can learn exactly what the gate looks for and quietly write around it.

The gate also leaves two problems unresolved.

First, because an edit can land on any single piece of the harness while the others stay put, a prompt edit, a memory write, and a routing change can arrive together without telling you which one caused the outcome. Accepting a bundle isn't the same as being able to diagnose it later. That needs something like an ablation or a leave-one-out replay, not just an aggregate score.

Second, every promoted edit changes the distribution of trajectories the harness produces next. That changes the evidence available for the next edit. A locally reasonable specialization can, over many small steps, quietly erode a capability that's no longer being exercised. A held-out check performed once per edit doesn't catch that. It needs an anchor set of older tasks that gets replayed periodically.

The evaluator also is not a stable oracle just because it is written down. If the harness can observe how the evaluator scores things, or if the evaluator is learned from the same traces used to propose edits, a candidate can learn to look good without actually being better. It is the same Goodhart problem from a year ago, now aimed at the gate instead of the agent.

This isn't hypothetical: [Prime Agent's own writeup](https://www.primeintellect.ai/blog/prime-agent) describes this happening in a Factorio benchmark. The refinement loop had been building legitimate skills, then found an exploit and started building efficient cheating skills once cheating scored better than the intended goal.

Promotion through the gate only governs versioned state. It doesn't undo a tool call, a message already sent, or a memory another session already copied before the edit was rolled back. Rollback restores the previous harness state, not the world.

<img src="{{ '/assets/images/evaluation-pipeline-flowchart.png' | relative_url }}" alt="Evaluation pipeline proposing an edit, comparing it with the current harness, and promoting or rejecting it" width="2152" height="1768" loading="lazy">

## Who gets to nominate a failure?

I wrote about the proposer as if the trajectory history were a clean input someone just hands over. It isn't, and it's worth being precise about why it's harder now than it used to be.

When a harness was code, you had a commit history: you could reconstruct why a component looked the way it did, and the traces were evidence you used alongside that record. When the harness is state, the current harness is the result of a sequence of transitions, and the traces are part of the provenance for those transitions.

Deciding which sessions are worth learning from is also deciding what the harness's own history is allowed to mean. That happens before the evaluator or the gate ever sees anything.

Most sessions don't fail in a way that points at the harness. A user asks for something genuinely hard, or the model reasons poorly for reasons that have nothing to do with the prompt or the tools available. Feeding one of those into the proposer as "evidence the harness should change" produces an edit that fixes nothing, or worse, overfits to a one-off.

So picking the traces that actually implicate the harness, rather than the model or the task itself, is a judgment call that has to happen before the update rule ever runs. That ambiguity got sharper once the harness stopped being one thing. With prompts, memory, tools, and control logic each independently editable, "was it the harness" quietly hides a second question: "was it which piece of the harness?"

It's the same attribution problem as credit assignment across components, just one level earlier. Before you can ask which part of the harness caused a bad outcome, you have to have already decided the harness was even the right thing to blame.

There's a selection bias hiding in here too. A single dramatic failure, an agent stuck in a loop, or a tool call that clearly went wrong is salient and easy to turn into a proposed edit. A small amount of friction repeated across thousands of ordinary sessions, nothing failing outright, just slightly the wrong tool chosen slightly too often, is exactly the kind of signal that never gets flagged as a candidate trace at all, even though it might matter more in aggregate than the dramatic failure does.

If trace selection only surfaces the loud failures, the proposer ends up patching the visible potholes while the slow, distributed inefficiencies never generate a proposal in the first place. They never reach the gate either, gated or not.

The traces also go stale faster than you'd expect. Once an edit is promoted, the harness starts producing a different distribution of sessions than it did before, so the backlog of traces from earlier versions is no longer fully representative of how the harness currently behaves.

A trace that motivated a fix last week might describe a failure mode the harness doesn't even produce anymore. It might also describe one that has become relevant only because of the last edit.

This is barely a problem when a human edits the harness once a quarter and can eyeball whether the old traces still apply. It becomes a real one once the harness is allowed to keep rewriting itself without anyone re-grounding the backlog in between.

Trace selection isn't a one-time filtering step before training the proposer. It has to keep up with the harness itself, which starts to look a lot like the evaluator problem. Before you can evaluate an edit, you need something that can evaluate whether a trace is worth learning from.

Nobody has a good answer yet for what a held-out development set even looks like here. In ordinary ML, curating that set is almost a solved ritual: sample it to match production, freeze it, refresh it on a schedule, and never let it leak into training.

For a harness that keeps changing the distribution of sessions it produces, it's not obvious that a frozen set is even the right shape for the job. A rolling, continuously refreshed slice of recent, untouched sessions might make more sense.

## Building the part nobody built

If harnesses keep moving this way, the thing I'd want sitting next to them is a real version of the gate: a runtime process that compares a candidate with its parent under matched, ideally sandboxed conditions, checks for regressions on older tasks, and promotes the candidate only when the evidence is good enough.

It would also need an upstream process that decides which traces are allowed to generate candidate edits in the first place. Otherwise, the proposer is just reacting to whichever failure happened to be loudest.

Here's how I'd actually check whether any of this matters: take the same agent and run it three ways.

1. **Fixed harness:** the agent never updates its harness.
2. **Ungated self-editing:** the agent proposes edits and automatically promotes every one.
3. **Gated self-editing:** the agent proposes edits, but every candidate goes through the evaluator and the gate.

All three versions should start from the same model and initial harness. Give them the same amount of time and the same edit budget, then test them on a set of tasks none of them has seen, including the proposer and the gate.

If the gated version breaks less often on those unseen tasks than the ungated one, even if it accepted fewer edits along the way, that's a real signal that the gate is doing something. If it doesn't, then I was wrong that moving the evaluator up a level actually helps, and that's worth knowing too.

Either way, it wouldn't undo the original prediction, just relocate it: the evaluator gap wouldn't have closed, it would just mean it didn't move to the gate, and I'd still be looking for where it went.
