# Character reference sheets

Owner-supplied character art. These are **reference sheets, not runtime sprites** —
nothing in `docs/` loads them, and nothing should until the pose matrix and the
sprite pipeline exist (`AGENTS.md` section 8, Phase 2).

## Current set

| File | Character | Outfit | Pose |
|---|---|---|---|
| `boy-01/boy-01-shorts-stand.png` | boy-01 | plaid shirt, tee, cargo shorts, backpack | standing |
| `boy-01/boy-01-trousers-stand.png` | boy-01 | plaid shirt, tee, dark trousers, belt, watch | standing |
| `boy-01/boy-01-trousers-sit.png` | boy-01 | plaid shirt, tee, dark trousers, belt, watch | seated |
| `girl-01/girl-01-stand.png` | girl-01 | cardigan, blouse, skirt | standing |
| `girl-01/girl-01-sit.png` | girl-01 | cardigan, blouse, skirt | seated |
| `grandma-01/grandma-01-stand.png` | grandma-01 | red cardigan, apron, navy skirt | standing |
| `grandma-01/grandma-01-sit.png` | grandma-01 | red cardigan, apron, navy skirt | seated |
| `grandpa-01/grandpa-01-stand.png` | grandpa-01 | beige cardigan, vest, trousers | standing |
| `grandpa-01/grandpa-01-sit.png` | grandpa-01 | beige cardigan, vest, trousers | seated |
| `pastor-01/pastor-01-stand.png` | pastor-01 | dark suit, clerical collar, cross, bible | standing |
| `pastor-01/pastor-01-sit.png` | pastor-01 | dark suit, clerical collar, cross, bible | seated |
| `woman-01/woman-01-stand.png` | woman-01, office worker | white knit top, rose midi skirt, heels | standing |
| `woman-01/woman-01-sit.png` | woman-01, office worker | white knit top, rose midi skirt, heels | seated |
| `man-01/man-01-stand.png` | man-01, office worker | white shirt, striped tie, navy trousers | standing |
| `man-01/man-01-sit.png` | man-01, office worker | white shirt, striped tie, navy trousers | seated |
| `shopkeeper-01/shopkeeper-01-stand.png` | shopkeeper-01 | indigo work kimono, white apron, monpe, geta | standing |
| `shopkeeper-01/shopkeeper-01-sit.png` | shopkeeper-01 | indigo work kimono, white apron, monpe, geta | seated |
| `gentleman-01/gentleman-01-stand.png` | gentleman-01 | crested haori, kimono, obi, geta | standing |
| `gentleman-01/gentleman-01-sit.png` | gentleman-01 | crested haori, kimono, obi, geta | seated |
| `brother-01/brother-01.png` | brother-01, elder brother | cap, backpack, bear tee, cargo shorts | four views in one sheet |
| `brother-02/brother-02.png` | brother-02, younger brother | ringer tee, cargo shorts | four views in one sheet |
| `dog-01/dog-01.png` | dog-01, the brothers' dog | shetland sheepdog | four views in one sheet |

Every sheet is 1536 x 1024 **RGBA with a transparent background**. All 22 have
fully transparent borders; there is no backdrop to remove and no cut-out step.
Anything that looks like a black vignette or a warm gradient is the RGB left
under transparent pixels, which a viewer shows only because it flattens the
image onto black. Read the alpha channel.

There are two layouts.

**Two views**, front on the left and back on the right, with standing and seated
in separate files. That covers the first nine characters. `woman-01` and
`man-01` are drawn turned further toward the side; that is simply how those two
were drawn, not an attempt at a side view.

**Four views** in a single file, left to right: standing front, standing back,
seated front, seated back. `brother-01` and `brother-02` use this. One such
sheet is the complete source for the eight-state pose matrix in
`docs/specs/characters/`, so it is the preferred layout for anything new. The
four figures separate cleanly on a column-mass cut:

| Sheet | Columns |
|---|---|
| `brother-01.png` | 22-355, 467-735, 796-1098, 1220-1498 |
| `brother-02.png` | 82-341, 468-707, 777-1060, 1169-1461 |

| `dog-01.png` | 9-497, 508-788, 851-1230, 1241-1508 |

Those are measured from the alpha channel, which is the only correct source.
Reading them off the RGB got `brother-02` wrong by 39, 26 and 75 px and `dog-01`
wrong by up to 27 px, because the RGB under a transparent pixel says nothing
about where a figure ends.

`brother-01` is a special case: its third and fourth views **touch**, joined
across five rows at x=1156, so there is no gap there at all. Its third cut is
that waist rather than a gap, and any tool splitting these sheets has to cope
with views that meet.

Filenames in this layout carry no pose segment, since one file holds them all.

## Relationships

`brother-01` and `brother-02` are siblings — 01 the elder, 02 the younger — and
`dog-01` is their dog. The agent model will want these; see `AGENTS.md` section
7, which lists relationships as part of agent state.

`dog-01` is an animal agent rather than a person. It still fits the eight-state
pose matrix — it stands and it sits, drawn toward and away from the camera — but
it is not 1.65 m tall and it will not use the same action set.

`shopkeeper-01` is named for the counter station in
`docs/specs/world/anchors.json`, which needs an occupant. Rename freely — nothing
references these ids yet.

**No character has a true side view.** The pose matrix needs one before walking
animation is possible, and mirroring cannot generate it from front and back.

## A correction

An earlier version of this file claimed `grandpa-01-sit.png` came from a
different batch and would need separate cut-out handling, because its corner
pixels read about 110 where every other sheet read 0. That was wrong. Those are
RGB values under **fully transparent** pixels — its alpha borders are 0 like
every other sheet, and it needs no special handling. The same mistake produced
the "black vignette" and "white backdrop" descriptions elsewhere in this file,
now removed.

## Naming

```
<character-id>/<character-id>[-<outfit>]-<pose>[-<take>].png
```

Omit the outfit segment when a character has only one, and the take segment
unless there is more than one drawing of the same pose. Keep character ids stable
once assigned; they become the key that ties art, pose data, and agent state
together.

## Adding more

Drop new sheets in the character's directory following the naming above and add a
row to the table. Commit the art in its own commit, separate from code, so it is
easy to review and easy to revert.
