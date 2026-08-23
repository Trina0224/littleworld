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

## Sprites need no cutting out

Every reference sheet is RGBA **with a transparent background**. All 22 have
fully transparent borders. There is nothing to key out.

What looks like a black vignette with a halo is the RGB left under those
transparent pixels, shown only because a viewer flattens the image onto black.
Five cut-out methods were built against that phantom — brightness threshold,
gradient-limited flood, local-detail barrier, chroma barrier, halo erosion — and
every one ate dark hair or dark trousers, because in the RGB those sit in the
same range as the thing being keyed. None of it was needed.

The same mistake put wrong numbers in the specs: view boundaries read off the RGB
were out by up to 75 px, and `grandpa-01-sit.png` was recorded as needing special
handling on the strength of RGB values under transparent pixels. Read the alpha
channel, for mattes and for measurements alike.

Splitting a sheet into views goes by **alpha connected component**, not by
column. `brother-01`'s two seated views overlap horizontally — one boy's backpack
reaches past the other's left edge — so any vertical cut slices a figure. Erode
the alpha to break the bridge where they touch, label, then grow each label back
over the full alpha, and each view carries only its own figure.

## How small is too small

Below about **24 world units** a figure loses whatever makes it recognisable. A
seated child at `table-far` is 20 units, about 13 x 20 px, and a backpack becomes
four blue pixels.

| Anchor group | Seated child |
|---|---|
| `cafe-counter` | 18.5 |
| `table-far` | 20 - 22 |
| `counter-stool` | 22 - 25 |
| `table-near` | 29 - 35 |
| `bench` | 36 - 40 |

This is the height ramp being honest, not a bug: those anchors really are close
to the horizon. It just means the characters whose detail matters — the brothers
and the dog, the first LLM scenario — belong near the camera.

## Seated size and placement

Seated size cannot be read off the art. Each sheet is framed to fill its own
canvas, so a character's standing and seated drawings share no scale — measuring
their pixel heights returns a ratio near 1.0 for everyone, which is a fact about
framing, not anatomy.

So seated size comes from **sitting height**, seat surface to the top of the
head: 0.85 m for a 1.65 m adult, scaled by stature. That is the one body measure
that survives the framing difference, and it is the measure taken from the seat,
which is exactly where the sprite is anchored.

### The marked sheets

`marks/` holds the boards the owner drew on: the sit sprite at 760 px tall with a
percentage grid, front and back side by side. Two magenta strokes per view — a
long one along the buttocks where they meet the seat, a short one at the knee.
`read-marks.py` reads them into `pose-matrix.json` as `sitMarks`, as fractions of
sprite height. The long stroke is the anchor; the knee is the check.

Guessing these was the single biggest source of characters that looked wrong.
The measured values are nothing like the eyeballed ones — `grandma-01`'s buttock
line is at 0.30 of her sprite height, not the 0.42 that was guessed.

Two poses in the set are not chair-sitting at all, and the marks say so plainly.
`shopkeeper-01`'s sit sheet is a floor squat: her buttocks read 0.247 and her
knee 0.370, knee well above hip, which is what a crouch looks like and not what
a chair looks like. `brother-01` is close behind at 0.246 / 0.278. Neither should
be dropped onto a table chair without looking at the result — the shopkeeper
stands at her counter today, and the boy sits on a low bench, so both are fine
where they are.

### Where the sprite goes

The buttock line goes on the painted seat top, 30% back from its front edge.
Note that the seat's **depth** is one column of the painted quad, not the quad's
bounding box: these seats run diagonally, so most of that box's height is the
seat's length. Sizing a sitter to cover the whole quad is wrong for the same
reason and worse — the quad lies on the ground plane and gets stretched sideways
to about 1.8x the chair's real width, while shoulders stand upright and get no
such stretch, so matching them made a 1.65 m man read 2.4 m tall.

Feet are not corrected. Rising 0.42 m onto a seat and stepping 0.45 m back off
the chair reach nearly the same screen row here, so no single placement puts both
the buttocks and the soles where they belong. The buttocks win.

Two characters are exempt, by the owner's call: `brother-02` and `dog-01` are
small enough to sit on the painted seat entire, feet and all. They are listed in
`wholeOnSeat` and placed by their own sprite bottom on the seat's front edge,
centred, with nothing to align. Everyone else's feet reach past the front of the
chair, which is what forces the choice.

`preview.py` prints, per sitter, whether the marked buttock line and knee both
land inside the painted seat. All five marked characters currently do.

## Preview

```bash
python3 docs/specs/characters/preview.py
```

Places all twelve characters at their anchors from `docs/specs/world/anchors.json`,
picks each one's view and mirror from the rules above, scales by the measured
height ramp, sorts by depth, draws the scenery occluders in between, and writes
`populated.png`.

## Still to build

One of the twelve sit sheets is not marked yet — `dog-01`. It falls back to the
eyeballed `hipFraction` until it is, and it does not sit anywhere yet anyway.

Then packing, and wiring depth sorting and the occluder mask into the live scene.
