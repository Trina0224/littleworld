# LittleWorld

A 2.5D shared-world simulation for AI agents.

## Current milestone — Map v0.1 Graybox

Scope:

- Temple outer court
- Pool of Bethesda
- Market / money changers / sacrificial animals
- Main city street / entrance
- Reserved eastward route toward Kidron / Gethsemane
- Reserved southward route toward Siloam

The map is intentionally compressed. Relative geography matters more than exact scale; architecture will be refined against Second Temple period references before final assets are locked.

## Temporary live preview

https://raw.githack.com/Trina0224/littleworld/main/index.html

This is a low-traffic development preview that mirrors the `main` branch.

## Controls

- Drag: pan camera
- Mouse wheel / trackpad: zoom
- Tap/click a zone: show the zone description

## Development order

1. Graybox layout and camera scale
2. Lock map proportions and walkable routes
3. Prepare modular 2.5D assets
4. Replace graybox geometry with researched architecture and props
5. Add world-state/server layer
6. Add agents, MCP tools, and LLM integration

## Working structure

- `docs/` — map plans, historical notes, asset lists
- `assets/map/` — map textures, modular architecture, props, references
- `index.html`, `main.js`, `styles.css` — current static Phaser preview
- `src/` — structured client code when the graybox is promoted to the full Vite project
