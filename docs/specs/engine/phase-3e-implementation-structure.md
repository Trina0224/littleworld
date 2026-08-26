# Phase 3E — Implementation Structure

**Status:** binding supplement before implementation
**Created:** 2026-08-26
**Revised:** 2026-08-26 — rebuilt around the **offered floor**; the session
object and half of this document were deleted rather than fixed
**Amended by:** `phase-3e-floor-clarifications.md` and
`phase-3e-pre-floor-corrections.md`, which win over this file.
Its §1–§7 close five edge cases; its §8 carries four consequences found when
reviewing them, of which §8.2 changes a 3C contract.
**Companion to:** `phase-3e-conversation.md`, `social-personality.md`,
`phase-3c-perception.md`, `phase-3c-venue-interactions.md` §3,
`phase-3d-memory.md`, `world-engine-2.5.md` §11–§12

Same relationship to `phase-3e-conversation.md` as
`phase-3c-implementation-clarifications.md` has to the 3C draft: that document
says what conversation must *be*, this one says what gets built. **Where this
file is more specific, this file wins.**

---

## 0. The pivot, and why the first draft was thrown away

The first version of this document built conversation as a session object with a
lifecycle, membership, joins, turn grants and tick-based idle detection. Writing
it out found five contract gaps, one of them fatal: any silence threshold short
enough to mean something conversationally is shorter than a single model call, so
every conversation would have timed out while its next line was being generated,
and the reply would have arrived for a turn that no longer existed.

The owner's answer replaced the mechanism rather than patching it:

> **The engine offers the floor to one character at a time and asks whether they
> want to speak. "No" is an answer. The engine then offers it to the next one.
> Each area of the scene has its own floor, so several conversations run at
> once.**

Two problems stop existing rather than being managed.

**Silence becomes latency-independent.** A conversation is quiet when a full
round of offers found no taker. Whether each answer took three seconds or forty
does not enter into it. The entire tick-arithmetic apparatus the first draft
needed — counting only unthought ticks, suspending turn expiry while a request is
in flight — is deleted.

**The zone becomes the session.** A conversation is *the people in this area right
now*. Joining is walking in and leaving is walking out, both of which are already
implemented and already facts. The session object, its four-state lifecycle,
`join_conversation`, `leave_conversation`, membership facts, invitation expiry and
the one-active-session-per-actor rule all disappear, the last one because physics
already guarantees it: you are in one zone.

§14 lists exactly what was deleted, so the reasoning survives the deletion.

---

## 1. The model in one page

```text
每個區域一個話語權   one floor per zone
  offered to one character at a time, in priority order
  the character speaks, or declines
  a full round with no taker  = the conversation has gone quiet
  quiet  -> the floor sleeps until something happens
```

```text
ZONE park-open          floor: offered to 星さん        (awaiting)
ZONE near-table         floor: open, round 2, 1 decline so far
ZONE cafe-counter       floor: dormant since t=1180
ZONE far-table          no floor - one person, no animal
```

Nothing here waits for inference. The engine hands out offers and reads answers
when they arrive; the world clock never stops, and a character with an offer
outstanding continues its deterministic activity exactly as before.

---

## 2. The objects

Three. The first draft had five and a state machine.

### 2.1 `Floor` — one per zone that currently qualifies

```text
zone              'near-table'
state             open | offered | dormant
round             integer, increments when an offer round completes
offeredTo         [entityId]     the current batch, in rank order   §3.2
offeredAt         tick
declines          [entityId]     who has declined this round
lastSpeechTick    null until somebody speaks
lastSpeaker       entityId | null
addressed         entityId | null    who the last utterance was aimed at
openQuestion      { asker, asked, sinceTick } | null                §10
quietRounds       integer        consecutive rounds with no taker
transcript        derived from the fact stream, never stored       §7
```

A floor is created when its zone qualifies (§5) and destroyed when it does not.
It holds no membership list: **membership is who is standing in the zone**, which
`world.presentIds()` and `zones.at()` already answer.

### 2.2 `Utterance`

```text
tick
speaker           entityId
text              the committed words
act               greet | reply | ask | call_over | ...
addressed         entityId | null      may be a deterministic actor    §8
heardBy           [entityId]           sorted, server-side only         §7
```

**Not a cache at all, in the end.** Clarifications §2 asks for a transcript that
is derived, disposable and rebuildable; the implementation went one step further
and stores no transcript. A per-zone index of positions in the fact stream is
appended at ingestion and is never cleared when a floor is destroyed, so the
utterances are read back out of the facts on every call. The rebuild property is
then true by construction rather than by maintenance — there is nothing to keep
in step. `heardBy` and `zone` ride on the fact for the same reason
(clarifications §8.1, §9.2).

### 2.3 The store

```text
createFloors(world, zones, { minds, config })
  tick()                     step 8 of the canonical tick
  offers()                   offers opened this tick; drained by the caller
  transcriptFor(entityId)    rendered for that observer                 §7
  menuFor(entityId)          legal choices for whoever holds an offer   §9
  commit(entityId, choice)   the only door a Brain reply enters through §9
  decline(entityId)          explicit or timed-out refusal              §3.4
```

`offers()` drains, exactly like `fresh()` in `loop.js`. Nothing in this interface
returns a promise and nothing awaits — the scheduler in 3F-B attaches to
`offers()` the way it attaches to `onWakeup`.

---

## 3. The offer round

### 3.1 Order of offer — priority, never a circle

A fixed circle produces the failure where A asks B a question and C, whose turn
it happens to be, answers it. So the order is:

```text
1  whoever the last utterance addressed
2  whoever has an unanswered question of their own outstanding    §10
3  everyone else, ranked by socialWeight(traits, situation)       §11
   - including an overhearer being nudged once  clarifications §10
4  ties broken by hash01(seed:zone:round:entityId)
```

Rank 1 is the whole of `phase-3e-conversation.md` §11.0 preserved: **the floor
goes to whoever was addressed, before anyone else is asked.** Everything below it
is where the cast's asymmetry does its work — 星さん sits high in rank 3 on
`initiative` and `conversationDrive`, 渡辺 sits at the bottom on both, and the
result is that he is asked last and usually after somebody else has already
spoken.

He is still asked. Being asked last is characterisation; never being asked would
be the engine deciding he is not a person.

### 3.2 Offer in parallel, decide by rank

Asking strictly one at a time multiplies latency by the number of decliners. With
five people in a zone and four declines, one line of dialogue costs five full
round trips, and a quiet character costs a full wait on every round forever.

So the batch size adapts:

```text
a clear addressee exists  -> K = 1     they almost always answer
open floor                -> K = 3     offer to the top three at once
```

**The taker is chosen by rank, not by who answered first.** Provider response
order is network timing, and letting it decide who speaks would make the world
non-deterministic — `same seed + same recorded choices = same fact stream` is the
claim that keeps replay honest, and this is exactly where it would be lost.

```text
offer to the top K
wait for all K to answer, decline, or time out
among the takers, the highest-ranked speaks
the rest are discarded and recorded in audit as floor_lost
if all K decline -> next batch, same round
if the round exhausts the zone -> quietRounds += 1
```

A loser commits **nothing** — not speech, not an action, and **not a private
memory proposal** (clarifications §3). A character does not remember deciding
something it never got to decide.

And a loser must lose nothing either: its perception queue is restored, because
building the context provisionally drained it and the offer was withdrawn before
use (clarifications §8.2). Without that, a sentence addressed to 澄子 could
disappear because she was offered a floor at the same moment as somebody who
outranked her.

Discarding a generated utterance costs tokens. That is the price of paying
latency once instead of K times, it is bounded by K, and in this project latency
is the scarce resource and tokens are not (`pacing-and-latency.md` §6b).

The alternative — record provider arrival order as a recorded simulation input,
the way human director input is recorded — is legal under `pacing-and-latency.md`
§4.1 and is deliberately not chosen: it would make the priority order decorative,
overridden by network noise on most rounds.

### 3.3 What an offer contains

The full conversation-turn package of `phase-3e-conversation.md` §16, plus one
field that did not exist in the session model:

```text
why you have the floor    addressed | open_floor | question_outstanding
```

and the legal choices from `menuFor()` (§9). The character is not told its rank,
who else is being offered, or that anyone declined — those are engine mechanics
and would leak the shape of the scheduler into the fiction.

### 3.4 Declining

`nothing` is the decline. It is always in the menu
(`phase-3e-conversation.md` §5.1), it is not a provider failure, and a timeout or
a provider error resolves to the same thing:

```text
explicit `nothing`   -> decline
request timeout      -> decline, recorded in audit as an implicit one
provider error       -> decline, same
```

Collapsing all three into one outcome is what makes the world survive a bad
provider day: the conversation gets quieter, not broken.

**`continue_listening` is deleted.** It existed to keep a participant in a
session without speaking, and there is no membership to maintain any more —
standing in the zone is the membership. One fewer concept, and one fewer thing
for a model to choose wrongly.

---

## 4. Quiet, and re-arming — the rule that keeps a quiet park free

A round in which every character declined is the conversation going quiet. What
happens next is the only place this design can waste real money:

> **A floor that has gone quiet does not start another round on its own.**

```text
quietRounds >= quietLimit  ->  state = dormant
```

A dormant floor re-arms on a **socially salient** event, not on a timer and not
on any event at all. The binding whitelist is clarifications §4; the mechanism is clarifications
§8.3 — *social* is a declared property of the fact type, defaulting to false, so
a new cafe fact cannot start polling eleven Brains by accident. Seats re-arm a
floor and stations do not, because the shopkeeper claiming her workstation is
exactly the machinery this excludes.

```text
somebody arrives in / leaves the zone
a SEAT became occupied or released         not a station
a directed utterance whose target is HERE and in its heardBy   clarifications §9.6
   - including one spoken in another zone
a conversation audible from here that nobody here is part of  clarifications §10
   - ONCE per dormancy, never for an actor already in a conversation
a loud utterance audible from here
an order was placed / service was requested                    3F-A
an addressable animal did something notable                    §8
a human director input
```

Without this, eleven characters standing quietly in a park are polled forever and
the bill is proportional to how boring the scene is, which is the wrong way
round. With it, **silence is free**, which is what lets a day be long.

Two consequences worth stating.

**Rescue happens by widening, not by a special mechanism.** The first draft
needed `conversation_fading` with a rescue budget to stop 星さん resuscitating
every silence in the park forever. Here, a round that found no taker simply ends;
if the zone re-arms later, she is high in rank 3 and will be asked early. She
gets many chances and no guarantee, which is what being a sociable person is. The
`rescueLimit` question in the earlier draft's §14 is withdrawn.

**`quietLimit` is how stubborn the world is, and it is small.** Proposed 1: one
full round with no taker is enough. A second round rarely finds a taker the first
did not, and it costs a full poll of the zone to discover that.

---

## 5. Several conversations at once

A zone qualifies for a floor when it holds:

```text
two or more LLM actors
or one LLM actor and at least one addressable deterministic actor          §8
or one LLM actor holding a pending heard direct address     clarifications §9.3
or one LLM actor with an unspent overheard nudge            clarifications §10.3
```

The third clause is temporary and self-clearing: a zone that qualified only
through it is destroyed again once the target speaks, declines, or the address
expires. It exists because hearing crosses zone edges and a direct address that
demonstrably arrived must have somewhere to be answered — see clarifications §9,
which is binding and settles the whole cross-zone case.

Zones come from `docs/specs/world/zones.json` and are already implemented:
吧台 / 近桌 / 遠桌 / 街邊 / 公園空地, plus 後臺. Five usable rooms means up to
five conversations running at once with no new geometry and no new concepts.

### 5.1 A zone is not an audibility boundary

Hearing range is 70 world units and crosses zone edges — the counter to the near
table is 48 and audible, which is exactly why `broadcast` was worth having
(`perception.js` DEFAULTS). So:

```text
the floor    is per zone      a scheduling construct
hearing      is per distance  physics, and unchanged
```

People at the near table hear the counter and do not have the floor there. They
perceive it, they may remember it, and it may make one of them walk over. That is
already how 3C works and 3E adds nothing to it.

### 5.2 Accepted limitation: one floor per zone

Four people at the far table are one conversation, not two pairs. For a small
café terrace and a pocket park this is close enough to true to be worth the
simplicity, and two pairs at one table politely ignoring each other is not what
this scene is. Recorded as a limitation rather than hidden.

---

## 6. Facts, audit, and working state

| | stream | why |
|---|---|---|
| `speech_said` | **fact** | already is one; gains an optional `zone` field |
| `speech_said.heardBy` | **fact**, server-side field | who was in earshot at that tick — committed by `world.say`, never recomputable afterwards, never model-visible (clarifications §8.1) |
| `animal_responded` | **fact** | the dog visibly does something; a renderer draws it §8 |
| offers, declines, `floor_lost`, dormancy | **audit** | mechanism; nothing to draw |
| `openQuestion`, rank order | **working** | server-side floor state |
| transcript | **neither** | derived from facts, rebuilt on demand, never persisted |

`heardBy` is a committed field of a fact and not working state. It is the one
thing in this phase that a renderer never draws and a rebuild cannot do without:
audibility depends on where everybody stood at that tick, and the Floor cache is
disposable by design.

**No new membership facts.** The earlier draft proposed
`conversation_started` / `_joined` / `_left` / `_ended` and asked the owner to
decide whether membership belonged in the recording. The question is withdrawn:
membership is position, position is already committed every tick, and replay can
draw a huddle from where people are standing. Adding a second, derived
representation of the same truth is the kind of duplication that drifts.

The `zone` field on `speech_said` is kept because it is *not* derivable at replay
time without re-running zone containment, and replay must never re-simulate.

---

## 7. Transcript and audibility

`heardBy` is computed once, **at commit**, by the world:

> **`world.hearing.canHear(observerId, speakerId, scope)` is the single
> audibility predicate.** The floor calls it; nothing reimplements distance or
> scope.

An earlier draft of this section put it on perception. Building it showed why it
cannot be: `world.say` commits the fact and perception is built on top of the
world, so the world would have had to depend on perception. `hearing.js` is the
one home, and it is the truer one — how far a voice carries is world physics, and
what somebody made of hearing it is perception's.

Two implementations of one audibility test is where drift hides — the same
reasoning that made `zones.json` carry a 300-position sample for the JS to
reproduce. `heardBy` is server-side, never model-visible, and reaches a Brain
only as the *absence* of a line from that observer's rendered transcript.

### 7.0 What an observer's transcript contains

An overheard conversation stays **out** of it and reaches the Brain as
perception, which is what it is. That is not a dead end: clarifications §10 gives
the overhearer one offer, once per dormancy, to walk over — and walking in is
joining, so nothing new is needed once they arrive.


> **The recent utterances the observer heard, that either belong to the
> observer's own floor, or were spoken by or addressed to the observer.**

Clarifications §9.4, and the last clause is what makes a conversation survive a
zone boundary. An utterance the observer merely overheard from a neighbouring
zone reaches them as perception and stays out of their transcript — hearing the
counter from the near table makes you aware of it, it does not put you in it.

### 7.1 A gap in a transcript is a rendering, not a bug

Someone who stepped away for two lines gets a transcript missing those two lines.
That is correct and the engine must not paper over it with a placeholder.

### 7.2 Speaker rendering — an ordered fallback

```text
1  the observer's private label from 3D memory           森牧師
2  currently visible -> current ref + appearance          seen-2, 高瘦的中年男子
3  known but not visible -> private label if any
4  otherwise -> neutral session-local description
```

Never the target's canonical name, never an entity id, never a fallback that
reaches for either because the first four were inconvenient. This is 3D §4.1
applied to history.

---

## 8. Speaking to a deterministic actor

A character may address the dog, and the world may let the dog comply.

This is not a courtesy feature. 辰 talking to ハナ is one of the most characteristic
things this cast does, and a zone holding one person and their dog is a real
scene rather than an empty one.

### 8.1 The engine never reads the prose

The engine cannot know that 「ハナ、おいで」 means *come here*, and it must not
try. `phase-3c-venue-interactions.md` §3 already settled this for the café and
the same rule applies unchanged:

> **The Brain selects an act from the menu the engine supplied. The words are
> what people hear; the act is what the world executes.**

So when an addressable animal is in the zone, `menuFor()` includes animal-directed
choices alongside the human ones:

```text
[ reply:seen-2, ask:seen-2, call_over:seen-4, praise:seen-4, shoo:seen-4,
  nothing ]
```

`seen-4` is the dog, through the ordinary perception ref (`kind: animal_seen`).
The Brain still never receives `dog-01`.

The initial repertoire stays deliberately tiny — `call_over`, `praise`, `shoo` —
because the point of 3E is to prove the *path*. What a deterministic actor can be
asked to do belongs to whatever runtime owns it, and grows there.

### 8.2 Compliance is parameters, never memory

`dog-01` carries `bonds`, not `knows`, and has no memory store
(`phase-3d-memory.md` §8). Compliance is therefore computed from authored data
and current state only:

```text
familiarity   bonds[speaker].familiarity, or 0 for a stranger
distance      how far the caller is
occupied      what the dog is doing right now
act           what was asked
```

Audibility comes first and is a hard gate, not a term inside the calculation: a
call the dog could not hear is `ignored` for the ordinary physical reason, and it
uses the same `canHear` with `dog-01` as the observer (clarifications §1, §8.5).
Only a call that arrived is scored.

The asymmetry then falls out for free and is exactly right: 辰 and タタ are at
familiarity 1.0, everyone else is at 0. **星さん calling ハナ mostly does not
work, and 辰 calling ハナ mostly does.** Nobody had to write that rule; it is
already in the character file.

A deterministic actor must never acquire a memory from being spoken to, and 3D's
mind gate already guarantees it structurally.

The *human* side is unchanged and is worth noticing: calling the dog is speech
aimed at an entity, so the caller's own memory records contact with ハナ in the
ordinary way — `encounters`, and `spokenWith` (`phase-3d-memory.md` §2). A
character who remembers having talked to a dog several times is exactly right,
and nothing had to be added for it.

### 8.3 Stable randomness, without touching the shared stream

A dog that always obeys is a machine and a dog that never does is scenery. The
decision needs to be uncertain and still deterministic, and it must not draw from
the world rng — a stream's values depend on how many times anyone else has drawn
from it, which is the reason `attendance.js` hashes instead:

```text
comply = hash01(`${seed}:${tick}:${speaker}:${act}:${animal}`) < p(familiarity, distance, occupied)
```

Same seed, same tick, same call, same answer, whatever else the run contains.

### 8.4 What the dog produces

Not speech. A committed action, and optionally an audible non-verbal fact:

```text
animal_responded   { animal, to, act, outcome: complied | ignored }
```

It is a fact because it is visible — the dog gets up and trots over, or it does
not — and a renderer and a replay both need it. Perception already classifies the
dog as `animal_seen`, so other characters observe the response through the
ordinary channel with no special case.

An ignored call is also a fact. A dog that visibly does not come when called is
information about the caller, and it is the sort of small public failure this
world should be able to show.

### 8.5 What the dog never gets

```text
an offer                    it is never polled and never receives a context
a menu                      it selects nothing
a transcript                it renders nothing
a memory                    3D minds gate, already enforced
a self.md                   3B, unchanged
```

A zone qualifying for a floor because an animal is in it means the *person* is
offered the floor. The animal is a possible target, never a participant.

### 8.6 The cost guard for a person and a dog

One LLM alone with an animal would otherwise be polled round after round with
nobody to answer. So a zone that qualifies only through §5's animal clause
**re-arms on events only** and never on a fresh round — the dog arriving, the dog
doing something, another person walking in. Everything in §4 applies, more
strictly.

---

## 9. What the engine does with a Brain reply

`commit(entityId, choice)` is the only door.

```text
in     { pick: 'reply:seen-2', text?: string, memory?: [...] }
out    { act, target, spoken, refused? }
```

```text
pick must be one of the strings menuFor() produced for this offer   else refused
refs in pick and in memory proposals are canonicalized (3D 1.1a)    else refused
text is DISCARDED for a pick that carries no speech                 not an error
text is truncated to speechLimit, never rejected for length
scope is derived from the act, never read from the reply            §4.1 of 3E
an entity that does not hold an offer cannot commit                 refused
```

A refusal is audit, changes nothing, and reaches only the actor that attempted it
— the `own_action_failed` path 3C already built, reused rather than reinvented.

**Discarding text rather than erroring** is deliberate. A model that returns a
sentence alongside `nothing` has not malfunctioned; it has been slightly too
helpful, and the right response is to take the choice and drop the prose.

---

## 10. `openQuestion`

The one structural stake the engine owns.

```text
act was ask                        -> openQuestion = { asker, asked, now }
act was reply and speaker is asked -> openQuestion = null
the asked leaves the zone          -> openQuestion = null
```

Its only mechanical effect is rank 2 in §3.1: a character with a question hanging
in the air is offered the floor before the general population. That is enough to
make an unanswered question feel unanswered, and it costs one nullable field.

It lives on the floor that owns the **asking** utterance, so a question asked
across a zone boundary needs no duplication: the asker's floor holds the record
and ranks the asker up, while the target's own floor ranks the target first
because of the address (clarifications §9.5). Neither floor has to know the
other's state.

Deliberately not modelled: whether the reply actually answered the question. That
is semantics, and `phase-3e-conversation.md` §8 keeps the engine out of it.

---

## 11. `socialWeight()`

One pure function, and now it has a real consumer rather than a hypothetical one:
it produces rank 3 of the offer order.

```text
socialWeight(traits, situation) -> number

traits      the ten-axis vector from character.json
situation   { withStranger, quietRounds, roundIndex, lastSpeakerWasMe, ... }
```

```text
no clock read, no rng, no world access, no memory access
its consumers are the offer ranking and the asymmetry test
concurrency, quotas, priority, dropping and retry remain 3F-B
```

Because it now decides ordering rather than merely being available for a future
scheduler, `phase-3e-conversation.md` §17.12 becomes directly testable: rank 星さん
against 渡辺 across many generated situations and assert the distribution
separates. No scripted choices are involved, which is what that test needs.

---

## 12. Determinism

```text
floors iterated in sorted zone id order
a person stands in one zone, so exactly one floor can ever offer to them
offer batches ranked deterministically; ties by hash01, never by rng stream
the taker is chosen by rank, never by response arrival                §3.2
animal compliance by hash01, never by the shared rng            this file §8.3
no Date anywhere in this phase
same seed + same recorded choices AND recorded scheduler drops
   = same fact stream, byte for byte
```

The last line gained a clause. A 3F-B drop under budget pressure resolves as a
decline and the round moves on, so infrastructure pressure really does change who
speaks — which is legal, and is recorded with its tick like human director input
(clarifications §8.4). Timing never changes the winner; a recorded drop changes
who was eligible, and replays identically.

The last line is the acceptance test that catches the rest.

---

## 13. Replay

Replay is playback, not re-simulation:

```text
replay MUST NOT construct a Floor
replay MUST NOT call canHear, menuFor, socialWeight, or the compliance hash
replay reads speech_said (with its zone), animal_responded, and positions
```

`view.js` gains `animal_responded`. If a renderer ever needs something a floor
knows and no fact carries, the answer is a new fact, never a floor rebuilt during
playback — the same rule that keeps the Activity Runtime switched off during
replay in 3A.

---

## 14. What was deleted, and why

Recorded so the reasoning survives the deletion. Everything here was in the first
draft of this document or in `phase-3e-conversation.md`, and is now gone.

| deleted | because |
|---|---|
| `ConversationSession` and its four-state lifecycle | the zone is the session |
| `join_conversation` / `leave_conversation` | walking in and out, already implemented |
| membership facts | membership is position, already committed |
| one-active-session-per-actor | physics: you are in one zone |
| `opening` sessions, `openingExpiry`, `openingLimit` | calling to a busy person is a loud act plus a movement decision |
| turn grants, `expiresTick`, turn expiry rules | the floor is offered, not granted |
| `quietTicks` counting only unthought ticks | quiet is a round with no taker, and rounds have no duration |
| `awaiting` as a latency-suspension mechanism | nothing is measured in ticks any more |
| `conversation_fading` and `rescueLimit` | rescue is being ranked high on the next round |
| `continue_listening` | no membership to maintain |
| `conversation_join_opportunity` as a wake reason | being offered the floor in a zone you walked into is the same event |

What survives from the first draft, unchanged: the 3D transcript boundary
(`phase-3d-memory.md` §6.1), `canHear` as one published query, per-observer
transcript rendering, `openQuestion`, `socialWeight`, act-derived transport,
`menuFor`/`commit` with refusals, determinism and replay.

---

## 15. What 3E cannot do

3E stops the *mechanism* from killing conversations: no re-opening anything every
line, no forced speech, no timeout that fires faster than a model can answer, no
poll of a scene that has nothing to say.

**It cannot make a conversation good.** Nothing here gives a character a reason
to want something from the person opposite. That lives in `self.md` and in
memory, and `pacing-and-latency.md` §6d already names it as the real cause of
cold conversation. `openQuestion` is the one structural stake the engine owns,
and it is worth implementing and worth not overselling.

If conversations still go cold with all of this in place, the signal to read is
the one already written down: the self sheets are not putting the cast's stakes
into the model's hands.

---

## 16. Open

1. **`quietLimit`, `K`, `speechLimit`.** Proposed 1, 1-or-3, and 240 characters.
   All configuration, all wanting one scripted run to look at.
2. **The animal repertoire.** `call_over` / `praise` / `shoo` is enough to prove
   the path. What else ハナ can be asked belongs with whoever owns deterministic
   actors, and does not need deciding now.
3. **Whether a dormant zone should ever re-arm on a long timer** as well as on
   events — an hour of world time with nobody speaking might reasonably produce
   one attempt. Currently: no. Events only.

---

## 17. Implementation order

Supersedes `phase-3e-conversation.md` §19 and the first draft's §15.

```text
3E-0  the 3D transcript boundary: no episode per utterance, add spokenWith,
      keep the exactly-once cursor           DONE      phase-3d-memory.md 6.1
3E-1  hearing.js as the single audibility predicate; compute heardBy at
      commit and carry it on speech_said     DONE        §7, clar. §8.1
3E-2  move perception delivery from context-built to offer-settled:
      contextFor + settle(epochId, {delivered})   DONE      clar. §8.2
3E-3  Floor store (the "3E-2" of pre-floor-corrections §3, which gates it):
      qualification including the cross-zone address clause,
      creation, destruction, ingestion of speech_said with zone
      and heardBy; transcript derived    DONE     §2, §5, clar. §2, §9
3E-4  offer rounds: ranking, batching, rank-decides-the-taker,
      losers commit nothing and lose nothing                  §3, clar. §3, §8.2
3E-5  quiet, dormancy, social re-arm as a fact-type property  §4, clar. §4, §8.3
3E-6  transcriptFor() per-observer rendering                            §7.2
3E-7  menuFor() / commit(), act-derived scope, refusals                  §9
3E-8  openQuestion, gated on audibility                     §10, clar. §1, §6
3E-9  addressing a deterministic actor, compliance, animal_responded     §8
3E-10 socialWeight() and the asymmetry test                             §11
3E-11 scripted acceptance scenarios + mutations, view.js replay support  §13
```

3E-0 first because it is the only step that removes behaviour. 3E-1 second
because everything downstream needs one implementation of audibility, and adding
it later means two. 3E-2 third and on its own because it changes a shipped 3C
contract, and every offer round after it depends on being able to withdraw a
context without consuming anything.
