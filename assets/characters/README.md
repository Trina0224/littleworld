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
| `pastor-01/pastor-01-stand-a.png` | pastor-01 | dark suit, clerical collar, cross, bible | standing, take a |
| `pastor-01/pastor-01-stand-b.png` | pastor-01 | dark suit, clerical collar, cross, bible | standing, take b |
| `pastor-01/pastor-01-sit.png` | pastor-01 | dark suit, clerical collar, cross, bible | seated |

Every sheet is 1536 x 1024 RGBA and holds **two views side by side: front on the
left, back on the right**. There is no side view yet, which the pose matrix will
need.

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

`pastor-01` currently has two standing takes, `-a` and `-b`, because both were
supplied. Only one should survive into the sprite pipeline. Delete the other once
the owner picks, and drop the take segment from the winner's filename.

## Adding more

Drop new sheets in the character's directory following the naming above and add a
row to the table. Commit the art in its own commit, separate from code, so it is
easy to review and easy to revert.
