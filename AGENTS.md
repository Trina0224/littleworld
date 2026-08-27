# AGENTS.md — LittleWorld Collaboration Contract

**Last updated:** 2026-08-26 (`America/Los_Angeles`)

This file applies to the entire repository. Every AI agent, coding assistant, and human contributor must read it before changing files.

## 1. The current project direction is locked

LittleWorld is now a small shared AI-agent world set in a warm Showa-era Japanese neighborhood environment.

The current MVP is:

> **A Showa-era Japanese pocket park integrated with a semi-open kissaten / light-meal café, using the visual language of roughly 1965–1985.**

The place is **福島市ひだまり町**, and its names were painted into the background from the start: the awning reads 喫茶ひだまり, the notice board reads ひだまり公園, and the sign strapped to the utility pole reads ひだまり町内会. That last one settles the scale — a 町内会 is a neighbourhood association, so this 町 is a district inside the city, the sense in which 濱田町 and 森合 are districts of 福島市. The city is real and the district is invented, which is the right way round: the block carries the story, so nowhere real is being claimed as its stage.

Read the signs before inventing anything they already answer, and read the 世界事實 section of `characters/README.md` before writing a character. It is the single source for the place, the shop, the menu prices, the university, and the period. I have already derived one of those facts the long way round when the picture had answered it.

**This place is imagined, not reconstructed.** The character prototype who lived in that era looked at the scene and said he could not recognise it as Japan — he had never seen a cafe and a park put together like this. So the world is *built in the visual language of Showa*, and is not a claim about any real year.

That is a decision, and it settles several arguments cheaply. The menu board's coffee price does not have to agree with any year's statistics. Children's heights do not have to match the school health survey. What still binds is **internal consistency** — a seven-year-old has to read as a seven-year-old standing next to the adults — and the emotional truth of the prototypes.

What is *not* released by this: anything that is a hard object either exists in the world or does not. A home game console did not exist before 1983, so putting one in a child's hands moves the whole world late. Prefer props that hold across the whole era.

The earlier Second Temple Jerusalem / Bethesda Pool direction has been abandoned, and its files have been removed from the working tree. They remain in git history only. Treat any reference to Jerusalem, Bethesda, the Temple Mount, or the Sheep Gate as dead history, never as a requirement.

Do not restart, restore, extend, or use the Jerusalem work as the design source unless the project owner explicitly reverses the pivot.

## 2. Product goal

This is not primarily a conventional player-controlled game.

The project now has **two major systems** with different goals:

### Part A — Simulation / World Generation

Participants create autonomous characters with personality, goals, memory, state, and decision logic. The characters enter one shared world and live there without direct player control.

The Simulation may run slowly, unattended, or for a long wall-clock time. LLM latency is acceptable. Its job is to generate a causally correct, believable world history and a trustworthy committed fact recording.

A human director may change **world-level conditions** — for example requesting the next day, selecting arrivals, or introducing deterministic actors — but does not directly puppeteer an LLM character's mind or dialogue.

An initial unattended setting may treat roughly one real hour as one simulation day, but this is configuration rather than a demo pacing requirement.

### Part B — Replay / Presentation

Replay is the preferred audience-facing demonstration path. It consumes committed Simulation facts and does not rerun character Brains.

Replay may remove provider-latency gaps, compress long idle spans, preserve readable speech and visible movement, and build a separate presentation timeline. A completed recording may first pass through a whole-record presentation/script pass before rendering.

> **Replay preserves causality, not provider latency.**

Replay is not required to preserve Simulation tick spacing one-for-one. Low-level fact replay may remain exact for engine tests, while final audience presentation owns a separate clock.

The binding architecture is `docs/specs/engine/simulation-replay-architecture.md`. If another document still assumes that live provider timing must be entertaining to an audience, this newer architecture wins for presentation/pacing decisions.

The audience should ultimately be able to observe characters:

- walk around;
- sit and rest;
- work at the café;
- order, eat, and drink;
- talk to strangers and friends;
- give or trade objects;
- form memories and relationships;
- comfort, help, invite, or share with others;
- create emergent social behavior.

The church-event context matters:

- older adults should understand the scene immediately;
- the world should feel warm, ordinary, and welcoming;
- a preacher or church friend may appear naturally as a character role;
- the environment must not become a religious theme park;
- the demonstration must remain small enough to finish reliably.

## 3. Locked MVP scope

### Scene

The first world contains only:

- one small park;
- one semi-open kissaten / café integrated with the park;
- outdoor café seating;
- a path and a small neighborhood edge;
- vegetation and one large tree;
- benches and fixed playground equipment;
- optional fixed Showa street props such as a phone booth, postbox, vending machine, bicycle, signs, and streetlights.

### Social hotspots

The world must preserve at least four natural gathering points:

1. café counter;
2. outdoor café tables;
3. park bench;
4. central tree / open park area.

### Explicit non-goals

Do not add these during the MVP unless directly assigned:

- a large city;
- a complete Japanese neighborhood;
- camera rotation;
- a day/night cycle;
- weather;
- a complex economy;
- large quests or scripted campaigns;
- a large mission system;
- detailed historical simulation.

Do not add detailed presentation animation to the Simulation merely because Replay may eventually want it. Simulation facts may initially describe work such as preparing tea or shaping nerikiri without requiring a bespoke hand animation.

## 4. Current implementation status

The active runtime milestone is **after Phase 3E Conversation / Social Runtime**.

Current `main` contains:

- a Phaser scene;
- a fixed 2D / 2.5D-style camera with pan, zoom, pinch zoom, and Fit;
- GitHub Pages content under `docs/`;
- an owner-approved background with all people removed;
- a painted world spec under `docs/specs/world/` — walkable, backstage, occluder, chair backs, seat tops, tables, seat anchors, facings and semantic zones;
- twelve characters placed in the live scene, sized, seated, and cut by whatever stands in front of them;
- deterministic engine foundations under `src/engine/`: integer ticks, movement/navigation, reservations, attendance, canonical tick loop, fact/audit recording and replay view;
- Phase 3C perception: subjective sensory state, appearance-only observations, ephemeral `seen-N` refs, pending perceived-event queues and semantic placement;
- Phase 3D private memory: seeded recognition, encounter/spokenWith structure, observer-private labels and bounded Brain-authored episodes;
- Phase 3E conversation/social runtime: one offered Floor per semantic zone, hearing/`heardBy`, observer-specific transcript, legal engine-authored speech actions, open-question handoff, deterministic animal interaction, social ranking and dormancy/re-arm;
- **owner-corrected 3E offer semantics:** one conversational Brain is asked at a time; elapsed simulation ticks never turn an unanswered Brain into a decline; moving into current earshot of an active neighboring conversation may create one bounded `overheard` opportunity without retroactive hearing;
- no deterministic café/venue runtime yet;
- no bounded Brain/provider scheduler yet;
- no real LLM provider integration yet;
- no final audience presentation-timeline builder yet.

Phase 3E is complete. Before Phase 3F, an optional manual real-LLM Brain harness may be used as interface validation; see `docs/notes/pre-3f-manual-llm-demo.md`.

The next required Simulation phase is **3F-A Cafe / Venue Runtime**, followed by **3F-B Brain Scheduler**, then **3G real provider integration**.

The current clean background is a **2560 × 1440 losslessly encoded WebP** at `docs/assets/showa/scene-clean-2560.webp`, loaded directly by Phaser. A pixel-identical PNG master lives outside the published directory at `assets/showa/scene-clean-2560.png`.

World coordinates remain **640 × 360**. The background is drawn with `setDisplaySize(WORLD_W, WORLD_H)`, so the higher resolution buys zoom sharpness without changing the coordinate space, hotspot positions, or any future walkable map.

Do not raise the background beyond 2560 × 1440 without checking device limits first. WebGL `MAX_TEXTURE_SIZE` is 4096 on many iPads and older mobile GPUs, and a texture above that limit fails to upload, leaving the scene with no background at all.

The former Base64-fragment runtime loader has been removed. Future background replacements should remain normal `.webp` or `.png` assets.

## 5. Canonical files and legacy files

### Canonical live application

Treat these as the current production preview:

- `docs/index.html`
- `docs/styles.css`
- `docs/showa-scene-clean.js`
- `docs/assets/showa/scene-clean-2560.webp` — production clean background asset
- `docs/assets/characters/` — cut sprites the live page loads
- `docs/specs/world/` — the painted world spec and the scripts that read it
- `docs/specs/characters/` — the cast: sizes, marks, placements, exporters

The spec files under `docs/specs/` are **generated from paintings, not hand edited** where a derive script owns them. Change the painting, re-run the derive script, commit both. Editing a generated JSON by hand will be silently overwritten the next time anyone re-runs the script.

GitHub Pages preview:

`https://trina0224.github.io/littleworld/`

### Current engine documentation

- `docs/specs/engine/simulation-replay-architecture.md` — binding split between world generation and audience presentation
- `docs/specs/engine/world-engine-2.5.md` — detailed World Engine architecture; older replay/pacing assumptions are superseded by the simulation/replay architecture and later phase corrections where they conflict
- `docs/specs/engine/pacing-and-latency.md` — settled pacing/latency decisions
- `docs/specs/engine/phase-3c-perception.md` — implemented perception contract
- `docs/specs/engine/phase-3c-implementation-clarifications.md` — binding 3C clarifications
- `docs/specs/engine/phase-3d-memory.md` — implemented private-memory contract
- `docs/specs/engine/phase-3e-conversation.md` — conversation design baseline
- `docs/specs/engine/phase-3e-implementation-structure.md` — offered-Floor implementation structure
- `docs/specs/engine/phase-3e-floor-clarifications.md` and `phase-3e-pre-floor-corrections.md` — 3E clarifications
- `docs/specs/engine/phase-3e-owner-latency-correction.md` — **latest binding correction for sequential offers, no simulation-tick Brain timeout, and movement-created overheard opportunity**
- `docs/specs/engine/phase-3e-completion.md` — current 3E completion record
- `docs/specs/engine/phase-3c-venue-interactions.md` — 3F-A café/venue runtime contract
- `docs/specs/engine/cafe-menu-1960.md` — café menu and service timing data/design

### Current documentation

- `README.md` — public project overview and current status
- `AGENTS.md` — collaboration rules and source of truth for AI contributors

### Legacy / stale material

The repository still contains earlier design text inside superseded architecture documents where later correction files explicitly say they win. Do not revive a superseded mechanism merely because it remains in historical prose.

The Jerusalem-era assets, the superseded root-level preview, the intermediate scene versions, and the Base64 fragment directories have all been removed. Recover anything from git history only if it is genuinely needed.

Every tracked file is active unless a later binding spec explicitly marks part of an older document superseded. Do not add scratch files, half-finished uploads, or parallel `-v2` directories to the repository; keep work in progress on a branch until it is complete.

Deletions still belong in their own commit, separate from unrelated work, so they are easy to review.

## 6. Visual and asset contract

These rules are mandatory.

### Background

- The production background must contain **no people or movable characters**.
- Do not reintroduce people baked into a generated scene.
- Do not substitute a different composition, crop, or art style without owner approval.
- Keep the camera direction fixed. No rotation is planned.
- The default Fit view must show the complete park and café on a 16:9 display.
- The image must remain readable when projected on a television or large screen.

### Fixed scenery

The following may be baked into the background because they do not need to move:

- café building and counter;
- large tree and ordinary vegetation;
- benches;
- tables and chairs, unless a later interaction design requires separate seats;
- signs;
- phone booth;
- postbox;
- vending machine;
- streetlights;
- fixed playground equipment;
- static neighborhood buildings and walls.

### Characters

Characters must be separate transparent assets layered above the background.

Do not bake any agent, customer, child, pedestrian, employee, preacher, or other human into the scene image.

Future character work must define:

- visual scale relative to the scene;
- facing directions;
- minimum animation set;
- seated variants;
- café-work variants if needed;
- interaction anchors for chairs, counter positions, and objects;
- consistent shadows and feet positions.

### Binary asset rule

Preferred order:

1. direct `.webp` or `.png` file committed normally;
2. tiled raster images only when they materially improve loading or memory;
3. Base64 fragments only as a temporary emergency workaround with explicit owner approval.

Never silently spend a long time building a Base64 transport workaround. Surface the limitation immediately.

Direct binary commits are proven to work in this repository, so option 3 has no remaining justification. Do not create new Base64 fragment directories such as `docs/assets/showa/clean-1440p/`; commit the `.webp` or `.png` file itself instead.

## 6b. What the scene layer already knows, and the two rules not to rediscover

Everything about the scene is painted by the owner onto the background and read back by the scripts in `docs/specs/`. Two rules cost several rounds each to get right. Both are written up in `docs/specs/world/README.md`; the short form:

**Facing comes from what a seat is drawn up to.** A table chair faces its table, a counter stool faces the counter, the park bench faces the open ground. Facing was twice derived from the painted chair backs and was wrong both times — a chair back is an upright panel, so its pixels run far up the screen and its centroid always lands above its own seat, which reported that every chair in the scene faced the camera. Even measuring from the back's bottom edge, which fixed the sign, left a spread big enough to see. A table is a better instrument than a brush stroke: every seat around it agrees on where it is.

**Occlusion is per column, not per object.** Every vertical run of occluder pixels carries the screen row where it meets the floor; a character is behind that run exactly when its own ground row is smaller. Do not replace this with a single depth per object — a constant cannot answer "what about someone walking past in front of it?", which is the question that matters. Painted feet are median-smoothed along their own length first, because a hand-painted edge wobbles by a row or two and a character whose depth lands inside the wobble gets sliced.

A third thing worth knowing before touching sizes: **a walkable map cannot describe a tabletop.** It describes the floor, and a tabletop is 0.7 m above the floor, so its drawn silhouette sits well up-screen of anything a floor map can express. Furniture that occludes must be painted.

And on scale: characters are sized as a fraction of their own sheet's pixel height — 0.275 for adults, 0.15 for the two young brothers — measured at `referenceY` 232.6 and then scaled by the height ramp. Anatomical sizing was tried and reads too small, because this painting's furniture is drawn larger than a strict ground-plane projection would give.

## 7. Planned character actions and world data

Initial agent actions:

- `look()`
- `move()`
- `talk()`
- `give()`
- `trade()`
- `sit()`
- `order()`
- `eat()`
- `drink()`
- `work()`
- `rest()`

Later candidates:

- `invite()`
- `help()`
- `share()`

Each agent is expected to have:

- personality;
- goals;
- memory;
- current state;
- location;
- inventory or held objects if required;
- relationships;
- decision logic.

Shared world state will include:

- time;
- locations and walkable routes;
- available objects;
- seat and hotspot occupancy;
- social interactions;
- event history;
- external human-director inputs that alter world history.

Do not implement an LLM decision layer before the deterministic contracts it depends on are tested.

## 8. Required development order

Unless the owner explicitly changes priorities, work in this order.

### Completed foundation

- scene / world-painting pipeline;
- character art / pose foundation;
- deterministic World Engine 3A foundations;
- attendance / presence;
- canonical tick loop;
- Phase 3C perception and semantic placement;
- Phase 3D private memory;
- Phase 3E conversation / social runtime, including the 2026-08-26 owner latency correction.

### Simulation workstream — current order

```text
optional pre-3F manual real-LLM Brain harness   <- interface validation only
3F-A cafe / venue runtime                       <- NEXT REQUIRED PHASE
3F-B scheduler + mock Brain
3G   real LLM provider integration
```

`3F-A` remains a hard gate before real provider integration. See `phase-3c-venue-interactions.md`.

The manual Brain harness does **not** change that gate. It is manual transport for validating the already-defined Brain boundary, not provider integration.

The Simulation may run slowly and produce long recordings. Do not tune its day length merely to fit a demonstration window.

### Conversation latency rule — do not reverse

The owner has explicitly corrected the 3E implementation back to the intended Simulation model:

```text
one Floor selects one Brain
  -> ask whether it wants to speak
  -> wait for that Brain's actual answer
  -> world/deterministic activity may keep ticking
  -> elapsed simulation ticks NEVER mean "decline"
  -> explicit speech commits, or explicit `nothing` advances to the next ranked Brain
```

There is no K=3 conversational batch and no simulation-tick `offerExpiry` in normal 3E flow. Provider timeout/drop/retry belongs to 3F-B as explicit infrastructure policy.

A character moving into current ordinary hearing range of an active neighboring social Floor may receive one bounded `why = overheard` opportunity for that source social spell. This creates no retroactive hearing: old lines spoken while the character was too far away stay absent from perception/transcript.

The binding correction is `docs/specs/engine/phase-3e-owner-latency-correction.md`.

### Replay / Presentation workstream

Replay is a parallel project block consuming committed fact recordings.

It may be developed independently as soon as a recording feature needs presentation support. Its eventual responsibilities include:

- reading committed fact streams only for low-level playback;
- optionally consuming an approved whole-record presentation/script pass for the audience-facing cut;
- building presentation time separately from simulation ticks;
- removing/compressing provider-latency gaps;
- compressing uninteresting idle spans;
- preserving causal ordering;
- preserving readable dialogue and non-teleporting movement;
- adding presentation camera/subtitle/UI policy where useful.

Replay does **not** rerun character Brains or the Activity Runtime. Final presentation is not required to reproduce Simulation tick spacing one-for-one.

When a new Simulation feature is added, ensure its fact stream contains enough information for Replay to reconstruct what happened later. Detailed presentation polish does not have to be implemented at the same time.

## 9. Multi-agent parallel work protocol

Several AI agents may work in parallel, but they must not edit the same shared files simultaneously.

### Safe parallel workstreams

| Workstream | Primary output | Files it may own |
|---|---|---|
| Scene integration | Live preview and background pipeline | `docs/index.html`, `docs/styles.css`, `docs/showa-scene-*.js`, `docs/assets/showa/` |
| World semantics | Walkable map, anchors, hotspots, coordinate specification | `docs/specs/world/`, related derivation scripts |
| Simulation engine | world loop, memory, conversations, scheduler, venue runtime | `src/engine/`, `docs/specs/engine/` when claimed |
| Replay / presentation | recording reader, presentation timeline, renderer integration | dedicated replay files / presentation specs |
| Character system | Pose matrix, scale tests, sprite prototypes | `docs/specs/characters/`, `assets/characters/` |
| QA / projection | Test matrix for iPad, desktop, and 16:9 projection | `docs/qa/` |

### Shared-file ownership

Only one task may modify these at a time:

- `docs/index.html`;
- `docs/styles.css`;
- the active scene JavaScript file;
- the production background asset;
- `README.md`;
- `AGENTS.md`;
- any binding engine spec another agent has explicitly claimed.

### Branching

For parallel work, use a dedicated branch:

`ai/<agent-name>/<short-task-name>`

Examples:

- `ai/codex/private-memory`
- `ai/claude/conversation-session`
- `ai/chatgpt/replay-timeline`

Do not push unrelated changes into the same branch.

Direct changes to `main` are reserved for owner-requested hotfixes or explicitly approved small documentation updates.

### Claiming work

Before changing shared files, record the claim in one of these places:

1. a GitHub issue;
2. a pull-request title or description;
3. a clear handoff message to the owner when Issues/PRs are unavailable.

A claim must identify:

- workstream;
- exact files expected to change;
- files that will not be touched;
- expected output.

### Conflict rule

If another agent is already editing a shared file, do not make a competing version. Work on a non-conflicting specification, test, or prototype instead.

## 10. Commit and handoff requirements

Use focused commit prefixes:

- `docs:` documentation only;
- `scene:` visual scene or background integration;
- `world:` navigation, coordinates, hotspots, or world state;
- `character:` sprite, pose, or animation work;
- `agent:` autonomous behavior or action model;
- `replay:` replay/presentation pipeline;
- `fix:` bug fix;
- `chore:` cleanup with no behavior change.

Every completed task must report:

- branch or commit SHA;
- files changed;
- what was tested;
- what was not tested;
- known limitations;
- one recommended next action.

Use this handoff template:

```text
Task:
Branch / commit:
Files changed:
Result:
Validation performed:
Known limitations:
Do not modify:
Recommended next step:
Timestamp (America/Los_Angeles):
```

## 11. Validation and definition of done

For the current static preview, run a local HTTP server rather than opening `file://` directly:

```bash
python3 -m http.server 8000 --directory docs
```

Then open:

`http://localhost:8000/`

A scene-related change is not done until all applicable checks pass:

- no console errors;
- no 404 asset requests;
- the complete background is visible, not only a strip or corner;
- no people are baked into the background;
- no obvious tile seams or corrupt-image artifacts;
- Fit shows the entire scene;
- drag pan works;
- mouse-wheel zoom works;
- pinch zoom works on touch devices when available;
- the camera never rotates;
- hotspot clicks do not break camera controls;
- the scene remains usable in 16:9 landscape;
- iPad portrait and landscape do not trap the camera outside the map;
- GitHub Pages references the intended current file, not a stale script;
- cache-busting parameters are updated when replacing cached assets.

Simulation changes additionally require applicable deterministic tests and must preserve the fact/audit boundary. A new visible Simulation feature is incomplete if Replay would later need to rerun the simulation to discover what happened; record enough committed facts instead.

Do not claim deployment success merely because a commit succeeded. Distinguish clearly between:

- committed to GitHub;
- GitHub Pages deployment completed;
- public page visually verified.

## 12. Communication with the project owner

The owner may communicate in English, Traditional Chinese, or Japanese.

- Reply in the language used by the owner.
- Never reply in Simplified Chinese.
- Include an `America/Los_Angeles` PT timestamp in progress and handoff messages.
- For work longer than about 15 seconds, provide short progress updates.
- Do not leave the owner without an explanation while attempting a long workaround.
- Do not repeat questions already answered in the repository or conversation.
- If a tool limitation blocks the direct path, explain it immediately and choose the simplest safe alternative.
- Time-box unproven workarounds. If a workaround is not clearly succeeding within a few minutes, stop and reassess before creating technical debt.

## 13. Decisions that must not be accidentally reversed

- The active world is Showa Japan, not Jerusalem.
- The café is semi-open and visually integrated with the park.
- The scene is small by design.
- The camera is fixed-direction and never rotates.
- The background must be free of people.
- Movable characters are separate sprites.
- Static props may remain baked into the background.
- **LittleWorld is two major systems: Simulation / World Generation and Replay / Presentation.**
- **Simulation correctness does not depend on being entertaining at live provider latency.**
- **One conversational Floor asks one Brain at a time; provider wall-clock latency never becomes a simulation-tick decline.**
- **The World Engine may keep ticking while that Floor waits for the selected Brain's answer.**
- **Moving into earshot of an active neighboring conversation may create one bounded optional overheard opportunity, with no retroactive hearing.**
- **Replay is the preferred audience-facing path, owns a separate presentation clock, and may compress provider latency while preserving causal integrity.**
- Human director controls alter world conditions, not an Agent's private mind, and must be recorded if they change history.
- The project prioritizes finishing a beautiful, understandable demo over adding many systems.