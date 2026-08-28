# Phase 3E — Offered-Floor Clarifications

**Phase labels superseded by `phase-3f.md`** (2026-08-28): what this file calls `3F-A` and `3F-B` are one implemented Phase 3F. Ownership statements below are still accurate; only the phase names changed, and nothing after 3E is 'next' any more.

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

> **Implemented** in 3E-1. `src/engine/hearing.js`, `world.js`,
> `perception.js`; proved by the 3E-1 block of `src/engine/perception.test.js`
> and seven mutations.
>
> **One correction, found by building it.** This section and
> `phase-3e-implementation-structure.md` §7 both said *`perception.canHear`
> becomes a published pure query*. It cannot be perception's: `world.say`
> commits the fact, and perception is built **on top of** the world, so the
> world would have had to depend on it. The predicate moved to `hearing.js`
> and `world.hearing` is the single home — which is also the truer place for
> it. Whether an utterance reached somebody is a property of the world at that
> moment; what they made of it is theirs. `createHearing` is handed only
> presence and position, so it cannot grow a dependency on anything else, and
> `hearingRange` / `soundRange` left perception's `DEFAULTS` so that a
> perception config can never contradict the audience `say` recorded.

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

> **Implemented** in 3E-2. `src/engine/perception.js`; proved by the 3E-2 block
> of `src/engine/perception.test.js` and the restored-event test in
> `memory.test.js`, with eight mutations.
>
> **One refinement, found by building it.** `settle()` must **not** also release
> the epoch's refs. They have different lifetimes — refs are a transport cache
> that may be dropped at any moment or never, while the queued events are what
> an agent is owed — and conflating them left a caller unable to resolve a ref it
> still needed. `held` is likewise not bounded by `epochHistory`, for the reason
> §1.1a already established about refs: what an agent is owed must never depend
> on the size of a transport cache. It is bounded by `heldLimit` instead, and
> exceeding it throws, because a caller that never settles is a bug rather than
> a load.

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

---

## 9. Cross-zone direct address — binding, and required before the Floor Store

Three rules that are each correct leave a hole between them:

```text
one offered floor per zone
membership is standing in the zone
hearing crosses zone edges          hearingRange 70; near-table to counter is 48
```

So: a customer at 近桌 calls the shopkeeper at 吧台. `heardBy` correctly includes
her. She is not in the near-table floor, and the counter may not qualify for a
floor at all if she is the only LLM standing there. **A direct address that
demonstrably arrived has nowhere to be answered.**

That is not a café special case. It is the general shape of *speaking to somebody
who is not in the room with you*, and it has to be settled before the Floor Store
is built, because it decides what qualifies a floor.

### 9.1 The invariant

> **A successfully heard direct address creates a response opportunity for the
> addressed target, in the target's own zone, even when speaker and target are in
> different zones.**

```text
A speaks in Z1, act carries `to: B`, B stands in Z2
  B in heardBy   -> Z2 gains an addressed response opportunity for B
                    B is Rank 1 there, and K = 1
  B not in heardBy -> nothing happens anywhere            clarifications §1
```

Hearing physics stays authoritative. The handoff is a consequence of `heardBy`,
never a reason to assume it.

### 9.2 One utterance, one owner, one fact

> **The utterance belongs to the speaker's zone and is committed exactly once.**

Z2 receives an *opportunity*, not a copy. There is no second `speech_said`, no
mirrored transcript entry, and no derived event that a renderer or a replay could
mistake for a second utterance. What reaches B is what already reached B:
`heardBy`, and the transcript rule in §9.4.

### 9.3 A one-LLM zone may qualify temporarily

`phase-3e-implementation-structure.md` §5 gains a third qualifying clause:

```text
two or more LLM actors                                        (existing)
one LLM actor and an addressable deterministic actor          (existing)
one LLM actor holding a pending heard direct address          (this section)
```

The third clause is **temporary and self-clearing**. It holds while the address
is unanswered and unoffered-to-conclusion, and stops holding when the opportunity
resolves — the target speaks, declines, or the address expires after
`addressExpiry`. A floor that qualified only through it is then destroyed. A
one-person floor must never become permanent; otherwise 澄子 alone at her counter
is polled forever, which is exactly the money leak §4 exists to prevent.

An animal target never qualifies a zone this way. `call_over` on ハナ resolves
through the compliance path (structure §8), which has its own audibility gate and
never involves an offer.

### 9.4 Transcript rendering across two floors

The naive rule — *`transcriptFor(observer)` renders the observer's own floor* —
loses the reply: B answers in Z2, A hears it, and A's transcript in Z1 does not
contain it.

The binding rule is therefore:

> **`transcriptFor(observer)` renders the recent utterances that the observer
> heard AND that either belong to the observer's own floor, or were spoken by
> or addressed to the observer.**

```text
heard + on my floor            the conversation I am standing in
heard + I said it              my own line
heard + it was said to me      somebody spoke to me from anywhere
heard + none of the above      NOT in my transcript - it reaches me as
                               perception, which is where an overheard
                               conversation belongs
```

The last row is what keeps `phase-3e-conversation.md` §4 intact: **transport is
not membership.** Hearing the counter from the near table makes you aware of it;
it does not put you in it. Being spoken to does.

### 9.5 `openQuestion` across two floors

`openQuestion` lives on **the floor that owns the asking utterance** — the
asker's. One record, in one place, whichever zone the answer eventually comes
from.

```text
A asks B, B heard it        -> Z1.openQuestion = { asker: A, asked: B, sinceTick }
                               Z2 gives B Rank 1 as the addressee              §9.1
B replies to A, A hears it  -> Z1.openQuestion = null, from whichever floor the
                               reply was made on
B leaves earshot entirely   -> Z1.openQuestion = null
```

Each floor already has what it needs, and neither has to know the other's state:
Z2 ranks B first because of the address, Z1 ranks A up because of the question.
That is why the record does not need to be duplicated.

### 9.6 Dormancy and re-arm

The social re-arm whitelist (§4, §8.3) is refined:

> **A `speech_said` whose `to` is standing in this zone and is present in its
> `heardBy` re-arms this zone's floor — including when the utterance was spoken
> in another zone.**

This is the mechanism of §9.1: a dormant 吧台 wakes because somebody was spoken
to there, and for no other cross-zone reason. An overheard undirected
conversation next door still re-arms nothing, which is the same distinction §9.4
draws for the transcript.

### 9.7 Determinism

Nothing here can race, and the reason is worth stating rather than assuming.

**A person stands in exactly one zone, so exactly one floor can ever offer them
the floor.** Two floors cannot contend for the same character. Floors are
advanced in sorted zone id order, offers from different floors in one tick are
independent, and the winner within a batch is still chosen by rank rather than by
response arrival (structure §3.2).

Two characters in different zones addressing B in the same tick give B one Rank 1
slot in one zone, not two offers. `addressed` takes the later utterance by tick
and then by the ordinary tie-break; B's Brain sees both lines in its transcript
under §9.4 and chooses.

### 9.8 Required tests

```text
1  near-table customer addresses the counter shopkeeper; she is the only LLM at
   the counter; she is offered her own zone's floor at Rank 1, K = 1
2  the same call when she is out of hearing range creates no floor, no offer and
   no openQuestion anywhere
3  exactly one speech_said fact exists for that utterance
4  her reply appears in the caller's transcript, and the caller's line appears in
   hers, although the two are on different floors
5  a third party who overheard the call gets it as perception and NOT in their
   transcript, unless it happened on their own floor
6  a dormant counter re-arms on the address, and does not re-arm on an undirected
   conversation next door
7  once she answers or declines, the counter floor is destroyed again
8  two callers from two zones in one tick produce one Rank 1 slot, not two offers
```

---

## 10. The overhearer's invitation

Overhearing is not meeting and not conversing (`phase-3d-memory.md` §2.0.1), and
§9.4 keeps an overheard conversation out of the overhearer's transcript. Both are
right, and together they leave a gap worth closing.

### 10.1 The gap

A **same-zone** bystander needs nothing: they are already in that floor's
ranking, and speaking or not is their choice.

A **cross-zone** overhearer has no path in and, worse, nothing ever prompts them.
澄子 alone at 吧台 can hear a lively conversation at 近桌 and never once be given
the chance to think *I should go and see*. §9.6 is explicit that an overheard
undirected conversation re-arms nothing, so if her floor is dormant she is not
asked at all.

For this cast that is backwards. 澄子 is running the place and wants to know how
it is going; 熊田 is there to watch and report back. The two characters most
likely to walk over are the two the rule silently excludes.

### 10.2 The rule

> **A conversation an actor can hear but is not part of may produce one offer, on
> that actor's own floor, with `why = overheard`.**

```text
rank 1   addressed                                              §9.1
rank 2   openQuestion outstanding                               §9.5
rank 3   overheard, and everyone else, by socialWeight   structure §3.1
```

It is a **nudge, not a summons**. Declining is free, costs nothing, and is the
expected answer most of the time.

### 10.3 Bounded, or it is a bill proportional to how lively the scene is

Unbounded, a twenty-line conversation at 近桌 polls every zone within earshot
twenty times.

```text
one overheard nudge per zone per dormancy
   a floor that declined one is not nudged again by overhearing until it has
   gone dormant and something else has re-armed it
a zone may qualify temporarily for this, as it does for an address     §9.3
   and is destroyed again the moment the offer resolves
never for an actor already on a floor with an active conversation
```

The first line is the one that matters, and it is the same shape as the rescue
budget that §4 removed for the same reason: **you get one "should I go over?" per
quiet spell, not one per sentence.** In practice that is about one extra call per
overhearer per conversation.

### 10.4 What the offer may contain

The overhearer is not standing on that floor, so they cannot take its turn:

```text
allowed    approach / go to that area           placement.js already does this
allowed    a loud directed call across          -> becomes an address, and §9
                                                   handles the handoff properly
allowed    nothing
NOT        reply / ask into a floor you are not standing in
```

That last line is the principled closure. **To take part in a conversation you
either go there, or you address somebody directly** — and a direct address across
a boundary already has a defined, tested route. Nothing new is needed, and no
utterance ever belongs to two floors.

Accepting is therefore a *movement*, and arrival does the rest: walking into the
zone is joining (structure §5), with no membership mechanism anywhere.

### 10.5 What it does not change

```text
memory        overhearing still creates no encounter and no spokenWith
transcript    §9.4 unchanged - the overheard lines stay out of the transcript
              and reach the Brain as perception, which is what they are
facts         no new fact; the nudge is an offer, and offers are audit
membership    unchanged; nobody joins anything by hearing it
```

The offer's context is the overhearer's ordinary perception package. They know
somebody nearby is talking because `speech_heard` says so, at whatever fidelity
distance allows — which is also why a conversation too far off to make out
produces `sound_heard` and no nudge at all.

### 10.6 Determinism

The nudge is derived from committed facts (`speech_said` and its `heardBy`) and
from floor state, both of which are deterministic. The per-dormancy bound is a
flag on the floor, not a timer. Ordering is the ordinary rank order, and the
overhearer's own zone is the only floor that can offer to them (§9.7).

### 10.7 Required tests

```text
1  a conversation at 近桌 produces at most one overheard offer at 吧台 across its
   whole length
2  declining it produces no second offer until that floor has gone dormant and
   been re-armed by something else
3  the overheard offer's menu contains no reply/ask into the other floor
4  approaching, then arriving, puts the actor in the other zone's next round with
   no join action anywhere
5  an actor already in an active conversation is never nudged
6  a conversation too far off to make out (sound_heard) produces no nudge
7  memory is untouched: the overhearer gains no encounter and no spokenWith
```
