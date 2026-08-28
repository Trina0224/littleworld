# LittleWorld Engine Specs — Current Source of Truth

**Updated:** 2026-08-28 (`America/Los_Angeles`)  
**Current implementation state:** Simulation through unified Phase 3F is implemented.  
**Current product priority:** Replay / Presentation.  
**Parked:** Phase 3G real provider adapters.

This file is the navigation/index for engine architecture. Older documents are intentionally kept because they record decisions and why previous designs failed, but later binding corrections win when they conflict.

## Current architecture in one page

LittleWorld has two products sharing one committed recording:

```text
SIMULATION / WORLD GENERATION
  deterministic world + perception + memory + conversation + cafe + Brain runtime
  -> committed fact recording + private audit

REPLAY / PRESENTATION
  recording
  -> optional whole-record editorial/script pass
  -> presentation timeline
  -> audience renderer
```

The Simulation may take a long wall-clock time. Provider latency is generation cost, not fictional pause. Conversation asks one Brain at a time and waits for that decision while deterministic world work may continue.

Replay is allowed to have a different presentation clock and is the next active workstream. Real provider adapters are not required in order to build Replay because existing scripted/manual recordings are sufficient input.

## Binding precedence

Read these in this order when implementing new work:

1. `simulation-replay-architecture.md` — Simulation vs Replay boundary and recording contract.
2. `phase-3e-owner-latency-correction.md` — sequential Brain offers; no simulation-tick timeout.
3. `phase-3e-post-brain-corrections.md` — speech budget, multi-act utterances, first real-Brain corrections.
4. `phase-3e-brain-grounding-and-interject.md` — direct-address causality, interjection boundary, grounding, memory subject safety.
5. `phase-3f.md` — unified implemented world/cafe/bootstrap/Brain runtime contract; supersedes the old 3F-A/3F-B split.
6. `replay-presentation.md` — **latest binding Replay contract and current next work.** It also supersedes older Replay wording where explicitly stated.

Earlier 3C/3D/3E design documents remain binding only where no later correction supersedes them.

## Implemented Simulation layers

```text
3A / foundations   integer world clock, facts/audit, movement, resources, attendance
3C                 perception, hearing, observer-private refs
3D                 private memory and recognition
3E                 offered conversational Floors and real-Brain interface
3F                 ambient/bootstrap, cafe/venue runtime, Brain runtime seam
```

The current 3F runtime source includes:

- `src/engine/ambient.js`
- `src/engine/cafe.js`
- `src/engine/brain-runtime.js`
- `src/engine/grounding.js`
- `src/engine/floors.js`
- `docs/specs/world/cafe-menu.json`

`docs/specs/world/cafe-menu.json` is the authoritative current runtime availability. `cafe-menu-1960.md` is design/history and must not override runtime availability when the two differ.

## Replay status — important distinction

A low-level exact fact replay already exists in `src/engine/view.js`:

```text
recording.facts
  -> createView()/replay()
  -> one snapshot per simulation tick
```

It is useful for deterministic regression and proves that some visible state can be reconstructed from committed facts without rerunning the Simulation.

That is **not yet the audience Replay product**.

Not implemented yet:

- a recording envelope/file format intended for saved runs;
- a presentation timeline separate from simulation ticks;
- compression/removal of provider waiting and dull idle spans;
- whole-record editorial/script pass;
- presentation of cafe facts such as order/preparation/serving;
- subtitle/dialogue timing policy;
- camera/focus policy;
- browser Replay player controls (play/pause/scrub/speed/scene selection);
- validation that an edited presentation script remains faithful enough to its source recording.

Therefore: **Replay foundation exists; Replay product is not finished.**

## Current roadmap

```text
Simulation through 3F     DONE
        ↓
Replay / Presentation     NEXT
        ↓
3G provider adapters      PARKED until owner resumes it
```

3G must not be treated as a prerequisite for Replay.

## Completed real-Brain validation

The three clean-context runs are preserved under `docs/notes/`:

- `first-real-brain-run.md`
- `second-real-brain-run.md`
- `third-real-brain-run.md`

They are interface evidence, not canonical story recordings.

## 3F closeout decisions after implementation review

Two implementation cleanup decisions are now explicit:

1. `ショートケーキ` was removed from the live runtime menu because the current shopkeeper/world definition says this cafe does not sell cake.
2. Phase 3F performs **no automatic Brain load shedding**. When concurrency is full, valid opportunities queue. The unused `essential` scheduler configuration was removed. Any future pressure-based dropping belongs to a real, explicit provider policy and must be auditable.

The existing `order_placed` fact is the authoritative explanation that an order occurred. Replay should render/present that fact rather than parsing dialogue or inventing a shopkeeper line merely to explain why a drink later appears.
