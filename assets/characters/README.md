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

Every sheet is 1536 x 1024 RGBA and holds **two views side by side**. For the
first five characters that is front on the left, back on the right. `woman-01`
and `man-01` are drawn turned further toward the side; that is simply how those
two were drawn, not an attempt at a side view.

`shopkeeper-01` is named for the counter station in
`docs/specs/world/anchors.json`, which needs an occupant. Rename freely — nothing
references these ids yet.

**No character has a true side view.** The pose matrix needs one before walking
animation is possible, and mirroring cannot generate it from front and back.

## Known inconsistency

`grandpa-01/grandpa-01-sit.png` was generated in a different batch from the rest.
It sits on a light grey backdrop (corner pixels around 110) while every other
sheet uses a black vignette (corner pixels at 0), and its linework is lighter and
less saturated. Cutting the figure out and colour-matching it will need separate
handling from the others. Worth regenerating to match if the character is
redrawn for any other reason.

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
