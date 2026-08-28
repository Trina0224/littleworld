# Pre-3F — the second real Brain run

**Run:** 2026-08-27, ten Brain calls, `src/engine/demo-brain.js`.
**Transcript:** `second-real-brain-run.md`.
**Answers:** `docs/specs/engine/phase-3e-brain-grounding-and-interject.md` §7.

Same isolation as the first run: every line decided in a fresh context holding
only that character's `self.md`, its derived guidance, and one dynamic package.
No `bible.md`, no other sheets, no world state, no carry-over between requests.

---

## §7's five questions, answered

### Did invented physical claims decrease once grounding was present?

**Yes, and visibly so on the exact sentence that produced the finding.** In the
first run 星さん asserted 「辰's sleeve is frayed」 — a visible condition the
package never gave her. In this run the same instinct came out as an offer
instead:

> 袖のほつれでも何でもね、わたし縫いますから。若い頃に仕立てを習いましたのよ。

A conditional grounded in her own sheet (「誰的袖口破了，拿來我這裡就好」) rather
than a claim about somebody's clothes. She also stopped inventing a walk from
the park; where the first run opened with 「さっきそこの公園まで歩いてきた」, this
one opened from `self.where` and nothing else.

Two inventions remain, and they are informative because of what they are **not**
about (see below).

### Did the direct exchange still feel natural?

**Yes, and it is the best material either run has produced.** 星さん asked 渡辺
where he eats; he answered in twenty-nine characters; she pushed; he gave a
little more; she asked whether he has family in Tokyo, and he said

> ……いえ。東京には、もう。

Thirteen characters, against a budget of ninety-three. A withdrawn man
deflecting a question he was asked directly. He was offered the floor four times
and answered three, never volunteered, and was never pushed into speech by the
engine — the priority rule got him asked and his own vector decided the rest.

Then 星さん apologised for prying and changed the subject to feeding him. Nobody
scripted that shape.

### Did a third participant get plausible opportunities without interrupting?

**Yes, and the timing is the point.** 辰 was offered `interject` at round seven —
exactly his patience — after a seven-round exchange he had listened to in
silence. He came in at a lull, not into an unanswered question, and he came in
like a seven-year-old does:

> ねえ、おじさん、東京から来たんなら、鉄人の絵、見たことある？おれ、ロボットのやつ
> 全部わかるよ。……おれ辰。二年生。この犬はハナ、うちの犬。

He introduces himself, brings up his robots, and gets his brother's cowardice in
within one breath. That is an interjection, not a turn in a queue.

Across ten offers: five `addressed`, one `overheard`, one `interject`, and no
offer ever displaced somebody who was owed an answer.

### Were the memory episodes intelligible?

**Yes.** Every rendered episode named its subject — 「first_meeting, who: {ref:
seen-2, looks: …}」 — and where a learned label existed it was used. Nothing came
out as an anonymous 「met somebody for the first time」.

### Did the corrected `knows` cause natural recognition without leaking?

**Yes.** 辰's package now carries `youCallThem: "おばあちゃん"`, and he used it —
and only it. He did not acquire a surname, and 渡辺, whose `knows` is empty on
purpose, still saw every person as clothing and never invented a name for one.

---

## What is still wrong

### 1. The guard covers people, not places

辰 asked 渡辺 whether he had eaten 「ここのカレー」. **喫茶ひだまり does not serve
curry** — it serves coffee, tea, matcha and 練り切り. The prompt guard forbids
inventing a visible condition *about somebody*, and says nothing about inventing
the world.

The right fix is not a longer prohibition. It is the missing grounding, and it
belongs to 3F-A: a character sitting in a cafe should be told what the cafe
sells, exactly as they are now told where they are standing. `cafe-menu-1960.md`
already exists and reaches no Brain.

### 2. There is no weather, and a Brain will supply one

星さん's opening line said 「暑いのにネクタイで」. The package has a daypart and
nothing else, so 「hot」 came from nowhere. Small, and the same shape as finding
1: a hole where a person would have knowledge.

### 3. The transcript and the perceived events say the same thing twice

辰's interject package carried six `speech_heard` events and seven `conversation`
lines — the same six utterances, in full, in both places. Every participant in a
conversation pays for its transcript twice.

`recentPerceivedEvents` exists to tell an observer what they noticed;
`conversation` exists to render the floor they are standing on. For somebody ON
that floor the speech half of the first is entirely redundant. Suppressing
`speech_heard` for utterances already in the observer's own transcript would cut
the largest remaining duplication in the package without losing anything a Brain
reads.

### 4. `conversation` still changes shape line by line

Carried over unfixed from the first run's finding 7. `speaker` and each entry of
`to` is sometimes the string `"you"`, sometimes a learned label, sometimes
`{ref, looks}`. Three shapes for the model to unpick, in the longest part of the
package.

### 5. The addressee is offered in the same tick the line is said

Not a defect, and worth writing down because it looks like one. `resolve` opens
the floor and `offer` runs immediately after it in the same pass, so the person
just spoken to gets their package before perception has seen the utterance:
their copy arrives through `conversation` instead of `recentPerceivedEvents`.
Memory is unaffected — it reads the queue with a cursor on the following tick.

---

## Cost

Ten calls, eight utterances: **1.25 Brain calls per line**, in line with the
1.15–1.22 the scripted runs measure. Grounding added roughly 200 characters to a
package that already ran 3,000–5,000. No line was truncated and no answer was
refused, which is the first run of either kind where that is true.
