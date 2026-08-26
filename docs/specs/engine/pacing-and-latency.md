# Pacing, Latency, and Runtime Presentation

**Status:** decisions settled  
**Created:** 2026-08-25  
**Updated:** 2026-08-25 — simulation/replay split accepted  
**Companion to:** `simulation-replay-architecture.md`, `phase-3c-perception.md`, `phase-3c-venue-interactions.md`, `world-engine-2.5.md`

The earlier version of this document treated live simulation pacing as if it had to be the audience-facing pacing. That assumption is now retired.

The binding architecture is:

> **Simulation generates history. Replay presents history.**

See `simulation-replay-architecture.md` for the project-level split. This file keeps the three pacing-related decisions that affect engine implementation.

---

## 1. Known-person salience — DECIDED

Perception does not read relationships or private prose directly.

`attentionHint` remains the only interface by which another layer may increase salience for a known/relevant person.

Today a trivial provider may derive that numeric hint from structured seeded `knows`. After Phase 3D, private memory becomes the authoritative provider.

Binding constraints:

```text
perception receives a number only
perception never receives a person's name from the hint
perception never performs identity recognition
memory/knowledge decides relevance; perception only ranks attention
```

This avoids duplicating relationship truth inside Perception.

---

## 2. Broadcast / carrying voice — DECIDED

The Agent Brain must not have an unrestricted `scope: broadcast` switch.

Speech range is derived from the structured social act.

Conceptually:

```text
greet / ask / reply / chat      -> local speech
order                           -> carrying voice allowed
call_across_park                -> carrying voice allowed
raise_voice with explicit cause -> carrying voice allowed
```

The act vocabulary teaches the distinction structurally. The model does not receive a generic scope knob that it can gradually abuse until every conversation is scene-wide.

The full action vocabulary belongs to later structured-action / Cafe Runtime work. Until then, existing test helpers may still express transport scope directly, but that is not the final Agent Brain contract.

---

## 3. LLM latency — no longer a day-length problem

LLM latency is real wall-clock time and may be long:

```text
3 s     optimistic
8-15 s  ordinary large-model response
20-40 s provider congestion / queueing
```

The World Engine still never waits for inference. An agent continues its deterministic current activity while a request is in flight.

The important correction is that **the audience no longer has to watch this latency live**.

Simulation is allowed to be slow. Replay later compresses provider-wait gaps while preserving causal event order.

Therefore LLM latency does not determine the presentation duration of a day and does not require artificially short conversations or fast attendance rotation.

---

## 4. Simulation day — DECIDED AS CONFIGURATION

A simulation day is for world-generation semantics: attendance, recurring visits and human/director control. It is not a demo editing unit.

Initial unattended configuration may reasonably use approximately:

```text
1 real hour ~= 1 simulation day
```

This value is deliberately not an invariant. Thirty minutes, two hours or another configuration may later prove better.

The human director may request an earlier day transition. A generous automatic rollover can remain as an unattended ceiling.

Consequently:

> **Do not tune `ticksPerDay` so an audience sees every intermittent character in a five-minute viewing session. Replay solves that presentation problem.**

### 4.1 Human direction is recorded input

A human may request:

```text
next day
selected rostered arrival
introduction of an automatic actor
other explicit world-level controls
```

These are external simulation inputs, not direct control of a character's mind.

Any input that changes world history must be recorded with its simulation tick.

The determinism claim is therefore:

> **same seed + same recorded deterministic inputs = same deterministic engine behaviour**

Replay itself reads the committed fact history and does not rerun the simulation.

### 4.2 Graceful departure is later polish

Current attendance/departure mechanics may remove an agent immediately. Once human-requested day transitions are visible in a rendered simulation, a later transition state should make departures visually coherent rather than causing everyone to disappear at once.

This is not a blocker for Phase 3D memory.

---

## 5. Simulation pacing and presentation pacing are different clocks

Simulation owns ticks and causal time.

Replay owns presentation time.

```text
SIMULATION
A speaks
... LLM/provider delay ...
B replies

REPLAY
A speaks
short readable pause
B replies
```

Replay may aggressively remove pure provider latency and idle gaps. It may preserve meaningful visible activity that happened during those gaps.

Binding rule:

> **Replay preserves causality, not provider latency.**

The presentation timeline may use different compression for speech, walking, idle gaps and deterministic cafe work. It does not have to be one global playback-speed multiplier.

---

## 6. Scheduler budget remains a Simulation problem

The simulation still needs a bounded scheduler even though Replay hides latency from viewers.

Twelve agents cannot all receive unlimited expensive requests. A character that is walking, sitting, working or waiting continues that deterministic activity; ordinary low-salience visual changes do not require a new Brain call.

The scheduler must eventually define:

```text
maximum concurrency
provider/token/RPM budget
priority
stale-request cancellation
timeout / limited retry
drop policy for nonessential wakeups
```

Replay does not reduce the generation cost. It only prevents provider latency from becoming presentation latency.

---

## 6b. What running cost actually is, and what it is not

Estimated once properly rather than asserted, because it had been invoked
repeatedly without arithmetic.

Measured inputs: a self sheet averages 1,943 characters; a model-visible
perception package in a seven-person scene is 840 characters of JSON. At Opus 5
rates ($5/M in, $25/M out, cache reads 0.1×), one decision costs roughly
**$0.025 at low effort and $0.06 at default effort**, and latency itself caps
throughput — eleven agents at 15 s per call cannot exceed ~2,640 calls an hour.
That gives **$10–50 an hour realistically and about $165 flat out**.

Two things this corrected:

**The self sheet is not the budget.** It had been described that way repeatedly.
Cache reads are 0.1×, so a stable prefix is about 8% of input cost. **The dynamic
suffix and the output are the cost** — which is why `visibleLimit` and a small
perception package matter, and why they are worth keeping for reasons beyond
tidiness.

**`effort` is the largest single lever and had never been mentioned.** Thinking
tokens bill as output at $25/M, and at default effort they can be several times
the visible reply.

**And the estimate is an upper bound on a scenario that does not occur.** The
owner runs this shape of workload professionally and has not seen a bill over
$100 for it. Measured invoices beat computed ceilings; the arithmetic above is
useful for knowing which knob matters, not for predicting a bill.

Separately: **the game's runtime does not touch a Claude Code subscription at
all.** Backend inference is API billing. Those are two meters, and conflating
them is what produced the earlier warnings.

## 6c. Mixed models across the cast — not a problem

Considered and dropped. Running different characters on different providers was
raised as a risk to the world's consistency of voice. It is not: **the characters
are supposed to sound different.** 菅野 is verbose, 京子 waits until she is sure,
渡辺 does not want to talk. Model-to-model variation lands on top of variation
that is already intended, and is an asset rather than a defect.

This also argues for **3G being a thin, swappable provider adapter** rather than
a Claude-specific integration, so the backend can point at whatever endpoint is
cheapest or free.

## 6d. The finding that actually matters: conversations go cold

From the owner's own experiment, not from theory. Eleven agents each producing
one line in turn, then waiting, then a few replying — **boring to watch, and the
conversation does not sustain itself.**

This is neither a cost problem nor a model-choice problem. Two mechanical causes,
both fixable in 3F:

**Round-robin means nobody is driving.** Real conversation has someone who wants
something and someone avoiding something; giving everyone an equal turn makes
every participant passive. The wakeup policy should be **"who has a reason"**, not
"whose turn is it" — and perception already computes that: `direct_address`
scores 100 against ordinary presence at 30.

**Saying nothing must be a legal choice.** With `nothing` always in the action
menu, a quiet moment becomes a legitimate outcome rather than a failure, and the
deterministic layer fills the picture. Forcing every agent to produce a line is
itself the thing that makes the result read as cold.

There is a third cause the cast was built to avoid: characters go quiet when
nobody has anything at stake. Every character here carries something wanted or
withheld — two silences pointing opposite ways with a graduation clock behind
them, a concealed errand, a venture that has to prove itself, a man who comes
because the house is empty, a man who does not want to learn anyone's name.

> **If conversations still go cold, that is the signal worth reading:** it means
> the self sheets are not putting those stakes into the model's hands, not that
> models cannot converse.

Finally, "boring to watch live" is the observation that produced the
simulation/replay split in the first place. Replay exists to solve exactly it.

## 7. Current decisions

| Topic | Decision |
|---|---|
| known-person salience | `attentionHint` numeric hook only; 3D memory becomes its source |
| broadcast scope | derive from structured act; no unrestricted model `broadcast` knob |
| live latency | acceptable in Simulation; world never blocks |
| day duration | simulation configuration, initially may be ~1 real hour/day |
| human day change | allowed as recorded world-level input |
| audience experience | prefer Replay / Presentation rather than live provider timing |
| replay timing | preserve causality; compress provider wait and boring idle spans |
| structured actions | Brain **selects** from an engine-supplied menu; never authors a schema |
| mixed providers | fine — characters are meant to sound different; 3G is a thin adapter |
| running cost | ~$0.025–0.06 a decision, $10–50 an hour; `effort` and the dynamic suffix are the levers, not the self sheet |
| cold conversation | wake by reason not by turn; `nothing` must always be legal — owned by `phase-3e-conversation.md` §3, §5.1 |

The unresolved question is no longer "what exact day length makes a live demo entertaining?" That requirement has been removed by the two-system architecture.
