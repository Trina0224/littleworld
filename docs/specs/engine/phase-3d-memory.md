# Phase 3D — Private Memory

**Status:** implementation contract
**Created:** 2026-08-25
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

## 2. Two shapes, because they answer different questions

**Person model** — one per entity this observer has ever encountered.

```text
entityId          server-only join key
label             what THIS observer calls them
encounters        how many times
lastSeenTick      when
seeded            true if it came from knows rather than from the world
```

Small, permanent, and at most one per cast member. **This is what makes
recognition work.**

**Episodes** — one per thing that happened.

```text
tick, kind, entityId, gist
```

Many, and they must fade. **This is what gives a conversation a past.**

---

## 3. Who writes it: both, split along the line that already exists

| | writes | when |
|---|---|---|
| **the engine** | encounter facts — this entity was present, at this tick, we were near, we spoke | deterministically, every tick |
| **the Brain** | prose — what I made of it, and what I now call someone | as a proposal, at commit |

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
9. `dog-01` has no memory store, and nothing creates one for it.
10. Recognition reaches the context only for an observer that has the person
    model — a stranger's package is unchanged.
11. The attention hint returns a number and never a name.
