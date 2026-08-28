# LittleWorld Replay / Presentation — Binding Implementation Contract

**Status:** binding — **NEXT ACTIVE WORKSTREAM**  
**Created:** 2026-08-28 (`America/Los_Angeles`)  
**Consumes:** `simulation-replay-architecture.md`, the committed Simulation fact stream, Phase 3F venue/ambient facts.  
**3G status:** parked; real provider adapters are not required to build Replay.

This file defines the audience-facing Replay product. It supersedes older wording in `simulation-replay-architecture.md` where that wording requires presentation dialogue to remain byte-for-byte identical to Simulation dialogue.

The owner decision is:

> **Simulation creates the causal source history. A completed run may then be handed as a whole script to an editorial LLM before Replay. The final Replay does not have to be a tick-for-tick or word-for-word reproduction of the generation process.**

The distinction is deliberate. Simulation correctness and Replay quality are different goals.

---

## 1. What already exists

`src/engine/view.js` already provides a low-level exact replay primitive:

```text
recording.facts
  -> replay()
  -> createView()
  -> one presentation snapshot per simulation tick
```

This is valuable infrastructure and must remain available as an exact regression/debug mode.

It is not the audience Replay product because it still:

- follows every simulation tick;
- uses fixed tick-based speech display duration;
- does not build a separate presentation timeline;
- ignores most cafe/ambient facts;
- has no script/editorial pass;
- has no player UI, scene selection, scrubber, subtitle policy, or camera policy.

Do not delete or distort exact replay to build audience Replay. They are two modes over the same recording.

---

## 2. Replay pipeline

The intended product pipeline is:

```text
Simulation recording
      ↓
Recording Normalizer / Story Extractor
      ↓
Optional whole-record editorial LLM pass
      ↓
Validated Presentation Script
      ↓
Presentation Timeline Builder
      ↓
Replay Player / Renderer
```

No Agent Brain is rerun in this pipeline.

The editorial LLM is not a character. It sees the selected recording as an editor/director and may improve presentation pacing and, within the constraints below, lightly clean dialogue for a coherent audience script.

---

## 3. Two clocks, permanently separate

Replay must never equate simulation ticks with audience seconds.

```text
simulation tick/order   = what happened and causal ordering
presentation time       = when the audience sees/hears it
```

Pure provider waiting is disposable. Long idle gaps may be compressed. Deterministic actions that matter visually retain enough duration to remain understandable.

Examples:

```text
Simulation:
A speaks
[provider takes 47 wall-clock seconds]
B replies

Replay:
A speaks
[1.5–3 s readable/social pause]
B replies
```

and:

```text
Simulation:
tea preparation takes 110 simulation ticks

Replay:
show enough preparation to communicate that tea was actually made,
possibly accelerated, but do not make it appear instant if that breaks causality.
```

---

## 4. What the editorial/script pass may change

The whole-record editorial pass may:

- choose an interesting span from a longer run;
- remove dull/redundant stretches;
- compress or expand pauses;
- assign per-character reply rhythm;
- decide subtitle segmentation;
- choose camera/focus suggestions;
- summarize or compress repetitive deterministic work for presentation;
- lightly clean awkward dialogue, repetitions, truncation artifacts, or wording when needed for a coherent final script;
- omit a line that adds nothing, provided its removal does not break later causality;
- add presentation-only captions/narration that are clearly editorial rather than world facts.

This explicitly means the final Replay may not be word-for-word identical to the Simulation transcript.

However the script pass may **not** silently rewrite the underlying story into a different history.

---

## 5. Causal fidelity rules

The edited presentation must preserve the important causal truth of the source recording.

It must not:

- change who performed a consequential action;
- change who an order belonged to;
- make a character know a person they did not know at that point;
- reverse the order of causally dependent events;
- invent a meeting, movement, purchase, serving, departure, or other world event that never occurred;
- turn a declined/rejected Brain proposal into a world event;
- reveal private memory/identity as objective public fact unless presented explicitly as interiority/editorial context;
- contradict authoritative ambient/menu/world conditions for that recording.

Dialogue may be editorially cleaned, but if a changed line would alter a later action's cause or a character's established knowledge, that edit is invalid.

The system should prefer provenance and validation over a giant prompt saying "be faithful".

---

## 6. Presentation-script data shape

Do not make the renderer consume free-form prose returned by an editor.

The editorial output should be a validated structured script containing entries conceptually like:

```json
{
  "source": [123, 124],
  "kind": "dialogue",
  "speaker": "grandma-01",
  "text": "...",
  "startMs": 18200,
  "durationMs": 4200,
  "focus": ["grandma-01", "man-01"]
}
```

or:

```json
{
  "source": [210, 211, 212],
  "kind": "venue_montage",
  "order": "order-3",
  "startMs": 43100,
  "durationMs": 3500
}
```

Exact schema may differ, but every presentation event that derives from Simulation should carry source provenance to one or more committed fact indices/ids where possible.

Presentation-only editorial captions should be marked separately, for example `source: []` plus `editorial: true`.

---

## 7. Recording envelope

The current engine often passes around `{ facts }`. Audience Replay needs a saved recording envelope sufficient to explain the run without reopening live Simulation state.

At minimum save:

```text
recording format/version
world/bootstrap version
seed
ambient/daylight/weather snapshot
menu/runtime availability snapshot or version
committed facts in order
optional audit stream when an editorial pass is allowed to use private/interior context
character display metadata needed by the renderer
```

Private audit must remain optional and separately permissioned. A public Replay file should not accidentally expose prompts, private memory, canonical hidden identity, or rejected proposals merely because the editor once had access to them.

---

## 8. Facts Replay must learn to present

The existing `createView()` covers foundational visible state such as movement, presence, resources, speech and deterministic animal response.

Replay now also needs presentation semantics for Phase 3F facts, including at least:

```text
ambient_set
venue_obligation (usually not directly visible; may inform story extraction)
order_placed
preparation_started
preparation_step / equivalent nerikiri steps
order_ready
order_served
order_cleared
```

`order_placed` is particularly important. A structured order may be valid even when the spoken sentence does not literally say the menu item. Replay should use the authoritative `order_placed` fact to show/caption the order rather than parsing dialogue or fabricating a shopkeeper acknowledgement.

---

## 9. Player requirements

The first useful Replay player should support:

```text
load a saved recording/script
play / pause
scrub timeline
restart
speed control for presentation playback
subtitle/speech display
character movement
basic cafe action presentation
current ambient/weather label if desired
```

Camera/focus may initially be simple. A fixed full-scene camera plus optional character focus is acceptable before cinematic camera work.

The player must run without provider credentials.

GitHub Pages is therefore an appropriate home for saved/demo Replays.

---

## 10. Exact mode vs audience mode

Keep both:

### Exact/debug replay

```text
facts -> simulation ticks -> createView snapshots
```

Purpose: determinism/regression/debugging.

### Audience replay

```text
facts -> presentation script -> presentation timeline -> renderer
```

Purpose: human viewing.

An audience rendering is not required to match exact replay frame-by-frame.

---

## 11. First implementation acceptance

Replay is not considered implemented until all of these work:

1. Save/load at least one Phase 3F recording without rerunning Simulation.
2. Exact replay remains byte-stable for its existing regression cases.
3. Build a presentation timeline whose duration is independent of final simulation tick.
4. A large dead/provider-style gap can be compressed without reordering dialogue.
5. Movement remains visibly continuous after retiming.
6. A cafe order can be understood from `order_placed` through preparation/serving even if the associated spoken sentence omitted the menu item.
7. A long preparation can be accelerated/montaged without making serving occur before preparation.
8. Speech/subtitles receive readable presentation durations rather than fixed simulation-tick lifetimes.
9. Player supports play/pause/scrub/restart.
10. The same saved Replay runs without any LLM/provider connection.
11. If an editorial LLM script is used, validate provenance and causal constraints before accepting it.
12. Compare exact and audience modes on the same recording and confirm that differences are presentation choices, not accidental re-simulation.

---

## 12. Current roadmap

```text
Simulation through Phase 3F    COMPLETE
Replay / Presentation          NOW
Phase 3G provider adapters     PARKED
```

Do not resume 3G merely because it is numerically next. The owner has explicitly chosen Replay as the next product block.
