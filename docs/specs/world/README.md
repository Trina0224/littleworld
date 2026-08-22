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

Current split of the 66,755 walkable cells: 56.4% stage, 27.9% partly occluded,
15.7% backstage.

## The height ramp, measured

```
worldUnitsPerMetre(y) = 0.2023 * (y - 69.9)
```

Fitted by least squares to four objects of known real height, measured off the
background itself:

| Object | Real height | Base y | World units | Residual |
|---|---|---|---|---|
| round postbox (郵便差出箱1号丸型) | 1.35 m | 253.8 | 48.2 | -3.9% |
| drinks vending machine | 1.83 m | 327.5 | 92.5 | -3.0% |
| phone booth | 2.20 m | 322.5 | 126.2 | +12.3% |
| litter bin | 0.75 m | 350.0 | 40.0 | -5.8% |

The booth carries the loosest residual because its assumed 2.2 m is the least
certain of the four. Validated afterwards by compositing `man-01` and `boy-01`
into the scene at six depths, where they sit correctly against the counter, the
tables, the bench and the standing sign.

A 1.65 m adult is therefore **16.7 world units tall at y=120 and 90.2 at y=340**.
The earlier eyeball estimate said 32 and 55 — too big by 2x at the far end and
too small by 1.6x at the near end, in opposite directions, which is why nothing
was allowed to depend on it.

### The horizon falls inside the walkable area

The fit puts the horizon at **y = 69.9**, and the painted walkable area reaches
up to y=45. Above the horizon the ground-plane ramp has no scale left to give,
so no character can be placed there at any size. `derive.py` marks every
walkable cell at or above the horizon as backstage unconditionally, whatever the
occluders say — 2,950 cells.

This is the concrete form of the concern raised when backstage was introduced:
the band behind the roof is high on screen because the building is tall, not
because the ground is far away. The measurement confirms it and the rule handles
it.

## Corrections applied to the painted occluder map

Removed at the owner's request: the bottom-right rubbish bin (935 cells) and a
stray dot on the park bench (14 cells). Also removed, found while checking: a
25-cell brush streak across a flowerpot on the left, and five specks of 1 to 6
cells. Four components remain — the main scenery mass, the tree planter, the
hedge in front of the right fence, and the bush by the vending machine.

## Seats and stations

`anchors.json` holds thirteen seats and one work station, derived from two more
painted maps — seats in `#00FFFF`, the counter in `#0000FF`.

| Group | Count | Facing derived from |
|---|---|---|
| `counter-stool` | 3 | the normal of the counter region's principal axis |
| `table-near` | 4 | the shared centroid of the group, which is the table |
| `table-far` | 3 | the same |
| `bench` | 3 slots | the normal of the bench's long axis, toward whichever side has more walkable ground |

Each seat carries a `seat` point, a `foot` point three and a half units in front
of it, and a facing in both degrees and compass form.

Facing the group centroid works for chairs around a table but gave poor results
for the counter stools, pointing them along the counter rather than into it. The
principal-axis normal fixes that and puts all three at 258.2 degrees.

The bench is 93 world units long, so it is split into three slots rather than
treated as one seat. Two agents sharing a bench is exactly the emergent scene
`README.md` asks for.

One painted blob merged a table chair with the stool behind it. Its row profile
breaks at y=210, where both the width and the right edge jump, so it is split
there into `counter-stool-3` and `table-near-2`.

### The counter is a station, not walkable ground

The counter region is deliberately absent from `walkable.png` — agents must not
path through the shop — and the keeper is placed at its anchor directly rather
than walking there.

**The counter front is not in `occluder.png`, and that is deferred on purpose.**
Painting it in would let the counter hide the keeper's lower body by the same
mechanism that hides an agent behind the tree trunk. But how much of a body the
counter actually covers depends on whether that body is standing or seated and
on exactly where it stands, so one flat painted mask may not be the right answer.
Revisit when sprites are really being placed here. Until then the keeper renders
full height in front of the counter.

The station anchor sits behind the middle of the counter. Exactly where a keeper
stands is a judgement call, so treat it as adjustable.

## Not mapped yet

Nothing else in Phase 1. Phase 2 needs the pose matrix to consume these facings;
see `AGENTS.md` section 8.

## Regenerating

```bash
python3 docs/specs/world/derive.py
```

Rewrites `backstage.png` from the two painted masks. Re-run it after either mask
changes, or after changing the threshold or the height ramp in `world.json`.
