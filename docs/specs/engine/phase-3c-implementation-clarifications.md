# Phase 3C — Implementation Clarifications

**Status:** binding supplement before implementation  
**Created:** 2026-08-23 23:34 PT (`America/Los_Angeles`)  
**Companion to:** `phase-3c-perception.md`, `phase-3c-venue-interactions.md`, `world-engine-2.5.md`

This file closes the remaining Phase 3C contract gaps found during pre-implementation review. Where this file is more specific than the earlier Phase 3C draft, this file wins.

The four decisions below are binding for implementation.

## 1. Ephemeral perception references — decided

The model must be able to refer back to a person, animal, or other perceived target without receiving the target's canonical engine ID or name.

Therefore every LLM-visible observation package may assign a short-lived opaque **perception reference** such as:

```text
seen-1
seen-2
heard-1
```

Example LLM-visible observation:

```json
{
  "ref": "seen-2",
  "kind": "person_seen",
  "appearance": "白髮盤起、戴眼鏡、穿酒紅色開襟毛衣與白圍裙的老太太",
  "location": "近桌旁",
  "activity": "站著和人說話"
}
```

The model may later propose:

```json
{
  "activity": "approach",
  "target": "seen-2"
}
```

Server-side only, the current perception snapshot may map:

```text
seen-2 -> grandma-01
```

The model never sees that mapping.

### 1.1 Scope and lifetime

A perception reference is **not identity** and must never become long-term knowledge.

It is valid only within a bounded perception/context epoch. The implementation may choose one of these equivalent policies:

- valid until the next Brain context snapshot replaces it; or
- valid for a small explicit number of perception epochs/ticks.

Whichever policy is chosen must be deterministic and tested.

A stale reference must fail cleanly rather than silently retargeting another entity.

### 1.1a Refs are transport; anything durable is canonicalised at commit — decided

The problem this closes is concrete. Memory will want to record something like *"I
spoke with seen-2"*. A ref is not identity and expires, so a record that stores one is
a **dangling pointer the moment it is written**.

> **An ephemeral perception ref MUST be canonicalised to the server-only entity id at
> the moment a reply is committed. Long-term memory MUST NOT depend on a retained
> `seen-N` epoch.**

So the flow is:

```text
context out      seen-2                (the Brain never learns an id)
reply back       { target: "seen-2" }
commit           canonicalise -> { target: "grandma-01" }
stored           grandma-01            (no ref anywhere)
epoch            disposable from this instant
```

An earlier draft of this section said instead that the mapping must be *retained for as
long as any memory derived from it is retained*. **That was the weaker answer and is
superseded.** It made how long an agent can remember something depend on how large a
cache happens to be — two entirely unrelated concerns wired together, and a silent
correctness constraint on an eviction policy. Canonicalising at commit removes the
coupling: the epoch cache is a transport window sized for a request and its answer, and
evicting all of it can never orphan a record.

Nothing changes on the model side. The Brain still never sees an entity id and still
cannot address anyone by one.

A ref that cannot be resolved at commit time must **fail cleanly and be reported**,
never be repaired by guessing at a nearby entity — the same rule §1.1 states for stale
refs, now applying where it actually bites.

**Required tests (add to §6):** a record committed in epoch N still names the same
canonical entity after every epoch has been evicted, with the cache shrunk to one entry;
no ref token survives canonicalisation into anything that would be stored; and a stale
ref is reported as unresolved rather than silently retargeted.

### 1.2 Stability inside one context

Within one delivered Brain context, the same perceived entity must use the same reference everywhere. Do not describe the same person once as `seen-2` and later in the same context as `seen-5`.

References may change in a later context snapshot. They are pointers into current perception, not durable names.

### 1.3 No identity leakage through references

Bad:

```text
pastor-01
character-7
grandma
known-person-3
```

Good:

```text
seen-1
seen-2
heard-1
```

The token itself must carry no semantic hint about identity, relationship, role, folder name or sprite.

## 2. Pending perceived-event queue — decided

Current sensory state and transient perceived events are different things.

A spoken sentence, arrival, direct address, dropped object or sudden action may happen many ticks before the next Brain wakeup. It must not disappear simply because perception is refreshed every tick.

Each present agent therefore owns a server-side queue conceptually equivalent to:

```text
pendingPerceivedEvents[]
```

### 2.1 Event flow

```text
committed world fact
        |
        v
Perception filter for observer
        |
        +-- not perceptible -> discard for that observer
        |
        +-- perceptible -> append observer-specific perceived event
                                |
                                v
                    pendingPerceivedEvents[]
```

This queue is **not long-term memory**. It is an undelivered sensory inbox between World Engine ticks and the next relevant Agent Brain context.

### 2.2 Delivery semantics

When a Brain request is prepared, the server takes an immutable snapshot of:

```text
current sensory state
+ eligible pending perceived events
```

The events included in that snapshot are marked as delivered to that context epoch.

They must not be deleted before a valid context snapshot exists. Network delay, scheduler delay or the simple absence of a Brain wakeup must not erase them.

If a Brain request later fails, times out or is dropped, delivery bookkeeping must follow one deterministic policy and be documented in code. The preferred MVP policy is:

> Once an event has been included in a successfully constructed Brain context snapshot, it is considered delivered even if inference later fails; the Agent's deterministic fallback continues. Do not repeatedly resend the same old utterance on every retry.

This keeps the queue a perception-delivery mechanism rather than a reliable message broker.

### 2.3 Bounded growth

The queue must be bounded. Low-value repetitive events may be coalesced or dropped according to deterministic rules.

However these classes must not be silently displaced by ordinary low-salience visual noise:

```text
direct_address
speech_heard that is relevant to the observer
own_activity_changed
own_action_failed
important nearby world event
```

Conversation-specific retention rules belong to the later Conversation Session phase, not Phase 3C.

### 2.4 No global event-log shortcut

The per-agent pending queue contains only events that passed that observer's perception rules. It must never be populated by copying the global fact stream wholesale.

## 3. Canonical semantic-zone geometry — required before zone-dependent code

The Phase 3C draft names semantic areas such as:

```text
cafe-counter
near-table
far-table
park-open
street-edge
backstage
```

Names alone are insufficient. The engine needs one canonical world-data source that answers which semantic area contains a world position.

Therefore Phase 3C requires a world-spec artifact:

```text
docs/specs/world/zones.json
```

### 3.1 Single source of truth

`zones.json` will own semantic-area geometry and adjacency. Engine code must not duplicate those regions as hand-written magic coordinate ranges.

Conceptually:

```json
{
  "zones": [
    {
      "id": "near-table",
      "shape": "polygon",
      "points": [[0,0],[0,0],[0,0]],
      "neighbors": ["cafe-counter", "park-open"]
    }
  ]
}
```

The coordinates above are illustrative only. **Do not invent final polygons from this document.** They must be measured from the actual current scene/world geometry before implementation depends on them.

### 3.2 Zone assignment

The deterministic mapping is:

```text
authoritative position
        -> zones.json
        -> semantic zone / area
```

If an object or person lies on a boundary, the implementation must use one deterministic tie-breaking rule.

### 3.3 Engine vocabulary vs model vocabulary

The internal zone ID may be stable machine vocabulary (`near-table`), while the LLM-visible text may be localized/natural (`近桌`, `near table`).

Raw polygon coordinates are never exposed to the model.

### 3.4 Overlap

Prefer non-overlapping primary movement/perception zones for MVP. If overlap becomes necessary later, define explicit priority rather than relying on array order accidentally.

## 4. Standing interaction placement — decided boundary, algorithm deferred to implementation

Phase 3C requires agents to be able to join a table or group even when every seat is occupied. This does **not** require hand-authoring a large set of permanent standing anchors immediately.

For MVP, standing placement may be computed deterministically from:

```text
target semantic area / target person
+ navgrid walkability
+ occupied/reserved resources
+ minimum personal-space distance
+ stable deterministic candidate ordering
```

The key contract is:

> **Standing placement is World Engine / Activity Runtime work. Perception never invents coordinates, and the LLM never chooses them.**

If a free seat exists, the character still does not automatically sit. `go_to_area`, `approach_person` and `sit` remain separate intentions/activities.

If all seats are occupied but legal standing space exists, approaching/joining remains legal.

If neither seating nor standing placement is legal, the activity fails cleanly and the Agent may receive an `own_action_failed` perceived event at a later decision point.

The exact candidate-generation algorithm may be selected during implementation, but it must be deterministic and covered by tests.

## 5. Target resolution boundary

Combining the decisions above, model targeting works like this:

```text
World Engine knows canonical entity IDs and positions
        |
        v
Perception creates sanitized observations + ephemeral refs
        |
        v
Agent Brain says:
  approach seen-2
  or go to near table
        |
        v
Server resolves ref / semantic area internally
        |
        v
Activity Runtime chooses exact legal physical placement
```

The Agent Brain never needs to reconstruct geometry from prose and never receives canonical entity IDs.

## 6. Additional required tests

In addition to the tests already listed in `phase-3c-perception.md`, implementation must prove:

1. Two visually similar entities can still be targeted unambiguously through different ephemeral refs.
2. A perception ref never exposes the mapped canonical entity ID.
3. A stale perception ref fails rather than being rebound to another entity.
3a. A record committed in epoch N still names the same canonical entity after every
    epoch has been evicted, with the epoch cache shrunk to a single entry (§1.1a).
3b. No ref token survives canonicalisation into anything that would be stored.
3c. A ref that is stale at commit time is reported as unresolved, never retargeted.
4. The same entity uses one stable ref throughout a single delivered context snapshot.
5. A speech event perceived at tick N is still available at a later Brain wakeup even after many perception refreshes.
6. An unperceived global fact never enters that observer's pending perceived-event queue.
7. Direct address / relevant speech is not silently dropped because many ordinary visual events occurred afterward.
8. A constructed Brain-context snapshot has deterministic event-delivery semantics and does not resend the same delivered event indefinitely after inference failure.
9. Semantic zone membership comes from canonical world-spec geometry rather than duplicated code constants.
10. Boundary-zone assignment is deterministic.
11. A full table with legal nearby walkable space permits a deterministic standing placement.
12. Re-running the same standing-placement scenario from the same state produces the same physical destination.

## 7. Implementation readiness

Phase 3C may begin once the following are true:

```text
[x] sensory/identity boundary is specified
[x] appearance source is character.json.appearance
[x] semantic destination vs physical placement boundary is specified
[x] ephemeral target-reference contract is specified
[x] pending perceived-event delivery contract is specified
[x] canonical zone artifact requirement is specified
[x] standing-placement ownership and determinism are specified
[x] actual zones.json geometry has been measured from the current scene
```

All items are now closed. The geometry was measured by
`docs/specs/world/zones-derive.py`, which asserts what hand-authoring the JSON
could not: every walkable cell lands in exactly one zone, and every seat and
station in `anchors.json` lands in the zone its group says it should. Backstage
is taken from `backstage.png` rather than drawn again, so the two cannot drift.

Venue obligations, broadcast ordering, the public telephone and vending machine remain governed by `phase-3c-venue-interactions.md`; they do not change the contracts above.
