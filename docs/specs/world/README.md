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

Each seat carries a `seat` point, a `seatSurface` (the painted seat top: its
centre and box), a `facingDeg`, and a `backrestTopY`.

### Facing comes from what the seat is drawn up to

A table chair faces its table. A counter stool faces the counter. The park bench
faces the open ground. That is the whole rule, and it is the owner's, stated
outright rather than inferred.

Two attempts at reading facing off the painted chair backs both failed, and the
second failure is the instructive one. A back is an upright panel, so its pixels
run far up the screen from wherever it stands and its centroid always lands above
its seat — which reported that every chair in the scene faces the camera, put the
kimono man and the grandfather with their backs to their own table, and turned the
two boys round on the bench. Moving to the back's bottom edge fixed the sign, and
the seven table chairs then agreed with their table to within 22 degrees. Close,
and still wrong: a hand-painted patch a few pixels across cannot pin an angle, and
the residual spread was enough to be visible.

**A table is a far better instrument than a brush stroke** — every seat around it
agrees on where it is. So:

| Group | Faces |
|---|---|
| `table-near` | the near table, found as an enclosed hole in `walkable.png` at (210.7, 232.6) |
| `table-far` | the centroid of its own three seats; the walkable map has no hole close enough to be that table |
| `counter-stool` | across the row the stools stand in, up-screen into the counter |
| `bench` | across its length, toward whichever side has open walkable ground |

The painted backs are still used, for `backrestTopY` and for nothing else.

The owner counts **four** counter stools. Only three have a painted seat top, so
only three can be sat on; the fourth, furthest into the shop, has a painted back
and no seat.

The bench is 93 world units long, so it is split into three slots rather than
treated as one seat. Two agents sharing a bench is exactly the emergent scene
`README.md` asks for.

One painted blob merged a table chair with the stool behind it. Its row profile
breaks at y=210, where both the width and the right edge jump, so it is split
there into `counter-stool-3` and `table-near-2`.

### Chair backs need no special case at all

The plain occluder rule already does it. Every vertical run of occluder pixels
carries the screen y where that run meets the floor, and a character is behind
the run exactly when its own ground y is smaller. Feed the painted chair backs
into that and each back lands correctly: a back standing between the camera and
its seat covers the occupant, a back up-screen of the seat draws behind them.

Two earlier attempts overrode this with a per-seat constant — first the back's
top row, then its bottom edge. Neither was needed, and the constant is strictly
worse: **it is a single depth for the whole patch, so it cannot answer "what
about someone walking past in front of it?"** The run rule answers that per
column, which is the question the owner asked and the reason the override is
gone.

`backrestBaseY` and `backrestCovers` are still written into `anchors.json` as
description, not as inputs. The four near-side seats are `table-near-1`,
`table-near-4`, `table-far-3` and all three bench slots — a list derived from the
paint alone that comes out exactly equal to the list of seats whose facing is a
back view. Two independent measurements, same answer.

The park bench is the case that made this matter. Its back really is in front of
its occupants, so drawing it correctly buried the two boys down to a cap. They
are offset 6 units toward the big tree, which lifts their heads and shoulders
clear and leaves the back covering their legs, and `brother-02` takes a further
8 units along the bench toward his brother.

**The bench's armrest is not painted and therefore cannot occlude.** The magenta
in `seatbacks.png` starts at x=474; the armrest at the bench's near end occupies
roughly x=452–472, y=248–272, and is bare. A stroke of `#FF00FF` over it is all
that is needed. Until then `brother-02` is moved clear of it instead, which hides
the problem rather than fixing it.

Painting it does not make it a wall. It becomes foreground only for people
further from the camera than the armrest's own floor line; anyone walking past in
front of the bench draws over it. That is the run rule doing its job, and it is
worth checking rather than trusting — put a standing figure at y=246, 268 and 292
by the bench and the bench hides her legs, then half of them, then none.

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

## The tables need painting, and the walkable map cannot help

Deriving the two cafe tables from enclosed holes in `walkable.png` was my idea
and it does not work. **A walkable map describes the floor. A tabletop is 0.7 m
above the floor, so its drawn silhouette sits well up-screen of anything a floor
map can express**, and no amount of processing recovers it.

What the hole actually gives is the table's footprint plus whatever of the table
the owner happened not to paint over. For the near table the hole runs y=215–251
while the drawn top runs y=209–228, so the occluder covers the lower half of the
top and stops in a ragged line across the middle of it. Anyone seated behind the
table is cut in half by that line — which is exactly what the owner reported.

I tried recovering the top from the art with a colour flood from its centre. It
takes most of the top and stops at the sunlit rim, so it is not clean enough to
use, and fitting the ellipse by hand is the art-by-guesswork that has gone wrong
here before.

**The fix is one more painted layer: the two tabletops.** Once painted they need
nothing else — the run rule gives each column its own floor line, so the table
covers whoever sits behind it and does not cover whoever walks in front, the same
way the chair backs work. Same for the bench armrest, which is bare for the same
kind of reason.

## Not mapped yet

Nothing else in Phase 1. Phase 2 needs the pose matrix to consume these facings;
see `AGENTS.md` section 8.

## Regenerating

```bash
python3 docs/specs/world/derive.py
```

Rewrites `backstage.png` from the two painted masks. Re-run it after either mask
changes, or after changing the threshold or the height ramp in `world.json`.
