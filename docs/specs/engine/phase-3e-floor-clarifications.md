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

---

## 8. Consequences found on review

Added on review of §1–§7. Each of the four below follows from a clarification
above and is not closed by it. §1–§7 are unchanged and still win.

### 8.1 §2 forces `heardBy` into the fact stream

§2 requires that destroying the Floor cache and rebuilding it from committed
facts reproduces the same `transcriptFor()` output. `transcriptFor()` filters by
`heardBy`. So `heardBy` has to survive the cache being thrown away.

It cannot be recomputed at rebuild time: audibility depends on where everybody
was standing at *that* tick, and recovering those positions means replaying
movement, which is re-simulation and is forbidden.

Therefore:

> **`speech_said` carries `heardBy`, computed once at commit.**

The same argument that kept `zone` on the fact (`phase-3e-implementation-
structure.md` §6) applies here more strongly. It is server-side truth — who was
in earshot really is a property of the world — and no model ever reads a fact.

Two things fall out of computing it at commit rather than later:

- **positions are current**, which is the only moment the answer is cheap and
  correct;
- **perception reads it instead of recomputing it.** `canHear` is then evaluated
  in exactly one place per utterance, which is the §7 single-implementation rule
  of the structure document taken all the way rather than most of the way.
  Perception still computes its own *saw-but-did-not-hear* branch, which is a
  different question.

`heardBy` is computed over **every present agent**, not only the zone's, because
a loud act reaches past the zone edge. That does not put a cross-zone listener
into anybody's transcript: `transcriptFor()` renders the observer's **own**
floor, and an utterance overheard from another zone reaches them through
perception. Transport is not membership (`phase-3e-conversation.md` §4), and this
is the place that rule would most easily be lost.

### 8.2 §3 leaks perceived events unless delivery moves to settlement

This is the one that silently loses data.

Building a Brain context **drains** that observer's perception queue —
`phase-3c-implementation-clarifications.md` §2.2: *once an event has been
included in a successfully constructed context it is considered delivered even
if inference later fails.* That rule exists so a failed call does not make an
agent hear the same old sentence again on every retry, and it was correct while
every context led to a turn.

Parallel offers break it. Offer to three, one wins: **the two losers have had
their queues drained for a turn they never took.** Nothing tells them again. A
sentence spoken to 澄子 can vanish because she happened to be offered a floor at
the same moment as somebody who outranked her — and §3 is right that the loser
commits nothing, which is exactly why the drain must not stand.

The boundary moves from *context built* to *offer settled*:

```text
answered (speech, or nothing)   -> delivered
timed out / provider error      -> delivered      unchanged; do not resend
lost the floor                  -> NOT delivered  events return to the queue
dropped before use              -> NOT delivered  the context was never used
```

Mechanically: `contextFor()` provisionally removes the events and the offer
carries its epoch; `settle(epochId, { delivered })` either drops them or returns
them. Restoration re-inserts by `seq`, so order is exact and deterministic; if
the queue then exceeds `queueLimit`, the ordinary eviction rule applies — oldest
unprotected first, and a `direct_address` is never the one dropped.

3D needs no change and that is the payoff of its cursor: memory already ingested
those events without draining, so returning them to the queue cannot make
anything be remembered twice. The two consumers were built with different rights
precisely so one of them could be rolled back.

Required test: three parallel offers, two losers, and every event in the losers'
queues is still pending afterwards — including the utterance that was addressed
to one of them.

### 8.3 §4's whitelist has to live in one place, and it is not a list in 3E

§4 is right that background machinery must not re-arm a floor, and right that a
later runtime opts in explicitly. But a whitelist maintained *inside 3E* is a
list that 3F-A will forget to update, and the failure is silent in the expensive
direction: a new cafe fact quietly polls eleven Brains.

So it is a **property of the fact type, declared where the fact is defined**, and
3E reads it:

```text
a fact type not marked social never re-arms a dormant floor
marking one is a one-line, reviewable opt-in by whoever added the fact
the default for anything new is: not social
```

One refinement to §4's list. *Seat / social place became occupied or released* is
whitelisted, but the same events fire for **stations** — the shopkeeper claiming
her workstation is the machinery §4 exists to exclude. Seats and stations are
deliberately one thing to a reservation (`resources.js`), so the whitelist
discriminates on `kind === SEAT`, not on the event name.

### 8.4 A dropped offer is a recorded input

§5 says 3F-B may decline to dispatch under budget pressure and must not rerank.
Both hold. But a dropped offer does change who speaks — the round moves on and
the next-ranked character takes the floor — so infrastructure pressure is a real
input to world history.

That is legal and already has a home: `pacing-and-latency.md` §4.1 requires any
input that changes world history to be recorded with its simulation tick, the
same treatment human director input gets. So:

```text
a dropped offer resolves as a DECLINE, and the round continues
the drop is recorded with its tick
determinism claim: same seed + same recorded choices AND drops = same stream
```

Without the recording, §7.6's *infrastructure timing never changes the
rank-defined winner* is true only while nothing is ever dropped. With it, the
claim is exact: **timing never changes the winner; a recorded drop changes who
was eligible, and replays identically.**

### 8.5 The dog's audibility is the same question

§1's closing paragraph is right that an animal-directed act must not assume the
target heard it. That needs no new mechanism: `dog-01` is a present agent, so

```text
canHear('dog-01', speaker, scope)
```

is the same predicate, and a call the dog could not hear produces
`animal_responded { outcome: 'ignored' }` for the ordinary physical reason rather
than through a compliance roll. Distance was already an input to compliance
(`phase-3e-implementation-structure.md` §8.2); this makes inaudibility a hard
gate in front of it rather than a term inside it.
