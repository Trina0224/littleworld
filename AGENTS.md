# AGENTS.md — LittleWorld Collaboration Contract

**Last updated:** 2026-08-19 22:44 PT (`America/Los_Angeles`)

This file applies to the entire repository. Every AI agent, coding assistant, and human contributor must read it before changing files.

## 1. The current project direction is locked

LittleWorld is now a small shared AI-agent world set in a warm Showa-era Japanese neighborhood environment.

The current MVP is:

> **A Showa-era Japanese pocket park integrated with a semi-open kissaten / light-meal café, using the visual language of roughly 1965–1985.**

**This place is imagined, not reconstructed.** The character prototype who lived
in that era looked at the scene and said he could not recognise it as Japan — he
had never seen a cafe and a park put together like this. So the world is *built
in the visual language of Showa*, and is not a claim about any real year.

That is a decision, and it settles several arguments cheaply. The menu board's
coffee price does not have to agree with any year's statistics. Children's
heights do not have to match the school health survey. What still binds is
**internal consistency** — a seven-year-old has to read as a seven-year-old
standing next to the adults — and the emotional truth of the prototypes.

What is *not* released by this: anything that is a hard object either exists in
the world or does not. A home game console did not exist before 1983, so putting
one in a child's hands moves the whole world late. Prefer props that hold across
the whole era.

The earlier Second Temple Jerusalem / Bethesda Pool direction has been abandoned, and its files have been removed from the working tree. They remain in git history only. Treat any reference to Jerusalem, Bethesda, the Temple Mount, or the Sheep Gate as dead history, never as a requirement.

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
- a painted world spec under `docs/specs/world/` — walkable, backstage, occluder, chair backs, seat tops, tables, seat anchors and facings;
- twelve characters placed in the live scene, sized, seated, and cut by whatever stands in front of them;
- no walking or movement yet;
- no agent runtime, server, MCP layer, or LLM integration.

Phase 1 and Phase 2 of section 8 are done. The next step is Phase 3.

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

The spec files under `docs/specs/` are **generated from paintings, not hand
edited.** Change the painting, re-run the derive script, commit both. Editing a
derived JSON by hand will be silently overwritten the next time anyone re-runs
the script.

GitHub Pages preview:

`https://trina0224.github.io/littleworld/`

### Current documentation

- `README.md` — public project overview and current status
- `AGENTS.md` — collaboration rules and source of truth for AI contributors

### Legacy / stale material

There is none left in the working tree. The Jerusalem-era assets, the superseded
root-level preview, the intermediate scene versions, and the Base64 fragment
directories have all been removed. Recover anything from git history if it is
genuinely needed.

Every tracked file is now active. Do not add scratch files, half-finished
uploads, or parallel `-v2` directories to the repository; keep work in progress
on a branch until it is complete.

Deletions still belong in their own commit, separate from unrelated work, so
they are easy to review.

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

Everything about the scene is painted by the owner onto the background and read
back by the scripts in `docs/specs/`. Two rules cost several rounds each to get
right. Both are written up in `docs/specs/world/README.md`; the short form:

**Facing comes from what a seat is drawn up to.** A table chair faces its table,
a counter stool faces the counter, the park bench faces the open ground. Facing
was twice derived from the painted chair backs and was wrong both times — a
chair back is an upright panel, so its pixels run far up the screen and its
centroid always lands above its own seat, which reported that every chair in the
scene faced the camera. Even measuring from the back's bottom edge, which fixed
the sign, left a spread big enough to see. A table is a better instrument than a
brush stroke: every seat around it agrees on where it is.

**Occlusion is per column, not per object.** Every vertical run of occluder
pixels carries the screen row where it meets the floor; a character is behind
that run exactly when its own ground row is smaller. Do not replace this with a
single depth per object — a constant cannot answer "what about someone walking
past in front of it?", which is the question that matters. Painted feet are
median-smoothed along their own length first, because a hand-painted edge wobbles
by a row or two and a character whose depth lands inside the wobble gets sliced.

A third thing worth knowing before touching sizes: **a walkable map cannot
describe a tabletop.** It describes the floor, and a tabletop is 0.7 m above the
floor, so its drawn silhouette sits well up-screen of anything a floor map can
express. Furniture that occludes must be painted.

And on scale: characters are sized as a fraction of their own sheet's pixel
height — 0.275 for adults, 0.15 for the two young brothers — measured at
`referenceY` 232.6 and then scaled by the height ramp. Anatomical sizing was
tried and reads too small, because this painting's furniture is drawn larger than
a strict ground-plane projection would give.

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

**Phases 0, 1 and 2 are complete.** Phase 3 is next.

### Phase 0 — Stabilize the scene pipeline — done

- keep the approved clean background visible and complete;
- preserve direct loading from `docs/assets/showa/scene-clean-2560.webp`;
- keep obsolete Base64-fragment loaders out of the active pipeline;
- preserve pan, zoom, pinch, and Fit.

### Phase 1 — Scene semantics — done

- define world coordinates;
- define walkable areas;
- define blocked scenery;
- define entrances, exits, seats, counter positions, and hotspots;
- keep the semantic layer separate from the visual background.

### Phase 2 — Character art and animation — done, except walking

- decide character scale and visual style;
- define the minimum pose/animation matrix;
- create a small proof set before producing many characters;
- test sitting against the approved scene.

**There is no walk cycle and none is planned.** The owner's decision, recorded
here so nobody builds one: agents hop between positions. The pose matrix is eight
states per character — stand or sit, front or back, each mirrored — and that is
the whole set.

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
