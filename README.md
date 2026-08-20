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

- Phaser-based static scene;
- fixed camera direction;
- drag-to-pan;
- mouse-wheel zoom;
- touch pinch zoom;
- Fit button;
- GitHub Pages preview;
- clean background with all people removed;
- placeholder logical hotspots.

### Not implemented yet

- walkable and blocked-area map;
- collision or pathfinding;
- production character sprites;
- walking, sitting, working, or interaction animations;
- structured world state;
- autonomous agent runtime;
- Node.js server;
- persistence;
- MCP tools;
- LLM decision logic.

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

The current background is temporarily reconstructed from Base64 text fragments under `docs/assets/showa/clean/`. This was a binary-upload workaround and should eventually be replaced with a normal `.webp` or `.png` asset loaded directly by Phaser.

## Repository map

```text
AGENTS.md                       AI collaboration rules and project source of truth
README.md                       Public project overview

docs/                           Canonical GitHub Pages application
  index.html                    Active page entry
  styles.css                    Preview UI styles
  showa-scene-clean.js          Active Phaser scene
  assets/showa/clean/           Temporary encoded clean background
  map-blueprint.md              Legacy Jerusalem blueprint; not current scope

assets/                          Older and experimental assets
index.html, main.js, styles.css  Legacy root preview; not the current Pages entry
```

Several Jerusalem / Bethesda files remain in the repository as historical artifacts. They are not the active design direction and should not be used as current requirements.

## Local preview

Serve the `docs/` directory through HTTP:

```bash
python3 -m http.server 8000 --directory docs
```

Then open:

```text
http://localhost:8000/
```

Opening `docs/index.html` directly through `file://` is not recommended because the current background loader fetches asset fragments.

## Controls

- Drag: pan the camera
- Mouse wheel / trackpad: zoom
- Two-finger pinch: zoom on touch devices
- `Fit`: return to the complete-scene view
- Tap/click a hotspot: update the status label

## Planned development order

1. **Stabilize scene assets**
   - keep the approved clean background complete and visible;
   - replace the Base64-fragment workaround with a normal image asset when possible.

2. **Define scene semantics**
   - world coordinates;
   - walkable areas;
   - blocked scenery;
   - entrances, exits, seats, counter positions, and hotspot anchors.

3. **Design the character system**
   - character scale;
   - facing directions;
   - minimum pose and animation matrix;
   - transparent sprite prototypes;
   - walking and sitting tests in the current scene.

4. **Build a deterministic simulation prototype**
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
