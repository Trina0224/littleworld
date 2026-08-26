# Phase 3E — Implementation Structure

**Status:** binding supplement before implementation
**Created:** 2026-08-26
**Companion to:** `phase-3e-conversation.md`, `social-personality.md`,
`phase-3c-perception.md`, `phase-3d-memory.md`, `world-engine-2.5.md` §11–§12

Same relationship to `phase-3e-conversation.md` as
`phase-3c-implementation-clarifications.md` has to the 3C draft: that document
says what conversation must *be*, this one says what gets built. **Where this
file is more specific, this file wins.**

It exists because writing the structure out found five things the prose version
does not settle, and one of them is load-bearing enough that building without it
would produce a world in which nobody ever finishes a sentence.

---

## 0. What went wrong when I wrote the structure out

Recorded before the design, because the reasoning matters more than the shapes.

**§4 is the serious one.** The session has to decide "has this conversation gone
quiet". Every natural way to measure that is in ticks. Provider latency is also
in ticks — 80 to 150 of them for one reply. A quiet threshold short enough to
mean anything conversationally is shorter than a single ordinary model call, so
**every conversation would time out while its next line was still being
generated**, and the answer would arrive for a turn that no longer existed
(`world-engine-2.5.md` §12.2 discards it, correctly). The result is not a slow
conversation. It is a world where nobody ever replies.

The other four are smaller but the same species — a rule that reads fine in prose
and has no implementable meaning:

- **§5** never says whether a turn is a permission or an obligation, which
  decides what happens when its holder chooses `nothing`;
- **§6** one-active-session-per-actor contradicts "a direct address from outside
  must not silently switch sessions" — the address has to live *somewhere*;
- **§7** the transcript is rendered per observer, but nothing records who could
  hear a given utterance, and by the time a Brain is woken the perception queue
  that knew has been drained;
- **§9** `conversation_fading` waking the highest-`conversationDrive` participant
  has no stopping condition, so 星さん rescues every conversation forever and
  nothing in the park ever ends.

None of these are hard once seen. All of them are invisible in prose.

---

## 1. The objects

Five, and no more. Field names are binding; representation is not.

### 1.1 `ConversationSession`

```text
id                'conv-3'                    deterministic counter, server-side
participants      [entityId]                  sorted; never model-visible
state             opening | active | winding_down | ended
startedTick
endedTick         null until ended
lastSpeechTick    null while opening
lastSpeaker       entityId | null
turn              Turn | null                 who may speak now
openQuestion      { asker, asked, sinceTick } | null
awaiting          Map(entityId -> tick)       Brain requests in flight   §4
quietTicks        integer                     counts only unthought ticks §4
rescues           integer                     fading wakeups spent       §9
transcript        [Utterance]                 bounded working window     §7
```

### 1.2 `Turn`

```text
holder            entityId | null             null = open floor
grantedTick
expiresTick                                   see §5 for what expiry means
```

### 1.3 `Utterance` — one line of transcript

```text
tick
speaker           entityId
text              the committed words
act               reply | ask | greet | ...   the selected act, not a scope
addressed         entityId | null
heardBy           [entityId]                  sorted; server-side only     §7
```

### 1.4 `Opening` — an invitation that is not yet a conversation

Not a separate class; an `opening`-state session with two participants, one of
whom has not responded. It is listed separately because §6 turns on it.

### 1.5 The store

```text
createConversations(world, perception, { config })
  tick()                        step 8 of the canonical tick
  sessionFor(entityId)          the actor's one ACTIVE session, or null
  openingsFor(entityId)         invitations awaiting this actor
  reasons()                     wake reasons produced this tick, drained by the caller
  transcriptFor(entityId)       rendered for that observer                 §7
  menuFor(entityId)             legal choices for that actor               §8
  commit(entityId, choice)      the only way a Brain choice enters the world §8
```

`reasons()` is drained, exactly like `fresh()` in `loop.js`, and its return value
is a list. Nothing in this interface returns a promise, and nothing awaits.

---

## 2. The tick stage

Step 8 of `phase-3c-perception.md` §2. Two passes, in this order.

### Pass A — ingest committed speech

Reads `speech_said` from the fact stream with its own cursor, the same pattern
perception uses. It does not read the perception queue (`phase-3e-conversation.md`
§9.0).

```text
for each new speech_said fact:
    session = the speaker's active session, or a new one if the act opens one
    heardBy = participants for whom perception.canHear(p, speaker, scope)   §7
    append the Utterance; trim to transcriptWindow
    lastSpeechTick / lastSpeaker = this
    if act was ask        -> openQuestion = { asker, asked, now }
    if act was reply
       and openQuestion.asked === speaker  -> openQuestion = null
    turn = { holder: addressed ?? null, ... }                                §5
    quietTicks = 0 ; rescues unchanged
    if state === opening and speaker is the invited party -> state = active
```

### Pass B — advance every session

```text
for each session, in sorted id order:
    drop participants who can no longer hear any other participant  -> winding_down
    if turn expired and its holder is not awaiting -> turn = null            §5
    if awaiting.size === 0 and nobody spoke this tick -> quietTicks += 1     §4
    if quietTicks >= fadeAfter and rescues < rescueLimit -> emit conversation_fading
    if quietTicks >= idleLimit                          -> winding_down
    if winding_down and quietTicks >= idleLimit + graceTicks -> ended
```

Sorted id order because iteration order must never change a result — the same
rule as `resourceIds()` in `world.js`.

---

## 3. Facts, audit, and working state

The line, stated once so it stops being re-argued:

| | stream | why |
|---|---|---|
| `speech_said` | **fact** | already is one; gains an optional `conv` field |
| `conversation_started` / `_joined` / `_left` / `_ended` | **fact** | membership is publicly observable — you can see three people are talking together, and a renderer may draw the huddle |
| turn grants, expiries, `openQuestion` | **audit** | mechanism; nothing to draw |
| `continue_listening`, `nothing` | **audit** | §5.3; neither is speech |
| transcript | **neither** | derived from facts, rebuilt on demand, never persisted |

Two consequences.

**The `conv` field on `speech_said` is what lets replay draw a conversation
without re-deriving one.** Replay is playback, not re-simulation
(`simulation-replay-architecture.md`); it must never rebuild a session. It reads
membership facts and tagged utterances and draws.

**Membership being a fact is a claim about the world, not a convenience.** Three
people standing together talking is visible. Who holds the turn is not.

---

## 4. Provider latency is not conversational silence

The load-bearing rule of this document.

```text
ordinary conversational pause      ~2 s      20 ticks
ordinary model call                8-15 s    80-150 ticks
congested model call               20-40 s   200-400 ticks
```

A quiet threshold that models impatience is an order of magnitude smaller than
one model call. So:

> **`quietTicks` advances only on ticks where `awaiting` is empty.** A session in
> which somebody is thinking is not quiet, however long the thinking takes.

`awaiting` is set when the scheduler dispatches a request for a participant and
cleared when a result arrives, fails, or is abandoned. 3E owns the **state**;
3F-B owns the **policy** — concurrency, timeout, retry, dropping. This is the
same split `loop.js` already uses for `onWakeup`: 3E hands out a list and holds
state, and nothing in it awaits.

Three things follow.

**A turn does not expire while its holder is awaiting** (§5). Otherwise the
answer arrives for a turn that no longer exists and is correctly discarded — the
failure described in §0.

**Thresholds become meaningful in simulation time.** `fadeAfter` can be 40 ticks
and mean four seconds of real silence, rather than "faster than any model can
answer".

**Replay is unaffected and stays unaffected.** It compresses provider wait
because it has the fact timeline; nothing in the session state machine has to
know about presentation pacing. This is the simulation/replay split doing the
work it was introduced for.

### 4.1 The failure the rule prevents, written down

Without it, with `idleLimit` at any conversationally sensible value:

```text
t=100  A: 今日はいい天気ですね          turn -> B, expires t=140
t=100  B dispatched
t=140  turn expires, session quiet
t=180  session winding_down
t=250  B's reply arrives -> stale, discarded
```

B never speaks. Not once, not slowly — never. And the log shows a well-behaved
state machine doing exactly what it was told.

---

## 5. A turn is a permission with an expiry, never an obligation

`nothing` is always legal (`phase-3e-conversation.md` §5.1), so a turn cannot be
a duty. Therefore:

```text
granted    to whoever was addressed                          §11.0
held       until taken, released, or expired
taken      by any act that produces speech
released   by continue_listening (stays engaged) or nothing (no commitment)
expired    only after expiresTick AND only if the holder is not awaiting   §4
```

An expired or released turn sets `turn = null`, an **open floor**. It does not
pass to the next participant — that is the rotation §11.0 exists to prevent. An
open floor with nobody speaking is how `quietTicks` starts running, and quiet is
how a conversation ends. **Silence is the mechanism by which conversations die,
and that is intended**: the alternative is a system that keeps handing the turn
around until somebody talks.

`address_group` (optional, §6) grants a null holder deliberately: the floor is
open to every participant at once, and whoever's Brain is woken first may take
it.

---

## 6. Openings, and the one-active-session rule

`phase-3e-conversation.md` §1.2 caps an actor at one session; §12 forbids
silently switching when someone else addresses them. Both hold, because **the cap
is on `active`**:

```text
active sessions per actor      at most 1
opening sessions per actor     several, bounded by openingLimit
```

星さん calling to 渡辺 while he is talking to 澄子 creates an `opening` session
holding both of them. It appears in his `openingsFor()`, it may become a legal
`join_conversation` / `leave_conversation`-then-accept choice on a later turn,
and it expires on its own after `openingExpiry` ticks so unanswered invitations
do not accumulate.

An `opening` that expires ends without ever becoming active — which is the
correct world behaviour for calling to someone who was busy and did not turn
round. It is recorded in audit and produces no speech.

**An actor may never be `active` in two sessions.** Accepting an opening while
active requires leaving first, and that is a choice the Brain makes explicitly,
not something the engine does on its behalf.

---

## 7. Audibility has exactly one implementation

The transcript is rendered per observer (`phase-3e-conversation.md` §10), so
something must know who could hear each line. By the time a Brain is woken, the
perception queue that knew has been drained by delivery.

Two rules, and they are the same rule the zone geometry follows — *two
implementations of one containment test is where drift hides*:

> **`heardBy` is computed once, at ingestion, from perception's own predicate.**

`perception.canHear(observerId, speakerId, scope)` becomes a published pure
query rather than an internal function. The session calls it; nothing
reimplements distance or scope.

> **`heardBy` is server-side and never model-visible.**

It is a list of entity ids. It reaches a Brain only as the *absence* of a line
from that observer's rendered transcript.

### 7.1 A gap in a transcript is a rendering, not a bug

A participant who stepped away for two lines gets a transcript with those two
lines missing. That is correct, it is the whole point of §10, and the engine must
not paper over it with a placeholder. What it must not do is let the gap be
silent about itself when the character then says something that assumes knowledge
of what was missed — but that is a Brain-side consequence and 3E does not model
it.

### 7.2 Rendering rules, restated as an ordered fallback

For each utterance in the observer's window, the speaker renders as:

```text
1  the observer's private label from 3D memory              森牧師
2  currently visible          -> current ref + appearance    seen-2, 高瘦的中年男子
3  known but not visible      -> private label if any
4  otherwise                  -> neutral session-local description
```

Never the target's canonical name, never an entity id, never a fallback that
reaches for either because the first four were inconvenient. This is 3D §4.1
applied to history.

---

## 8. What the engine does with a Brain reply

`commit(entityId, choice)` is the only door. Its contract:

```text
in     { pick: 'reply:seen-2', text?: string, memory?: [...] }
out    { act, target, spoken, refused? }
```

Binding rules:

```text
pick must be one of the strings menuFor() produced this turn      else refused
refs in pick and in memory proposals are canonicalized (3D 1.1a)  else refused
text is DISCARDED for a pick that carries no speech               not an error
text is truncated to speechLimit, never rejected for length
scope is derived from the act and never read from the reply       §4.1
the engine builds the structured action; the model named a choice §5
```

A refusal is audit, changes nothing, and reaches only the actor that attempted it
— which is exactly the `own_action_failed` path 3C already built, reused rather
than reinvented.

**Discarding text rather than erroring** is deliberate. A model that returns a
sentence alongside `continue_listening` has not malfunctioned; it has been
slightly too helpful, and the right response is to take the choice and drop the
prose.

---

## 9. Wake reasons, and how fading avoids becoming a nag

```text
direct_address                 someone addressed you by act
conversation_turn              you hold the floor
conversation_opening           someone is inviting you                     §6
conversation_join_opportunity  a session you can hear has an open floor
conversation_fading            a session you are in has gone quiet         below
```

Ranking is 3F-B's. 3E only guarantees `direct_address` outranks any optional
social opportunity, which `phase-3e-conversation.md` §14 already requires.

### 9.1 The rescue budget

`conversation_fading` with no stopping condition produces a character who never
lets anything end. The cast makes this concrete: 星さん is authored at
`conversationDrive` 0.95, so she would rescue every silence in the park forever,
and no conversation would ever reach `ended` except by someone walking away.

Two bounds, both cheap:

```text
once per quiet spell     rescues can only fire again after somebody has spoken
rescueLimit per session  after N rescues the session is allowed to die
```

The second is the one that matters. **A conversation that has been rescued twice
and gone quiet a third time is over**, and saying so is not a failure of
hospitality — it is the difference between a character who keeps a conversation
alive and a character who cannot read a room.

`conversationDrive` still decides *who* gets the fading reason among the
participants. It does not decide whether the session may die.

---

## 10. `socialWeight()`

One pure function, scoped exactly as `phase-3e-conversation.md` §17.0 requires.

```text
socialWeight(traits, situation) -> number

traits      the ten-axis vector from character.json
situation   { kind, withStranger, sessionState, quietTicks, weakLastTurn, ... }
```

```text
no clock read, no rng, no world access, no memory access
nothing inside 3E calls it to decide anything
its only consumer today is the test that proves the cast stays asymmetric
```

It exists so §7.1's eligibility inputs are real and checkable before a scheduler
exists to consume them, and so 3F-B inherits a function rather than a paragraph.
Making it a pure function of declared inputs is also what makes §17.12 testable
statistically instead of by writing down the answer.

---

## 11. Determinism

Everything already established, restated because conversation adds new places to
break it:

```text
session ids from a counter, never from a hash of participants or a clock
participants and heardBy stored sorted
sessions iterated in sorted id order in Pass B
no Date, no rng, anywhere in this phase
same seed + same recorded choices = same fact stream, byte for byte
```

The last line is the acceptance test that catches the rest.

---

## 12. Replay

Replay is playback, not re-simulation. So:

```text
replay MUST NOT construct a ConversationSession
replay MUST NOT call canHear, menuFor, or socialWeight
replay reads conversation_* facts and speech_said.conv, and draws
```

`view.js` gains handling for the four membership facts. If a renderer ever needs
something a session knows and a fact does not carry, the answer is a new fact,
never a session rebuilt during playback. This is the same rule that keeps the
Activity Runtime switched off during replay in 3A.

---

## 13. What 3E cannot do, stated so nobody expects it to

3E's job is to stop the *mechanism* from killing conversations: no re-opening a
session every line, no round-robin, no forced speech, no timeout that fires
faster than a model can answer.

**It cannot make a conversation good.** Nothing here gives a character a reason
to want something from the person opposite. That lives in `self.md` and in
memory, and `pacing-and-latency.md` §6d already identifies it as the real cause
of cold conversation.

The one structural lever 3E does own is `openQuestion`: a question asked and not
answered is the cheapest possible stake, and it is the natural thing for
`conversation_fading` to prefer when choosing whom to wake. That is worth
implementing and it is worth not overselling.

If conversations still go cold with all of this in place, the signal to read is
the one already written down: the self sheets are not putting the cast's stakes
into the model's hands.

---

## 14. Open, and needing a decision before 3E-1

1. **`rescueLimit`.** Proposed 2. It decides how stubborn the world's most
   sociable character is allowed to be, which is a characterisation question more
   than an engineering one.
2. **`idleLimit` / `fadeAfter` / `openingExpiry` / `speechLimit`.** All
   configuration, all currently guesses: 40 / 120 / 200 ticks and 240 characters.
   They want one scripted run to look at before being fixed.
3. **Does membership belong in facts?** This document says yes (§3) on the
   grounds that a huddle is visible. It is the one decision here that changes the
   recording format, so it should be agreed rather than assumed.

---

## 15. Revised implementation order

Supersedes `phase-3e-conversation.md` §19.

```text
3E-0  the 3D transcript boundary (§9.3 there): no episode per utterance,
      add spokenWith, keep the exactly-once cursor
3E-1  publish perception.canHear as a pure query                        §7
3E-2  ConversationSession store, Pass A ingestion, membership facts     §1-§3
3E-3  turn ownership, openQuestion, the awaiting rule                   §4, §5
3E-4  Pass B lifecycle: quiet, fading with its budget, winding_down     §2, §9
3E-5  openings and the one-active-session rule                          §6
3E-6  transcriptFor() per-observer rendering                            §7.2
3E-7  menuFor() / commit(), act-derived scope, refusals                 §8
3E-8  join / leave
3E-9  socialWeight()                                                    §10
3E-10 scripted acceptance scenarios + mutations, view.js replay support §12
```

3E-0 first because it is the only step that removes behaviour. 3E-1 second
because everything downstream needs one implementation of audibility, and adding
it later means two.
