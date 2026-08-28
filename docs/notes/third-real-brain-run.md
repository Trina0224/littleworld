# Pre-3G — the cafe, with a real Brain

**Run:** 2026-08-28, six Brain calls, `src/engine/demo-brain.js --grace 40 --settle 900`.
**Answers:** `docs/specs/engine/phase-3f.md` §12.15.

Same isolation as the two runs before it: every line decided in a fresh context
holding only that character's `self.md`, its derived guidance, the once-per-run
bootstrap, and one dynamic package. No `bible.md`, no other sheets, no world
state, no carry-over.

---

## What the run did

```text
   0  ambient_set          曇り, 22°C, 涼しい, 地面は乾いている
  40  venue_obligation     order_due    星さん
  40  venue_obligation     order_due    渡辺
  41  speech_said          （下）        星さん -> [渡辺, 澄子]
  41  order_placed         煎茶          星さん
  42  preparation_started  煎茶
 152  order_ready          煎茶          110 ticks: the menu says 90 + 20 handling
 192  order_served         煎茶          星さん
 192  venue_obligation     satisfied     星さん
 792  order_cleared        煎茶          星さん
```

The line, in one breath, asking the stranger a question and ordering tea:

> ねえ、そこの眼鏡のあんた、こっちの席は空いてるからお掛けなさいな。**ばあちゃんね、
> ここでもうずいぶん座っとるのよ。**……あら、辰ちゃんもおるねえ。ハナも一緒かい。
> あんた、この町の人じゃないでしょ。見ん顔だもの。どちらからおいでなすったの？

`{"picks": ["ask:seen-2", "order:tea_sencha"], ...}`

---

## §12.15's questions

### Did it use the supplied knowledge?

**The obligation, yes, and unmistakably.** `self.noticing` said 「你在這裡坐了一陣子了。
要待下去的話，該點些什麼，不然就該走了。」 and she answered it in her own voice:
「ばあちゃんね、ここでもうずいぶん座っとるのよ」, then ordered. Nothing told her to
say that; she was told she had been sitting a while and behaved like somebody who
had been sitting a while.

**The menu, yes, by not needing it.** She picked 煎茶 — 25円, the cheapest Japanese
tea, exactly what an old woman who sits there every week orders — out of
thirty-three engine-authored choices. No invented item, no rejection loop.

**The weather, not this time.** 曇り, 22°, 涼しい were in the bootstrap and she
mentioned none of them. That is not a failure: this is the first run of any of
the three where she did not assert a weather she had not been given. Previously
she volunteered 「暑いのに」 out of nothing; now the hole is filled and she simply
did not need it.

### Did it invent venue items or physical conditions?

**No.** No curry, no unlisted sweet, no frayed sleeve, no walk from the park. The
one physical thing she claimed — 「こっちの席は空いてる」, that the seat beside her
is free — is true and available to her: nobody is rendered in it.

### Did the world finish without a Brain?

**Yes, and this is the load-bearing result.** After tick 42 no Brain answered
anything. 澄子 was offered the floor once, as the person spoken to, and said
nothing. The tea steeped for the ticks the menu specifies, was carried to the
person who ordered it, satisfied her obligation, and was collected 600 ticks
later — all with the shopkeeper's Brain silent. A provider outage would not have
changed one fact of it.

---

## What this leaves open

### 1. The spoken line and the structured act can drift apart

She ordered 煎茶 and her sentence does not mention tea. Both halves are legal:
`phase-3c-venue-interactions.md` §3 deliberately separates natural language for
the fiction from the structured action for execution, so nothing is broken. But
somebody reading the transcript sees a woman asking a stranger where he is from,
and a cup of tea arriving 150 ticks later for no visible reason.

The engine must never read prose to work out what was ordered — that is the whole
boundary. The available fix is at the other end: when an order act is committed
and the utterance does not mention it, the world could commit a short templated
acknowledgement of its own (venue §6 already contemplates 「はい、少々お待ちください」
as a world utterance rather than an LLM request). Not done here, because it adds
speech to the fact stream and that is a decision about the world.

### 2. The bootstrap is 4,700 characters of the 10,300-character prompt

The menu alone is 33 items. In production this is a cached session prefix and
costs 0.1× (`pacing-and-latency.md` §6b), which is exactly why §4 puts it in the
session. The manual harness has no session, so it resends everything — a property
of the instrument, and the reason the harness is not a cost measurement.

### 3. `conversation` still changes shape line by line

Carried forward unfixed from the second run and explicitly optional under §10.2:
`speaker` and each entry of `to` is sometimes `"you"`, sometimes a learned label,
sometimes `{ref, looks}`. No real-Brain failure has been traced to it in three
runs, so it stays as it is rather than being refactored for symmetry.

### 4. The far table cannot order

`ordersFor` gates on her being able to hear you at ordinary speaking volume, and
the far table is 78 units from the counter against a hearing range of 70. Someone
sitting there has to call across or move closer. That is the room, not a rule —
and it is untested against a real Brain, which has never sat there.
