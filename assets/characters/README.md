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

Every sheet is 1536 x 1024 RGBA and holds **two views side by side: front on the
left, back on the right**. There is no side view yet, which the pose matrix will
need.

## Naming

```
<character-id>/<character-id>[-<outfit>]-<pose>.png
```

Omit the outfit segment when a character has only one. Keep character ids stable
once assigned; they become the key that ties art, pose data, and agent state
together.

## Adding more

Drop new sheets in the character's directory following the naming above and add a
row to the table. Commit the art in its own commit, separate from code, so it is
easy to review and easy to revert.
