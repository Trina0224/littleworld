# LittleWorld

**昭和時代の小公園と半開放喫茶店で暮らす、自律 AI Agent の共有世界。**

LittleWorld is a small shared-world simulation where participants create autonomous AI characters and observe them live, rather than directly controlling them like conventional game avatars.

## Live preview

https://trina0224.github.io/littleworld/

The current preview is served from the `docs/` directory on `main`.

## Current MVP

The active world is a warm Showa-era Japanese pocket park integrated with a semi-open kissaten / light-meal café.

The visual language is intentionally approximate rather than tied to one exact year:

- roughly Showa 40–60, or about 1965–1985;
- a small neighborhood park;
- a semi-open café facing the park;
- outdoor tables;
- a large tree and benches;
- paths and a small residential-street edge;
- fixed period props such as signs, a phone booth, postbox, vending machine, streetlights, bicycles, and playground equipment.

The scene is deliberately small so agents naturally meet, talk, sit together, and create emergent social behavior.

## What the experience is meant to show

Participants will eventually define characters with:

- personality;
- goals;
- memory;
- state;
- relationships;
- location and inventory;
- autonomous decision logic.

The characters enter one shared world and act without direct player control. Expected behavior includes:

- walking and observing;
- sitting and resting;
- working at the café;
- ordering, eating, and drinking;
- talking, giving, and trading;
- meeting strangers and remembering previous conversations;
- helping, inviting, comforting, or sharing with others;
- forming relationships through repeated interactions.

The church-event context is part of the design: the world should be warm and immediately understandable to older adults, while still allowing roles such as a preacher or church friend to appear naturally. The setting itself should not look like a religious theme park.

## Natural social hotspots

The MVP keeps four main gathering points:

1. café counter;
2. outdoor café tables;
3. park bench;
4. central tree / open park area.

These locations will later provide interaction anchors, occupancy rules, and agent goals.

## Current status

### Working now

- Phaser scene with a fixed camera, drag-to-pan, wheel and pinch zoom, and Fit;
- a clean 2560 × 1440 background with every person removed;
- a **painted world spec** — walkable ground, backstage, scenery occluders, chair
  backs, seat tops, tabletops — with seats, facings and a measured height ramp
  derived from it;
- **twelve characters standing and sitting in the live page**, each at its own
  scale, on its own seat, facing the right way, and cut by whatever stands in
  front of it;
- a `層` button (or the `D` key) that overlays the whole spec on the scene.

### Not implemented yet

- walking, pathfinding, or any movement at all;
- pose changes at runtime;
- structured world state, memory, or relationships;
- autonomous agent runtime;
- Node.js server, persistence, MCP tools, LLM decision logic.

## How the world is described

Everything the simulation needs to know about the scene is **painted by the
project owner onto the background** and read back by scripts under
`docs/specs/`. Nothing is hand-typed as coordinates, and nothing is guessed from
the artwork by an algorithm that thinks it knows better.

| Layer | Colour | What it means |
|---|---|---|
| `walkable.png` | magenta | ground an agent may stand on |
| `backstage.png` | — | walkable but effectively out of sight; movement costs four times as much |
| `occluder.png` | green | scenery that can stand in front of a character |
| `seats.png` | cyan | where the seats are |
| `seatbacks.png` | magenta | chair backs and the bench back |
| `seatsurfaces.png` | blue | the surface a sitter's weight lands on |
| `tables.png` | magenta | the two cafe tabletops |

Two rules took far longer to get right than they look, and both are written down
in `docs/specs/world/README.md` so they are not rediscovered the hard way:

**Facing comes from what a seat is drawn up to** — a table chair faces its table,
a stool faces the counter, the bench faces the open ground. Reading it off the
painted chair backs was tried twice and failed twice; a back is an upright panel,
so its pixels run far up the screen and it never points where you expect.

**Occlusion is per column, not per object.** Every vertical run of occluder
pixels carries the screen row where it meets the floor, and a character is behind
it exactly when its own ground row is smaller. That single rule gives a table
that hides the person seated behind it and not the person walking in front, a
chair back that covers its occupant only when it stands between them and the
camera, and a bench whose near end behaves differently from its far end.

## Important visual rule

The production background must contain **no people or movable characters**.

Static scenery may be baked into the background, including the café, trees, benches, tables, phone booth, postbox, vending machine, signs, streetlights, and fixed playground equipment.

All agents must be separate transparent sprites layered above the background.

## Technology

Current preview stack:

- Phaser 3;
- static HTML, CSS, and JavaScript;
- fixed 2D / 2.5D-style view;
- GitHub Pages;
- no build step yet.

Canonical live files:

- `docs/index.html`
- `docs/styles.css`
- `docs/showa-scene-clean.js`

The production background is a **2560 × 1440 losslessly encoded WebP** at `docs/assets/showa/scene-clean-2560.webp`, loaded directly by Phaser. World coordinates stay at 640 × 360; the background is drawn at world size, so the extra pixels are spent on zoom sharpness rather than on a larger coordinate space. Existing hotspot coordinates are unaffected.

A matching lossless PNG master of the same render is kept outside the published directory at `assets/showa/scene-clean-2560.png`.

The earlier Base64-fragment transport workaround has been removed from the active scene pipeline.

## Repository map

```text
AGENTS.md                                AI collaboration rules and project source of truth
README.md                                Public project overview

docs/                                    Canonical GitHub Pages application
  index.html                             Active page entry
  styles.css                             Preview UI styles
  showa-scene-clean.js                   Active Phaser scene
  assets/showa/scene-clean-2560.webp     Production background
  assets/characters/                     Cut sprites the live page loads

  specs/world/                           The painted world spec
    world.json                           Coordinates, entrances, height ramp
    walkable.png  backstage.png          Ground and out-of-sight ground
    occluder.png  seatbacks.png          Scenery and chair backs
    seats.png  seatsurfaces.png          Seats and the surfaces sat on
    tables.png                           Cafe tabletops
    occdepth.png                         Floor line per pixel, for the browser
    anchors.json                         Fourteen seats and one work station
    derive.py  seat-derive.py            Read the paintings into the spec
    tables-derive.py
    README.md                            Why each layer exists and what broke

  specs/characters/                      The cast
    pose-matrix.json                     Sizes, buttock lines, offsets, views
    marks/                               Owner-marked sit sheets
    read-marks.py                        Reads the marks into pose-matrix.json
    preview.py                           Offline render, the reference picture
    export-web.py                        Writes what the live page loads
    placements.json                      Where each character stands, in world units
    README.md                            Sheet layouts and sizing rules

assets/                                  Source masters, not published
  showa/scene-clean-2560.png             Lossless PNG master of the background
  characters/                            The twelve reference sheets
```

Every file in the repository is now part of the active Showa direction. The
Jerusalem / Bethesda material and the superseded root-level preview have been
removed; they remain in git history if they are ever needed again.

## Local preview

Serve the `docs/` directory through HTTP:

```bash
python3 -m http.server 8000 --directory docs
```

Phaser is loaded from a CDN, so the preview needs network access. To rebuild what
the page loads after changing the spec or the cast:

```bash
python3 docs/specs/world/seat-derive.py       # seats, facings, chair backs
python3 docs/specs/world/tables-derive.py <painting.png>
python3 docs/specs/characters/read-marks.py   # the owner's sit marks
python3 docs/specs/characters/preview.py      # offline reference render
python3 docs/specs/characters/export-web.py   # sprites, placements, depth map
```

Then open:

```text
http://localhost:8000/
```

Opening `docs/index.html` directly through `file://` is still not recommended; serve the page over HTTP so Phaser and browser asset loading behave consistently.

## Controls

- Drag: pan the camera
- Mouse wheel / trackpad: zoom
- Two-finger pinch: zoom on touch devices
- `Fit`: return to the complete-scene view
- Tap/click a hotspot: update the status label

## Planned development order

1. ~~**Stabilize scene assets**~~ — done.

2. ~~**Define scene semantics**~~ — done. World coordinates, walkable ground,
   backstage, occluders, entrances, seats, facings, and a measured height ramp.

3. ~~**Design the character system**~~ — done for standing and sitting. Twelve
   characters, eight states each (stand/sit × front/back × mirrored), sized and
   seated and occluded in the live page. **There is no walk cycle and none is
   planned**: the owner's decision is that agents hop between positions.

4. **Build a deterministic simulation prototype** ← next
   - one to three agents;
   - movement and occupancy;
   - sitting, ordering, working, resting, and simple conversations.

5. **Add shared-world state**
   - time;
   - objects and inventory;
   - memories and relationships;
   - interaction history.

6. **Add server, MCP, and LLM layers**
   - only after the visual, navigation, and character foundations are stable.

## Planned agent actions

Initial actions:

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

## Multi-AI collaboration

Multiple AI agents can work on LittleWorld at the same time, but they must use separate workstreams and avoid editing the same shared files concurrently.

Before making changes, read:

**[`AGENTS.md`](./AGENTS.md)**

It defines:

- the locked project direction;
- canonical and legacy files;
- visual and asset constraints;
- safe parallel workstreams;
- branch and ownership conventions;
- testing requirements;
- handoff format;
- communication rules for the project owner.

Recommended parallel workstreams include:

- live scene and asset integration;
- walkable-map and hotspot specification;
- character pose and animation design;
- agent state/action schema;
- projection, iPad, and browser QA.

## Scope principle

The project succeeds by being:

- small;
- beautiful;
- easy to understand;
- easy for agents to navigate;
- dense enough for frequent social encounters;
- reliable enough to finish and demonstrate.

A finished small world is more valuable than an unfinished large simulation.

## License

See [`LICENSE`](./LICENSE).
