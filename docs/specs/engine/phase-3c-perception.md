# Phase 3C — Perception and Subjective Context

**Status:** implementation contract draft  
**Created:** 2026-08-23 22:38 PT (`America/Los_Angeles`)  
**Companion to:** `world-engine-2.5.md` §4 and §6, `character-identity.md` Phase 3B

> **Implemented.** `src/engine/perception.js`, `zones.js` and `placement.js`;
> proved by `src/engine/perception.test.js`; shown by `src/engine/run-3c.js`.
> Every test in §14 and in the clarifications §6 is asserted. The zone geometry
> §9 requires is measured in `docs/specs/world/zones.json`.

Phase 3C does not invent a new architecture. It makes the existing World Engine 2.5 perception boundary precise enough to implement.

The core rule is:

> **The World Engine determines what an agent can perceive. The Agent Brain determines what those perceptions mean.**

Three consequences follow:

```text
WORLD TRUTH != AGENT PERCEPTION
PERCEPTION != INTERPRETATION
SENSORY DATA NEVER REVEALS INTERNAL IDENTITY
```

## 1. Responsibility

The World Engine is the authoritative owner of physical/shared reality: time, presence, positions, movement, activities, resources and committed world events.

The Perception Engine is the sensory boundary between that reality and each private Agent Brain. It acts as the agent's eyes, ears and spatial/event sensing. An Agent Brain does not query the world database directly.

```text
Authoritative World
        |
        v
Perception Engine
        |
        +-- Agent A sensory state
        +-- Agent B sensory state
        +-- Agent C sensory state
        |
        v
private Agent Context
```

The same objective world may therefore produce different sensory packages for different agents.

## 2. Per-tick contract

Every simulation tick may update the current sensory state of every **present** agent. This is deterministic engine work and does not imply an LLM call.

The conceptual tick order is:

```text
1. advance integer world clock
2. advance deterministic movement
3. advance deterministic activities
4. update reservations / occupancy / presence
5. commit resulting world facts
6. refresh perception state for each present agent
7. evaluate whether any agent needs a Brain wakeup
8. dispatch eligible Brain requests asynchronously through the scheduler
```

Steps 1–7 never wait for inference. Step 8 cannot block the next world tick.

`presentIds()` is the candidate population for perception. A rostered character who is absent today is not visible, audible, targetable or otherwise perceptible inside this scene.

## 3. Perception refresh is not LLM invocation

The engine may refresh sensory state every tick because positions and activities can change every tick. The LLM receives that state only at a meaningful decision point, for example:

- the agent is idle and needs a new intention;
- someone directly addresses the agent;
- an active conversation reaches the agent's turn;
- the current activity or plan becomes invalid;
- a sufficiently salient event requires a decision;
- an activity reaches a meaningful branch.

An agent that is walking, sitting, working or waiting continues doing so while its sensory state changes. No model call is required merely because another character moved a little closer.

## 4. World Engine owns movement

Agent LLMs never own or mutate coordinates.

An Agent Brain may propose a semantic intention such as:

```text
approach the elderly woman near the bench
sit at the nearby bench
walk toward the cafe entrance
```

The Activity Runtime and World Engine resolve that proposal into legal targets, paths, reservations, speed and per-tick position updates.

The LLM-visible context should use human-scale spatial language where possible (`near`, `across the park`, `by the cafe`) rather than exposing the engine coordinate system.

The renderer consumes authoritative positions and activity state; it does not infer them from LLM prose.

## 5. Sensory description only — no server-side naming

This section supersedes the earlier example in `world-engine-2.5.md` §6.3 where an acquaintance could receive `You recognize Daniel`.

**The Perception Engine does not perform identity resolution for the Agent Brain.**

Even when the server knows an entity is `pastor-01`, the LLM-visible visual observation contains only sensory/public information, for example:

> 一名高瘦、帶明顯西洋輪廓、穿深色西裝的中年男子站在喫茶店入口附近。

It must not silently become:

> 森牧師站在喫茶店入口附近。

The Agent Brain may infer that the description is 森牧師 because its own private `self.md` or memory contains knowledge about him. That inference belongs to the character, not to the world's sensory layer.

This deliberately permits uncertainty and mistaken recognition.

## 6. Internal records and LLM-visible records

The engine still needs stable internal entity IDs for tracking events, movement, conversation membership and later memory linkage. Therefore perception has two representations.

### 6.1 Internal perception record

Server-only, may contain identifiers:

```json
{
  "observerId": "grandma-01",
  "entityId": "pastor-01",
  "kind": "person_seen",
  "appearance": "身材高瘦、帶明顯西洋輪廓的中年男子，穿樸素深色西裝",
  "distance": "near",
  "activity": "standing"
}
```

### 6.2 LLM-visible observation

Sanitized before context assembly:

```json
{
  "kind": "person_seen",
  "appearance": "身材高瘦、帶明顯西洋輪廓的中年男子，穿樸素深色西裝",
  "distance": "near",
  "activity": "站在喫茶店入口附近"
}
```

The LLM-visible form must not contain `entityId`, canonical name, character folder path, sprite key, `knows` entry, or any other machine field that reveals identity.

Internal IDs may later be attached server-side to memory provenance; they are never sensory facts.

## 7. Speech and names

Names can enter an agent's experience through the fiction.

If a person says:

> 「森ジョナサンです。」

then `森ジョナサン` may appear in the hearer's observation because it is literal **speech content** the hearer perceived. The Perception Engine did not identify the speaker; it reported audible words.

Likewise, if a third person says `森牧師が来たよ` within hearing range, the name is heard information. Whether the observer believes that claim, and which visible person it refers to, belongs to interpretation and memory.

## 8. Source of appearance

For characters, the sensory appearance description comes from the public `appearance` field in that character's `character.json`.

The perception layer must never read another character's:

```text
self.md
bible.md
private traits
private goals
private memories
private interpretation of relationships
```

`appearance` is world truth because it describes what the art publicly shows. It carries no canonical name.

## 9. MVP spatial perception

Phase 3C deliberately does not implement ray casting or use `occdepth.png` as line of sight.

`occdepth.png` is presentation depth, not cognition.

MVP perception uses:

```text
presence
+ semantic zone
+ distance
+ hearing range
+ event relevance
+ salience
```

Candidate semantic zones remain:

```text
cafe-counter
near-table
far-table
park-open
street-edge
backstage
```

> Corrected: this list said `cafe-terrace` where §9.1 and
> `phase-3c-implementation-clarifications.md` §3 say `near-table` / `far-table`.
> The clarifications naming wins, because it matches the anchor groups that
> already exist in `anchors.json` (`table-near-*`, `table-far-*`) and because a
> single source of truth cannot have two spellings. The measured geometry is in
> `docs/specs/world/zones.json`.

Exact geometry and thresholds are implementation data, not prose embedded in Agent prompts.

Initial qualitative behavior:

```text
same zone       ordinary visibility
adjacent zone   possible visibility with lower salience
far zone        normally omitted
```

Hearing is separately distance-bounded. Seeing a speaker does not imply hearing the words.

### 9.1 Semantic destinations and engine-owned placement — decided

LLMs reason about **social/semantic destinations**, not individual seat IDs or coordinates.

The model-visible vocabulary should stay small and natural, for example:

```text
吧台 / cafe counter
近桌 / near table
遠桌 / far table
公園長椅 / park bench
公園空地 / park open area
街邊 / street edge
某個人
某群正在聊天的人
```

The canonical physical anchors in `anchors.json` remain engine-only implementation detail. Existing IDs such as `table-near-3`, `counter-stool-2` and `bench-slot-1` are stable resources for movement, reservation and replay; they are **not** vocabulary the LLM is expected to learn or reason about.

The design rule is:

> **LLM chooses social destination; World Engine chooses physical placement.**

Examples of valid Agent Brain proposals:

```text
go to the near table
approach the woman in the white apron
walk over to the group talking at the far table
stand near the cafe counter
```

The World Engine / Activity Runtime then resolves the intention into the exact legal destination. It may choose a free seat, a standing position beside the table, or another nearby legal interaction point according to occupancy and geometry.

Going to a table does **not** imply sitting down. Sitting is a separate decision/activity. If the seats are full, or if the character simply prefers not to sit, the engine may place the character at a legal standing interaction spot and conversation can continue normally.

Conceptually a semantic area may expose internal interaction capacity such as:

```text
near-table
  seats: table-near-1..4
  standing-spots: engine-defined legal positions around the table
```

The LLM does not receive those IDs. It may receive a human-scale summary such as:

> 近桌有三個人坐著，還有一個空位；桌邊也有可以站人的空間。

or:

> 遠桌已經坐滿，但旁邊還可以站人交談。

Perception should describe spatial relationships that a sighted person would naturally understand, such as `在你右前方`, `同一張桌的另一側`, `靠近吧台`, or `公園另一邊`, but it must not expose raw coordinates or require the model to reconstruct geometry.

When an agent targets a visible person rather than an area, the engine resolves an appropriate approach/interaction position around that person's current authoritative position. The target person's canonical identity remains server-side; the LLM refers to that person through the sensory description it was given.

## 10. Observation classes

Phase 3C should support at least:

```text
person_seen
animal_seen
public_activity_seen
movement_seen
speech_heard
sound_heard
direct_address
nearby_world_event
own_activity_changed
own_action_failed
```

The exact serialized schema may be refined during implementation, but every class must remain sensory/public rather than interpretive.

Bad:

```text
Daniel looks worried about his job.
```

Better:

```text
The man has been staring at his untouched coffee and has barely moved for several minutes.
```

The first asserts an inner state. The second reports observable behavior and lets the Agent Brain interpret it.

## 11. Salience and attention

Visible does not mean worth sending to a Brain request.

Perception state may contain more than the final observation package. Before a Brain wakeup, observations are ranked/filtered so the model is not flooded with every idle person in the scene.

Initial priority order:

```text
directly addressed              very high
own activity changed/failed     very high
current interaction changed     high
very close new event            high
current target relevant         high
sudden movement/change          medium
ordinary nearby person          medium/low
unchanged distant person        low
```

Do not use `known person` as an engine-side salience boost in Phase 3C if determining "known" would require reading the observer's private prose. Recognition/relationship interpretation belongs above perception. A later memory interface may provide an explicit non-prose attention hint if needed.

Low-salience unchanged observations may be omitted from a Brain request even though they remain physically perceptible.

## 12. Current sensory state vs event history

The Perception Engine should distinguish:

- **state** — what is true now: who is nearby, where approximately, what they are visibly doing;
- **perceived events** — meaningful changes since the observer's previous relevant context: someone arrived, sat down, spoke, left, dropped something, addressed the observer.

Do not send the same unchanged scene description as a growing event history every tick.

The global fact stream is not an agent's memory. Perceived events are derived from committed facts according to presence, distance, hearing and relevance.

### 12.1 One exception, and it is not a loophole — decided

`own_action_failed` (§10) cannot be derived from committed facts, because **a failed
attempt is not a fact**. Nothing in the world changed. The engine already routes
failures to the audit stream by design:

```js
// src/engine/activity.js
log.note(world.tick, 'step_failed', { agent: id, activity: a.name, step: step.type });
```

and `src/engine/events.js` states that the renderer may never read audit. Promoting
failures to facts to satisfy §10 would be the wrong repair: the fact stream is what
replay plays back, so replay would start performing attempts that never happened.

The correct reading is that **an agent's own failed attempt is private knowledge, not
a world event**:

```text
committed fact   -> may be perceived by anyone the perception rules allow
audit note       -> perceptible to exactly one agent: the one who attempted it
```

So the Perception Engine has **one** legitimate consumer of the audit stream besides
debugging, and it is narrowly scoped:

1. Only `own_action_failed` may be sourced this way.
2. Only the acting agent may receive it. It is never visible to any other observer,
   at any distance, under any salience rule.
3. It never enters another agent's `pendingPerceivedEvents[]`.
4. The renderer and replay still read facts only. This decision does not widen their
   access by one field.

This *strengthens* the facts/audit split rather than weakening it. Before this
decision the audit stream had no defined consumer inside the simulation, and §10
quietly required one. Now the boundary is stated: the world publishes what happened,
and an agent additionally knows what it tried.

`own_activity_changed` needs no exception — `activity_started` and `activity_ended`
are already facts.

**Required test (adds to §14):** a failed activity produces `own_action_failed` for
the acting agent and appears in no other agent's observation package or pending
queue, at any distance.

## 13. Subjective context output

Phase 3C stops before LLM integration. It should nevertheless produce the dynamic sensory portion that a future Agent Context Builder can consume.

Conceptually:

```json
{
  "observer": "server-only",
  "tick": 1842,
  "sensoryState": {
    "visible": [],
    "audible": []
  },
  "recentPerceivedEvents": []
}
```

Before anything is exposed to a model, server-only identifiers and bookkeeping fields are removed.

The final model context later combines:

```text
private self sheet
+ private memory
+ current legal activities
+ sanitized current observations
+ active conversation context
```

Phase 3C implements only the observation side.

## 14. Required leak tests

At minimum, automated tests must prove:

1. An observation never exposes another character's canonical name merely because the server knows it.
2. An observation never exposes `entityId`, sprite key or character file path to the model-visible form.
3. The Perception Engine never reads another character's `self.md` or `bible.md` to describe them.
4. An absent rostered character never appears in another agent's sensory state.
5. A distant unheard speech fact does not expose its text.
6. A directly addressed audible utterance reaches the intended observer when spatial rules permit it.
7. Two observers in different positions can receive different observations from the same world fact.
8. The global event log cannot be passed directly as an Agent observation package.
9. Movement coordinates remain server-side; model-visible spatial descriptions do not require raw world coordinates.
10. Perception refresh does not dispatch or await an LLM call.
10a. A failed activity yields `own_action_failed` to the acting agent only, and to no
    other observer's package or pending queue at any distance (§12.1).
11. LLM-visible destinations use semantic areas/person descriptions rather than canonical seat IDs.
12. A full table can still admit a standing interaction position when geometry allows it; `go_to_area` must not imply `sit`.

## 15. Phase 3C acceptance scenario

Create a deterministic scenario with at least three present LLM characters and one absent rostered character.

- A and B stand near each other in the park.
- C is in or near the cafe.
- D belongs to the roster but is absent today.
- B speaks at ordinary volume.
- A is close enough to hear the words.
- C may see activity across the area but is too far to receive the speech content.
- D appears in nobody's observation.

All visible people are described only by appearance/public activity. No model-visible output contains their canonical names or internal IDs.

Then move one character and repeat the perception query to prove that the same objective cast yields different subjective packages by position.

Also exercise one semantic destination: ask a scripted/mock intention to approach a table or person, let the engine resolve the concrete physical position, and verify that a full set of seats does not prevent a legal standing interaction when standing space exists.

No LLM is used anywhere in this acceptance test.

## 16. Explicitly out of scope

Phase 3C does **not** implement:

```text
LLM identity recognition
long-term memory
relationship evolution
conversation sessions
LLM scheduler/provider calls
emotion simulation
ray-cast / pixel LOS
model-generated observation prose
```

Recognition of a described person by name is deliberately deferred to the private Agent Brain plus its seeded knowledge/memory.

## 17. Boundary for the next phases

After 3C, the engine can answer:

> What can this character perceive right now?

A later private-memory phase can answer:

> What does this character remember about what it has perceived?

The Agent Brain can then answer:

> What do I think these perceptions mean, who do I think these people are, and what do I want to do next?

Keeping those three questions separate is the purpose of Phase 3C.
