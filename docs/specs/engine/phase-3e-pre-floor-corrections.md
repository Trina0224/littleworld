# Phase 3E — Pre-Floor Corrections

**Status:** binding clarification / Floor Store implementation gate  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Applies to:** `phase-3d-memory.md`, `phase-3e-floor-clarifications.md` §10, `phase-3e-implementation-structure.md`  

This file closes two bugs found immediately before the Floor Store is built. Where this file is more specific, **this file wins**.

---

## 1. A person model is not proof of a meeting

The memory store has two different facts that must never be collapsed:

```text
I have a model / label / note about this entity
I have actually met this entity in the simulated world
```

The first can exist without the second. A Brain may recognise someone from prior knowledge, infer a label from something seen or heard, or write a note while the person is still across the park. None of those events is a meeting.

### 1.1 Only real contact may create `first_meeting`

A real encounter opens only from the already-binding contact rules:

```text
proximity within nearRange
OR
a landed directed utterance between the two
```

Passive overhearing does not count. A Brain proposal does not count. Learning a label does not count.

Therefore:

> **`ensure()` may create a person model, but may never set `firstMetTick`, increment `encounters`, or write a `first_meeting` episode.**

The first true call to the encounter path (`observe()` in the current implementation) owns all three meeting effects:

```text
first real contact, unseeded model
  -> firstMetTick = tick
  -> encounters += 1
  -> write exactly one first_meeting episode

later contact after separation
  -> encounters += 1
  -> no second first_meeting episode
```

For authored `knows` / seeded models, `firstMetTick` remains `null`: the simulation did not witness their original first meeting.

### 1.2 Brain writes may create "known but not met"

`note()` and `learnLabel()` are explicitly allowed to create a person model that looks like:

```text
label            maybe present
encounters       0
spokenWith       0
firstMetTick     null
open             false
```

This state is valid and intentional.

The Brain may know *of* someone without the World Engine claiming they have met.

### 1.3 Required tests

```text
1  note() about a never-met entity creates a person model but no first_meeting
2  learnLabel() about a never-met entity does the same
3  first later proximity creates exactly one first_meeting and fills firstMetTick
4  first later landed direct address does the same even outside nearRange
5  later meetings increment encounters without creating another first_meeting
6  seeded knowledge keeps firstMetTick = null even after an in-world encounter
```

---

## 2. Overheard-nudge suppression outlives a temporary Floor

`phase-3e-floor-clarifications.md` §10 correctly gives a cross-zone overhearer one optional `why = overheard` offer rather than silently treating overhearing as participation.

It also correctly says a one-LLM zone may create a temporary Floor for that offer and destroy the Floor as soon as the offer resolves.

Those two rules create a lifetime bug if the "already nudged" flag lives on the temporary Floor:

```text
near-table line 1
  -> temporary counter Floor
  -> shopkeeper gets overheard nudge
  -> declines
  -> temporary Floor destroyed
  -> suppression flag disappears

near-table line 2
  -> new temporary counter Floor
  -> same nudge again
```

That turns one nudge per conversation into one provider call per sentence.

### 2.1 The suppression state belongs to the source social spell

> **An overheard nudge is spent against the source zone's active social spell, not against the lifetime of the target's temporary Floor.**

Each source zone has a monotonically increasing server-side `socialSpell` (the exact field name may differ):

```text
source floor is newly created or re-armed after dormancy
  -> socialSpell += 1

source floor remains active through many utterances / rounds
  -> same socialSpell

source floor goes dormant
  -> spell ends

later social event re-arms it
  -> new socialSpell
```

3E keeps suppression outside temporary Floor state, conceptually:

```text
overheardSpent[(observerId, sourceZone, sourceSocialSpell)] = true
```

The target zone may create and destroy any number of temporary Floor objects; that must not erase this record.

### 2.2 Eligibility

A cross-zone actor may receive `why = overheard` only when all are true:

```text
they can make out the source conversation (`speech_heard`, not sound_heard)
they are not already participating in the source zone
they are not already in an active conversation that should occupy them
no spent record exists for (actor, sourceZone, current sourceSocialSpell)
```

Once an overheard offer is created, the spent record is set **before provider dispatch**. A provider failure, explicit `nothing`, scheduler drop after use, or accepted approach must not cause the same source spell to poll the actor again.

A drop before the offer/context is ever used may remain unspent, consistent with the provisional-delivery rule in `phase-3e-floor-clarifications.md` §8.2.

### 2.3 Reset conditions

The actor becomes eligible for another overheard nudge from that source only when the source zone begins a **new social spell**.

These do *not* reset it:

```text
temporary target Floor destroyed
another sentence is spoken
another round begins while the source Floor remains active
actor declines
provider returns nothing
ordinary cafe/background machinery
```

Movement into the source zone makes the nudge irrelevant because ordinary floor membership takes over.

Old spent records may be garbage-collected after the source spell ends; the observable rule must remain identical.

### 2.4 Determinism and cost

`socialSpell` is derived entirely from committed floor-state transitions, and the spent key is server-side working state. Provider response timing never selects whether the nudge exists.

This preserves the intended cost invariant:

> **One quiet cross-zone observer gets at most one "should I go over?" opportunity per active social spell, not one per utterance.**

### 2.5 Required tests

```text
1  twenty lines in one source social spell produce at most one overheard offer to one remote actor
2  declining destroys a temporary target Floor but does not make a second nudge eligible
3  provider failure after dispatch also spends the nudge
4  a new source social spell after dormancy may produce one new nudge
5  two different observers each have their own independent spent key
6  two different source zones each have their own independent spent key
7  target-Floor creation/destruction never changes the source spell id
```

---

## 3. Gate for the Floor Store

> **Step numbering.** This document says "3E-2" for the Floor Store. In the
> current order (`phase-3e-implementation-structure.md` §17) the Floor Store is
> **3E-3**; 3E-2 is the perception delivery change (`contextFor` + `settle`),
> which was inserted ahead of it because it alters a shipped 3C contract and
> every offer round depends on being able to withdraw a context without
> consuming anything. The gate below is about the Floor Store, whatever it is
> numbered, and §1 is already implemented and tested.

The Floor Store may now rely on these invariants:

```text
person model != meeting
first_meeting is encounter-derived only
overhearing creates no memory relationship by itself
overheard nudge suppression is source-spell state, not Floor-instance state
```

Do not implement the Floor Store with a temporary-Floor-local
`overheardNudgeSpent` boolean. That implementation is explicitly
non-conforming.
