# Phase 3E — Offered-Floor Clarifications

**Status:** binding clarification / implementation gate  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Applies to:** `phase-3e-conversation.md`, `phase-3e-implementation-structure.md`, `social-personality.md`  

This document closes five edge cases found after the 3E architecture was rebuilt around **one offered floor per zone**.

Where this file is more specific than either Phase 3E document, **this file wins**.

---

## 1. Addressed priority requires actual audibility

A directed utterance and a successful conversational handoff are not the same thing.

The committed utterance may say:

```text
speaker   A
addressed B
```

but 3C still decides whether B actually heard it. A zone is a scheduling construct, not an audibility boundary.

Therefore:

> **`addressed` grants Rank 1 floor priority only if the addressed entity is present in that utterance's `heardBy`.**

Conceptually:

```text
A selects ask(B)
  -> speech_said is committed
  -> heardBy is computed through perception.canHear(...)

if B in heardBy:
  floor.addressed = B
  B receives Rank 1 on the next offer
  ask(B) may create openQuestion

if B not in heardBy:
  the fact may still record addressed = B
  floor.addressed is NOT set from that utterance
  no Rank 1 conversational priority is created
  no openQuestion is created
```

This prevents a Brain from receiving `why = addressed` for words that do not appear in its own rendered transcript.

The same rule applies to deterministic targets. A human may visibly call toward the dog, but an animal-directed response path is only evaluated under the act's own physical/runtime rules; conversation must not pretend audibility succeeded merely because a target id existed.

Required test:

```text
A and B are in the same large zone but beyond local hearing distance.
A selects ask(B).
B is not offered Rank 1 and does not see the utterance in transcriptFor(B).
The same act with a transport that makes B audible does grant Rank 1.
```

---

## 2. Committed speech facts are the transcript source of truth

The authoritative conversation history is the committed `speech_said` fact stream.

`Floor` must **not** own an authoritative second copy of the transcript.

The conceptual `Floor` shape in `phase-3e-implementation-structure.md` §2.1 is therefore refined as follows:

```text
Floor
  ...
  lastSpeechTick
  lastSpeaker
  addressed
  openQuestion
  quietRounds
  transcriptCursor / bounded fact refs / disposable derived cache   optional
```

If implementation keeps a bounded `transcript` array for performance, it is explicitly:

```text
derived
non-authoritative
disposable
rebuildable from committed speech facts
never a recording source
never a replay source
```

`transcriptFor(observerId)` renders from the authoritative committed utterances plus the utterance's stored `heardBy` / observer-safe identity rendering.

> **Facts are truth; a Floor transcript is at most a cache.**

Required test: destroying and rebuilding all Floor working/cache state from the same committed facts produces the same model-visible transcript.

---

## 3. A losing parallel offer is counterfactual and commits nothing

Open-floor batches may offer the floor to `K > 1` Brains in parallel to hide provider latency. More than one Brain may choose to speak.

The highest-ranked taker wins. Every lower-ranked taker is a **counterfactual result**.

For a losing response, the system may write an audit record such as:

```text
floor_lost
```

but it must commit **nothing from the returned Brain proposal**.

Specifically, a losing response must produce none of the following:

```text
speech_said
world/social action
memory proposal
label learning
relationship/recognition change
private episode or interpretation
openQuestion mutation
animal-directed action
cafe/domain action
any renderer-visible fact
```

The losing Brain did not act in the world. Its generated prose is not something the character remembers having said or decided.

If provider/result telemetry is retained for debugging, it belongs only to implementation diagnostics/audit and must never be confused with character memory or world history.

> **Only the winning offered response crosses the commit boundary.**

Required test: two parallel Brains both propose speech and private memory; only the higher-ranked winner changes facts or private memory. The loser's only observable trace is audit/diagnostic metadata.

---

## 4. Dormant floors re-arm only on socially salient events

`phase-3e-implementation-structure.md` §4 currently says a dormant floor re-arms on an event. This must not mean "any deterministic activity transition in the zone".

Cafe and movement runtimes may generate many mechanically correct events that should not repeatedly poll every Brain nearby.

3E therefore owns an explicit **social re-arm whitelist**. Initial semantic classes are:

```text
person entered the zone
person left the zone
seat / social place became occupied
seat / social place was released
a new directed or loud speech event changed the local social situation
an order was placed / a customer directly requested service        (3F-A)
an addressable animal produced a notable visible event
human director input affecting the zone or its people
```

The exact fact names may differ; the semantic whitelist is binding.

The following do **not** re-arm a dormant floor merely because they occurred:

```text
routine preparation step advanced
pathfinding/movement micro-step
workstation timer advanced
item changed from preparing to almost-ready
routine return-to-workstation transition
internal queue bookkeeping
other deterministic activity progress with no new social affordance
```

A later runtime may add a re-arm event, but it must opt in explicitly by documenting why that event changes what somebody might reasonably want to say.

> **Dormancy is broken by a new social situation, not by background machinery moving.**

Required test: many routine deterministic cafe/activity transitions occur in a dormant zone and generate zero offers; a whitelisted social event immediately re-arms it.

---

## 5. Ownership boundary: 3E ranks the floor; 3F-B schedules providers

The offered-floor rewrite gives `socialWeight()` an immediate consumer. Ownership is therefore now explicit.

### Phase 3E owns

```text
zone floor qualification and state
who is conversationally eligible in that zone
Rank 1 addressed priority (subject to §1 audibility)
openQuestion priority
socialWeight(traits, situation)
rank order within an offered-floor round
tie-breaking for floor rank
K / batching semantics at the conversation layer
winner selection by rank
```

### Phase 3F-B owns

```text
global concurrent request limit
provider/API request queues
cross-zone and cross-system request priority
quota/rate-limit policy
retry policy
provider timeout implementation
dropping/defer policy under global budget pressure
provider adapter dispatch
```

3F-B may delay or decline to dispatch an offer because of global resource policy, but it must not silently rerank the characters inside a zone according to a second personality policy.

Conversely, 3E must not grow provider quota/concurrency logic merely because it creates offers.

> **3E decides who should get the conversational floor. 3F-B decides when the infrastructure can service that offer.**

`socialWeight()` therefore belongs to 3E and remains a pure deterministic function. Global scheduler priority remains a separate 3F-B concern.

---

## 6. Consequent `openQuestion` rule

Because §1 makes audibility part of a successful conversational handoff, `openQuestion` is refined too:

```text
ask(target)
AND target in utterance.heardBy
  -> openQuestion = { asker, asked: target, sinceTick }

ask(target)
AND target not in utterance.heardBy
  -> no openQuestion
```

A question nobody heard cannot become a conversational debt.

The existing clearing rules remain unchanged once an open question legitimately exists.

---

## 7. Implementation gate additions

Before Phase 3E is considered complete, scripted/mutation tests must cover all of the following in addition to the existing acceptance list:

1. addressed-but-unheard does not create Rank 1 priority or `openQuestion`;
2. Floor transcript cache can be deleted/rebuilt without changing `transcriptFor()` output;
3. parallel losing Brain proposals commit nothing, including private memory;
4. routine deterministic event storms do not re-arm a dormant floor;
5. a whitelisted social event does re-arm it;
6. floor ranking is stable under 3F-B/provider timing differences — infrastructure timing never changes the rank-defined winner.

These are pre-implementation contract tests, not optional polish.
