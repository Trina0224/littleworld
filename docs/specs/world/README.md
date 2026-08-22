# World semantics — Showa park and kissaten

Phase 1 of `AGENTS.md` section 8. Everything here is data about **where agents
can be and what hides them**, kept separate from the painted background.

## Coordinate system

World units are **640 x 360**, matching the Phaser world in
`docs/showa-scene-clean.js`. The background texture is 2560 x 1440, exactly 4x
these units, drawn with `setDisplaySize(640, 360)`. Multiply a world coordinate
by 4 to reach a background pixel.

## Layers

| File | Resolution | White means |
|---|---|---|
| `walkable.png` | 2560 x 1440 | ground an agent can stand on |
| `occluder.png` | 2560 x 1440 | scenery drawn in front of agents |
| `backstage.png` | 640 x 360 | walkable, but an agent there is effectively hidden |

`walkable.png` and `occluder.png` were painted by the owner over the background
in `#FF00FF` and `#00FF00`, then thresholded and despeckled. `backstage.png` is
derived from the other two by `derive.py` and should never be edited by hand.

The painted source images are not kept. They were 7 MB each, almost entirely the
background photo underneath, and the paint was clean enough that these 1-bit
masks lose nothing: painted pixels averaged `(249, 5, 246)` and `(4, 248, 2)`
against a threshold of 110, and unpainted pixels matched the background to
within 0.22/255, so there was no misalignment to correct.

## Why backstage is a separate layer

The owner painted walkable generously, including ground behind the cafe roof,
behind the tree and behind the right-hand fence. That is the right call — the
roof is foreground, and an agent walking behind it should simply be hidden.

But those cells cannot be ordinary walkable ground, for two reasons.

Pathfinding would use them as a shortcut. A straight line from the west street
to the park across the cafe roof is shorter than the route past the terrace, so
agents would vanish for several seconds and reappear, which reads as a bug
rather than as walking behind a building. `README.md` states the scene is
deliberately small so agents meet; hidden shortcuts work against that.

The height ramp is also wrong up there. Character scale comes from screen y, but
the roof band sits high on screen because the building is **tall**, not because
the ground behind it is far away. An agent placed there scales far too small.

So backstage cells stay traversable and carry the movement cost multiplier in
`world.json`. Agents use them to enter, leave and pass behind scenery, not to
cut corners.

Current split of the 66,755 walkable cells: 57.5% stage, 31.5% partly occluded,
11.0% backstage.

## The height ramp is a guess

`characterHeightRamp` in `world.json` is an eyeball estimate — 32 world units
tall at y=120, 55 at y=340. It decides the backstage classification and it will
decide every sprite scale later. **Measure it from a real sprite standing in the
scene and replace those two numbers before anything depends on them.**

## Corrections applied to the painted occluder map

Removed at the owner's request: the bottom-right rubbish bin (935 cells) and a
stray dot on the park bench (14 cells). Also removed, found while checking: a
25-cell brush streak across a flowerpot on the left, and five specks of 1 to 6
cells. Four components remain — the main scenery mass, the tree planter, the
hedge in front of the right fence, and the bush by the vending machine.

## Not mapped yet

Seats, counter positions, interaction anchors, and seat facing directions. Those
are what the character pose matrix will need; see `AGENTS.md` section 8, Phase 2.

## Regenerating

```bash
python3 docs/specs/world/derive.py
```

Rewrites `backstage.png` from the two painted masks. Re-run it after either mask
changes, or after changing the threshold or the height ramp in `world.json`.
