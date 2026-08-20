# AGENTS.md — LittleWorld Collaboration Contract

**Last updated:** 2026-08-19 22:21 PT (`America/Los_Angeles`)

This file applies to the entire repository. Every AI agent, coding assistant, and human contributor must read it before changing files.

## 1. The current project direction is locked

LittleWorld is now a small shared AI-agent world set in a warm Showa-era Japanese neighborhood environment.

The current MVP is:

> **A Showa-era Japanese pocket park integrated with a semi-open kissaten / light-meal café, using the visual language of roughly 1965–1985.**

The earlier Second Temple Jerusalem / Bethesda Pool direction has been abandoned. Files that still mention Jerusalem, Bethesda, the Temple Mount, or the Sheep Gate are historical leftovers, not active requirements.

Do not restart, restore, extend, or use the Jerusalem work as the design source unless the project owner explicitly reverses the pivot.

## 2. Product goal

This is not primarily a conventional player-controlled game.

Participants create autonomous characters with personality, goals, memory, state, and decision logic. The characters enter one shared world and live there without direct player control. The audience observes them:

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
- detailed historical simulation;
- Node.js, MCP, or production server infrastructure before the scene and character foundation is stable.

## 4. Current implementation status

The active milestone is **scene foundation**, not agent runtime.

Current `main` contains:

- a Phaser scene;
- a fixed 2D / 2.5D-style camera with pan, zoom, pinch zoom, and Fit;
- GitHub Pages content under `docs/`;
- an owner-approved background with all people removed;
- placeholder logical hotspots;
- no production character sprites;
- no walkable map or collision map;
- no agent runtime, server, MCP layer, or LLM integration.

The current clean background is loaded as a **640 × 360 web-optimized image reconstructed from Base64 text fragments** in `docs/assets/showa/clean/`. This was an emergency transport workaround caused by binary-upload tooling. It is technical debt, not the intended asset architecture.

The preferred permanent architecture is a normal `.webp` or `.png` background file loaded directly by Phaser.

## 5. Canonical files and legacy files

### Canonical live application

Treat these as the current production preview:

- `docs/index.html`
- `docs/styles.css`
- `docs/showa-scene-clean.js`
- `docs/assets/showa/clean/` — temporary encoded background fragments

GitHub Pages preview:

`https://trina0224.github.io/littleworld/`

### Current documentation

- `README.md` — public project overview and current status
- `AGENTS.md` — collaboration rules and source of truth for AI contributors

### Legacy / stale material

These may remain for history but must not drive new work:

- root-level `index.html`, `main.js`, and `styles.css`;
- `docs/main.js`;
- `docs/showa-scene-v3.js`;
- `docs/showa-scene-v4.js`;
- `docs/map-blueprint.md` — still describes Jerusalem;
- `assets/bethesda/` and other Jerusalem-era assets;
- `remove-sheep-gate.js`;
- other Bethesda or Jerusalem references.

Do not delete legacy files during unrelated work. Cleanup should be a separate, explicitly assigned task so accidental loss is easy to review.

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

Shared world state will eventually include:

- time;
- locations and walkable routes;
- available objects;
- seat and hotspot occupancy;
- social interactions;
- event history.

Do not implement the LLM decision layer before deterministic scene semantics can be tested.

## 8. Required development order

Unless the owner explicitly changes priorities, work in this order:

### Phase 0 — Stabilize the scene pipeline

- keep the approved clean background visible and complete;
- replace the Base64-fragment workaround with a normal image asset when a reliable binary path is available;
- remove only the obsolete workaround after direct-image loading is verified;
- preserve pan, zoom, pinch, and Fit.

### Phase 1 — Scene semantics

- define world coordinates;
- define walkable areas;
- define blocked scenery;
- define entrances, exits, seats, counter positions, and hotspots;
- keep the semantic layer separate from the visual background.

### Phase 2 — Character art and animation

- decide character scale and visual style;
- define the minimum pose/animation matrix;
- create a small proof set before producing many characters;
- test walking and sitting against the approved scene.

### Phase 3 — Deterministic simulation prototype

- add one to three non-LLM agents;
- test movement, occupancy, sitting, ordering, working, resting, and simple conversations;
- validate that agents naturally meet instead of spreading too far apart.

### Phase 4 — Shared world runtime

- add structured world state and memory;
- add server persistence only when needed;
- then introduce Node.js, MCP tools, and LLM decisions.

## 9. Multi-agent parallel work protocol

Several AI agents may work in parallel, but they must not edit the same shared files simultaneously.

### Safe parallel workstreams

| Workstream | Primary output | Files it may own |
|---|---|---|
| Scene integration | Live preview and background pipeline | `docs/index.html`, `docs/styles.css`, `docs/showa-scene-*.js`, `docs/assets/showa/` |
| World semantics | Walkable map, anchors, hotspots, coordinate specification | new files under `docs/specs/world/` and later `src/world/` |
| Character system | Pose matrix, scale tests, sprite prototypes | new files under `docs/specs/characters/` and `assets/characters/` |
| Agent model | State schema, actions, memory, deterministic behavior design | new files under `docs/specs/agents/` and later `src/agents/` |
| QA / projection | Test matrix for iPad, desktop, and 16:9 projection | new files under `docs/qa/` |

### Shared-file ownership

Only one task may modify these at a time:

- `docs/index.html`;
- `docs/styles.css`;
- the active scene JavaScript file;
- the production background asset;
- `README.md`;
- `AGENTS.md`.

### Branching

For parallel work, use a dedicated branch:

`ai/<agent-name>/<short-task-name>`

Examples:

- `ai/codex/walkable-map-spec`
- `ai/claude/character-pose-matrix`
- `ai/gemini/projection-qa`

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
- The project prioritizes finishing a beautiful, understandable demo over adding many systems.
- Scene completion and character planning come before server, MCP, and LLM work.
