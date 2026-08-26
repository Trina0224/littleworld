# Phase 3D — Private Memory

**Status:** implementation contract
**Created:** 2026-08-25
**Updated:** 2026-08-25 — memory is a stage of the canonical tick; consumption,
encounter and mind-gate contracts made explicit after review
**Updated:** 2026-08-26 — the transcript boundary (§6.1). 3E gives conversation a
place to live, so the engine stops writing an episode per utterance.
**Companion to:** `character-identity.md` (3B), `phase-3c-perception.md`, `phase-3c-implementation-clarifications.md` §1.1a, `simulation-replay-architecture.md`

3C answered *what can this character perceive right now?* 3D answers the next
question and only that one:

> **What does this character remember about what it has perceived?**

Interpretation — *what do I think this means, who do I think these people are* —
still belongs above, to the Brain. 3D does not decide anything; it accumulates.

---

## 1. `knows` is memory that existed before tick zero

The seeded knowledge from 3B is not a separate mechanism sitting beside memory.
It is memory that was there when the world started. **3D absorbs it rather than
consulting it**, which is what stops there being two answers to "does this
character know that one".

Three layers, no overlap:

| | holds | written |
|---|---|---|
| `self.md` | who I am, and the prose of the relationships I begin with | authored; never changes; **is** the cache prefix |
| `knows` in `character.json` | the recognition key: which entity, and what I call them | authored; **seeds memory at tick 0** |
| memory | what has happened since, and what I made of it | grows at runtime |

A seeded person model carries no first-met tick. It was always there, the way a
grandmother has always known the girl from the shop.

---

### 1.1 Who has a memory at all is declared, not inferred

`createMemory` requires an explicit **`minds`** set. There is no default, and
that is deliberate:

- inferring it from `seeds` would leave a character who knows nobody yet
  (`man-01`) with no memory at all;
- inferring it from the roster would hand the dog one.

Both are wrong in a way that only shows up phases later. The scenario says.

An observer outside `minds` can never acquire a person model, an episode or an
audit line — not from standing beside somebody all day, not from being spoken
to, and not from a Brain proposal that should never have been made for it.
Seeding knowledge for something outside `minds` is refused at construction.

**The gate is on the observer only.** Everybody else still remembers the dog
perfectly well; that is what makes it a character rather than scenery.

There are exactly three doors into the store and exactly three checks — the
deterministic tick, `note()` and `learnLabel()` — plus the constructor's refusal.
Deeper belt-and-braces guards were written and then removed: a redundant guard
cannot be shown to bite, so removing it is a mutation the suite passes, and a
gate no test can hold is a gate that rots.

---

## 2. Two shapes, because they answer different questions

**Person model** — one per entity this observer has ever encountered.

```text
entityId          server-only join key
label             what THIS observer calls them
encounters        how many distinct meetings
spokenWith        how many of those involved words          (§6.1)
lastSeenTick      when contact last held
firstMetTick      null for seeded knowledge
seeded            true if it came from knows rather than from the world
open              whether a meeting is going on right now
```

`spokenWith` is a count, not a judgement, and it is the same class of thing as
`encounters` — the engine may honestly say *we have met four times and spoken on
two of them*. It may not say what that amounts to. It is tracked inside the open
encounter (words passed during this meeting or they did not), so it needs no
knowledge of conversation sessions and no help from 3E.

Small, permanent, and at most one per cast member. **This is what makes
recognition work.**

### 2.0 An encounter is a meeting, not a sample

Two people who spend the afternoon at one table met **once**.

So an encounter is explicit state, not a gap heuristic:

```text
open      when contact begins        -> encounters += 1
stays open while contact continues   -> no matter how long
closes    only after the two have been apart for separationTicks
```

`lastSeenTick` never moves backwards, because a queued utterance can carry an
older tick than the proximity seen on the same tick, and letting it move
backwards makes the next tick look like a fresh meeting after a long gap.

Contact means proximity within `nearRange`, **or** words passing between the
two. It does not mean a Brain wrote something down: `note()` and `learnLabel()`
create the person model if it is missing and never open an encounter. Otherwise
encounter timing would depend on which tick the scheduler happened to fire on,
and a character could "meet" somebody at the other end of the park by thinking
about them.

Required: **continuous proximity counts 1; leaving, staying away, and returning
counts 2.**

### 2.1 Perceived events are consumed without being taken

Perception's pending queue has two readers with different rights:

| reader | may drain | must see each event |
|---|---|---|
| Brain delivery (`contextFor`) | **yes** — delivery is what drains it | once |
| memory | **never** | exactly once |

Memory therefore carries a **per-observer cursor** over the monotonic `seq`
perception stamps on every queued event, and ingests only `seq > cursor`. A
position in the array cannot work, because the array is being emptied by
somebody else.

The consequence that has to hold:

> **A sentence can be remembered on the tick it was heard and still be waiting
> in the queue for a wakeup three hundred ticks later.** Neither consumer's
> timing can duplicate or erase the other's work.

**Episodes** — one per thing that happened.

```text
tick, kind, entityId, gist
```

Many, and they must fade. **This is what gives a conversation a past.**

---

## 3. Who writes it: both, split along the line that already exists

| | writes | when |
|---|---|---|
| **the engine** | encounter facts — this entity was present, at this tick, we were near, we spoke | deterministically, **as step 7 of every tick** |
| **the Brain** | prose — what I made of it, and what I now call someone | as a proposal, at commit |

### 3.1 Accumulation is a stage of the tick, not a call a scenario remembers

Memory accumulation is **step 7 of the canonical tick order**
(`phase-3c-perception.md` §2), owned by `loop.js` and passed `memory` at
construction. A scenario author never calls `memory.tick()`.

This is the same gap perception was in before `loop.js` existed: a thing that
works in the scenario that thought about it, and silently does not run anywhere
else. A loop given `memory` without `perception` is refused rather than running
and recording nothing.

Its position is load-bearing, not tidy — see `phase-3c-perception.md` §2 and
§2.1 above.

The consequence that matters:

> **If the provider is down, memory still accumulates.** Recognition keeps
> working, encounters keep counting, and only the interpretation is missing.

Same invariant as everywhere else: the world does not wait, and it does not stop
being a world when inference fails.

---

## 4. Recognition happens above perception, joined on `entityId`

Perception says *a tall thin man in a dark suit, `seen-1`*. It does not and may
not say who that is (`phase-3c-perception.md` §5).

The context builder then asks memory: **do I have a person model for the entity
behind `seen-1`?** If yes, the package gains:

```text
you recognise this person
you call them 森牧師
you have met twelve times
```

**That join is only possible because of the canonicalization contract**
(clarifications §1.1a). The ref resolves server-side; the model still never sees
an entity id.

### 4.1 The label comes from the observer, never from the target

This is the sharpest leak in 3D and the one worth stating twice.

> **A label is what *this observer* calls someone. It may never be read from the
> target's own files.**

The brothers get 「お店のおねえさん」. They must never get 「国分澄子」, because
that is her name and not their knowledge of her.

3B makes this structurally hard by accident and the accident is worth keeping:
**`character.json` has no name field at all.** Names live only in `bible.md` and
`self.md`, which perception and memory may never read. So a label can only come
from `knows.as` or from something heard in the world.

### 4.2 How a name is learned at runtime

Perception §7 already allows a name into experience through speech. Turning heard
words into "that label belongs to that person" is an **inference**, so it belongs
to the Brain:

```text
engine    records: these words were heard, from seen-1
Brain     proposes: I now call seen-1 森牧師
commit    canonicalize -> the label attaches to pastor-01
```

The same commit path 3C already built. Nothing new is needed.

---

## 5. Asymmetry is free, and must stay free

Memory is per observer, so 外婆 calling ユキ 「孫女」 while ユキ calls her
「おばあちゃん」 needs no mechanism — it is two stores. The engine must not
"reconcile" them, ever. Two characters remembering the same evening differently
is the point of this cast, not a bug to fix.

---

## 6. Forgetting, and why it is a cost problem

Person models are kept — there are at most eleven, and they are a line each.

Episodes are bounded and evicted **deterministically**: same state, same
survivors. Eviction ranks on salience and recency, never on a clock.

The reason to care is not memory pressure:

> **Memory is the dynamic suffix of every request.** `self.md` is the cached
> prefix and costs 0.1×; memory is re-sent uncached on every call. Its length is
> a per-call token cost, and the dynamic suffix is where the money actually goes
> (`pacing-and-latency.md` §6b).

So a long memory is expensive in a way a long self sheet is not.

### 6.1 The transcript boundary — the engine writes no episode for speech

This section revises implemented behaviour. Until 3E there was nowhere else for
a heard sentence to live, so memory wrote an episode for every one. That was
wrong the moment `phase-3e-conversation.md` §9 gave conversation a transcript of
its own, and the spec's own example is exactly what the old code produced:

```text
こんにちは
こんにちは
今日はいい天気ですね
そうですね
```

Four lines, four episodes, a sixth of a character's permanent budget, and
nothing worth keeping. Ten turns of a real conversation would have taken half of
it.

The rule that replaces it is almost tautological, which is why it is the right
one:

> **The engine writes exactly one kind of episode: `first_meeting`. Everything
> else in the episode list was proposed by the Brain.**

That is *the engine writes encounters; the Brain writes meaning* stated so that
it cannot be drifted away from. What the engine records about a conversation is
structural and permanent and costs one line per person:

```text
encounters   += 1   when a meeting opens
spokenWith   += 1   when words first pass during that meeting
lastSeenTick        while contact holds
```

Three consequences worth being explicit about.

**The exactly-once contract does not relax.** §2.1's cursor is still required —
now because re-ingesting a queued utterance would inflate `spokenWith` and drag
`lastSeenTick` backwards, which is the same defect wearing different clothes.
Ingestion still happens once; what changes is only what ingestion *writes*.

**Provider failure still accumulates.** With no Brain, a character keeps
recognition, encounter counts and the knowledge that words were exchanged. It
loses only *what the words meant*, which was never the engine's to hold. The
complete utterances remain in the fact stream for replay and for the offline
script pass regardless.

**Salience ranking keeps entries for kinds the engine no longer writes.** The
eviction table still ranks `speech_heard`, `direct_address`, `own_action_failed`
and the rest, because a Brain may propose an episode of any of those kinds. A
kind nothing writes is not a bug in the table; it is a kind nothing has proposed
yet.

---

## 7. Memory writes go to the audit stream

Memory is private, so it is not a world fact. But a run has to be debuggable, and
audit is already the stream for *why*.

Consequences, all of which already hold:

- the renderer and replay read facts only, and memory never reaches them;
- **the script pass may read audit** (`simulation-replay-architecture.md` §3.0),
  which is how interiority can reach an audience without touching that rule;
- replay does not need memory at all, because replay is playback.

---

## 8. Deterministic actors carry parameters, not memory

`dog-01` has `bonds`, not `knows`, and gets no memory store. Its familiarity does
not grow. This is 3B §8 unchanged: **a deterministic actor's personality is its
parameters**, and giving the dog an accumulating past would be modelling a mind
it does not have.

Starting empty is not the property. **Staying empty is.** The dog is not in
`minds` (§1.1), so being spawned in the middle of the people it would most
plausibly grow a past around — seen by them, spoken near, spoken to, for
hundreds of ticks — must still produce no person model, no episode and no audit
line, and a Brain proposal aimed at it must fail loudly rather than write
nowhere.

---

## 9. `attentionHint` finds its source

`pacing-and-latency.md` §1 left perception's salience hook deliberately empty,
filled by a trivial provider reading `knows`. **3D is the phase where memory
becomes that provider.**

The constraint is unchanged and binding: the hint returns **a number**. If it
returned a name, perception would be performing recognition.

---

## 10. Out of scope

```text
conversation sessions          3E
real provider calls            3G
emotion or affinity scores for LLM actors
relationship-evolution rules computed by the engine
narrative summarisation of a character's past
```

The engine counts and stores. **It does not decide that two characters are now
friends.** That judgement belongs to the Brain reading its own memory, and
putting a number on it in the engine would quietly move the character's interior
life out of the character.

---

## 11. Required tests

1. A seeded `knows` entry produces a person model at tick 0, with no first-met tick.
2. A label is never read from the target's files: the brothers' memory of the
   shopkeeper cannot contain her name.
3. Two observers remember the same entity under different labels, and nothing
   reconciles them.
4. Encounters accumulate with **no Brain involved at all**.
5. A Brain proposal is canonicalized before storage: no ref survives into memory.
6. Memory never appears in the fact stream, at any point in a run.
7. A memory written in epoch N still names the right entity after every epoch has
   been evicted.
8. Episode eviction is deterministic: same state, same survivors.
9. `dog-01` has no memory store, and **nothing creates one for it** — spawned
   among people, seen, spoken near and spoken to for hundreds of ticks, it holds
   no person model, no episode and no audit line; and everybody else still
   remembers the dog.
10. Recognition reaches the context only for an observer that has the person
    model — a stranger's package is unchanged.
11. The attention hint returns a number and never a name.
12. Accumulation happens because the loop runs, with no `memory.tick()` anywhere
    in the scenario; and a loop given memory without perception is refused.
13. A perceived utterance is ingested **exactly once** however long it waits,
    and is **still delivered** to the Brain afterwards.
14. Continuous proximity is **one** encounter; leaving, staying away past
    `separationTicks`, and returning is **two**; a brief absence is still one.
15. A Brain note or label about someone creates the person model and counts **no**
    meeting.
16. Ten conversational turns produce **no engine-written episodes** — the episode
    list holds only `first_meeting` and whatever the Brain proposed (§6.1).
17. Standing near someone and talking to them are distinguishable: `encounters`
    counts the meeting, `spokenWith` counts only the meetings words passed in,
    and neither inflates when an utterance sits in the queue.
