# Character pose matrix

Phase 2 of `AGENTS.md` section 8. This records what the owner decided rather
than proposing options, and it is deliberately the smallest matrix that works.

## Eight states per character, and no new art

| | front | back |
|---|---|---|
| **stand** | as drawn, and mirrored | as drawn, and mirrored |
| **sit** | as drawn, and mirrored | as drawn, and mirrored |

Two poses times two drawn views times a horizontal flip. Every character already
has all four source images, so **the whole matrix needs no drawing at all**. The
eleven characters in `assets/characters/` are complete for Phase 2 today.

The four images come from either of two sheet layouts, described in
`assets/characters/README.md`. The newer four-view sheet holds all of them in a
single file and maps one-to-one onto this matrix, so it is the layout to ask for
from here on.

### No walk cycle

Agents do not get a walking animation. At the sizes the height ramp gives — 17
world units at the back of the scene, 90 at the front — a walk cycle is detail
nobody can see. Agents slide along their path with a small hop, and that is
enough.

This is what removes the side view from the critical path. A true 90 degree
profile is only needed to animate walking, and nothing is going to animate
walking, so the gap in the reference sheets stops mattering.

## Picking a state from a facing

`docs/specs/world/anchors.json` stores continuous facings in degrees, screen
space, 0 pointing right and 90 pointing down toward the camera. Two comparisons
pick the state:

```
view   = (0 <= deg < 180) ? 'front' : 'back'
mirror = (90 <= deg < 270)
```

Down-screen means facing the camera, so the front view is drawn. Left-of-screen
means the flip. Mirroring reads as a genuine turn because the drawn views are
already angled slightly off-axis rather than dead-on.

Applied to every anchor currently in the world spec:

| Anchor | Facing | State |
|---|---|---|
| `counter-stool-1..3` | 258.2° | back, mirrored |
| `table-near-1` | 332.7° | back |
| `table-near-2` | 12.7° | front |
| `table-near-3` | 146.3° | front, mirrored |
| `table-near-4` | 188.3° | back, mirrored |
| `table-far-1` | 4.1° | front |
| `table-far-2` | 147.9° | front, mirrored |
| `table-far-3` | 197.5° | back, mirrored |
| `bench-slot-1..3` | 249.5° | back, mirrored |
| `cafe-counter` (station) | 78.2° | front |

Everything lands somewhere sensible: stools and bench show their backs, the two
tables show a mix, and the keeper faces out over the counter.

## What mirroring costs

A flipped sprite has its asymmetries reversed. In this cast that means apron
ties, the family crests on `gentleman-01`, wristwatches, and `boy-01`'s backpack
swap sides. At 17 to 90 world units tall none of it is legible, so the trade is
worth taking — but it does mean no character design should ever depend on a
detail being on a particular side.

## Scale

Sprite height comes from `characterHeightRamp` in `docs/specs/world/world.json`,
which is measured rather than guessed. Adults are treated as 1.65 m and children
as 1.35 m; `boy-01` and `girl-01` are the children.

## Still to build

Cutting the two views out of each sheet as transparent PNGs, packing them, and
wiring depth sorting and the occluder mask. All programming, no drawing.
