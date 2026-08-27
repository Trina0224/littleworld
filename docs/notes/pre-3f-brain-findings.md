# Pre-3F — what the first real Brain run found

**Run:** 2026-08-27, six Brain calls, `src/engine/demo-brain.js`.
**Transcript:** `first-real-brain-run.md`.
**Answers this:** the open item left by `docs/specs/engine/phase-3e-tuning.md` §6.4 —
every knob that changes what a Brain *sees* was untuned, because a scripted brain
cannot judge one.

## How it was run, and why that matters

Five characters at the near table and the counter. Each Brain request went to a
**fresh context** holding only that character's `self.md`, its derived
behavioural guidance, and that one package. No `bible.md`, no other character's
sheet, no world state, and no memory of the previous requests. The operator was
transport only.

That isolation is the whole experiment. A Brain that has read the author's notes
cannot tell us whether the package is sufficient, because it will fill the gaps
from material the engine never gave it — and it will do so invisibly.

The world did not wait for wall-clock time and did not expire a pending offer:
the loop stops at the offer and resumes when the answer lands. The owner latency
correction, taken literally, and it worked without incident.

---

## What worked

**The characters are recognisably themselves.** 星のおばあちゃん arrives talking,
asks after the absent brother, offers food, and notices a frayed sleeve. 辰
answers at length, brings up his brother's cowardice unprompted, and asks for
sweets. Neither reads as an assistant being polite. The `social` vector plus
`self.md` is enough; no extra steering was needed.

**"No" came back as a real answer.** 澄子 was nudged as an overhearer at the
counter, and declined. Her only legal act was `call_across` — shouting across the
room at a grandmother talking to a child — and she chose not to. That is exactly
the behaviour the offered-floor design exists to permit, arrived at by judgement
rather than by a scripted `nothing`.

**The privacy boundary held.** Nobody used a name they had not been given. 澄子
knew `星さん` and `辰ちゃん` and rendered the unrecognised man as clothing, not a
name. The transcript renderer's ordered fallback did its job.

**The overheard package is right.** 澄子 received the overheard line through
`recentPerceivedEvents`, not through `conversation` — she heard it, it is not her
conversation. 3E-6 behaves as specified against a real reader.

---

## What broke

### 1. `speechLimit: 240` cuts a real Brain mid-word — silently — FIXED

Two of 星さん's three lines were truncated: 271 and 280 characters against a limit
of 240. The world committed 「…脱いでお」 and threw away 「いで、ばあちゃんが
ちゃちゃっと縫っといてあげる」.

`phase-3e-tuning.md` §4 records that `speechLimit` "never bound". It never bound
*for a scripted brain saying `…3`.* It bound on the first real turn of a
talkative character, and it will bind on most of them.

Worse than the number: **the truncation is silent in both directions.** The Brain
is never told its line was cut, and the listener sees a sentence that stops. A
cut at 240 characters is not a shorter sentence, it is a broken one.

**Fixed.** The budget now comes from `talkativeness` — 93 for 渡辺, 240 for 澄子,
408 for 星さん — so it stops being a rule and becomes the difference between
somebody who runs on and somebody who says one sentence. 0.5 lands on 240, which
is what the old flat number really was: the average person's budget applied to
the whole cast. It is stated in the Brain's own prefix and still enforced, an
over-budget line is cut at the end of a sentence, and the trim reaches audit.

### 2. A Brain with no situational grounding invents world state

星さん said she had walked over from the park a moment ago. She said 辰's sleeve
was frayed. **The package contains neither fact, and no fact in the world
supports either.** They are now committed speech, in the fact stream, replayable.

The package carries `tick: 4` and everyone else's location — and says nothing
about **where the observer is, what they are doing, or what time of day it is.**
A model asked to speak as a person will supply what a person would know. The
invention is not the model misbehaving; it is the package leaving a hole exactly
where grounding should be.

### 3. One act per turn is not how people talk — FIXED

辰 wrote 「ハナも連れてっていい？ハナ、おいで、ほらちゃんと来るでしょ。」 inside a
`reply:seen-1`. He answered 星さん and called the dog in one breath,
which is what a seven-year-old does — and because the act was `reply` and not
`call_over`, **ハナ was never called.** The engine saw one act; the sentence
contains two.

**Fixed.** One utterance may now carry two acts. `speech_said.to` is the list of
everybody the line is aimed at, so perception, the addressee ranking and the
transcript all read one shape. The constraint that could not be relaxed is
volume: an utterance has one scope, so a quiet remark cannot be welded to a call
across the room — either choice would change who heard the other half. Also
refused: two acts at the same person, two questions in one breath (the floor
holds one), and saying nothing as half an act.

On the very first request of the next run, 星さん used it unprompted — greeting a
man she does not know and calling ハナ in the same breath. The dog ignored her,
because familiarity is authored and only 辰's is 1.

The *cafe* acts (`order`, `ask_shopkeeper:…`) still belong to 3F-A. What changed
is the shape one utterance may have.

### 4. The addressee-first rule never yields the floor — FIXED

Seven offers; five went to whoever had just been addressed. Each utterance
re-arms the floor, each new round clears `asked`, and the addressee ranks first
again — so an A↔B exchange restarts the round forever. **渡辺, sitting at the
same table, was never offered the floor once in six rounds.**

This is the ranking working as written, and it may be right: two people talking
to each other do not hand a third a turn. But it is worth deciding on purpose
rather than discovering later, because it also explains the tuning run's
`top3Share: 0.77`.

**Fixed, with waiting rather than a rule.** Rank is now class plus personality
rather than class alone, and `socialWeight` gains a term for rounds spent in this
conversation without once being *offered*. How fast it grows is the character's
own eagerness, so 星さん cuts in after a few exchanges, 澄子 after many, and 渡辺
not at all — his silence stays his rather than the infrastructure's. Measured
over five 3000-tick runs: top3 0.57 against 0.62, and nobody in the cast goes
unasked on any seed. Bigger is not better — past 840 per round the room gets
*less* fair, because the term scales with eagerness and so amplifies whoever was
already talking.

### 5. `memory` says a person met somebody, but not whom

Every package rendered episodes as `{"kind":"first_meeting","gist":"met for the
first time"}` — twice over, identically, with nothing naming the person. To a
Brain that is "I met someone for the first time, twice", which is worse than
saying nothing.

### 6. `knows` is missing an edge the character's own prose depends on

`brother-01` has no `knows` entry for `grandma-01`, so his package said
`recognised: true` with no `youCallThem`, and the contract told him he did not
know her name. His `self.md` is built around 「おばあちゃん一直給我東西吃」.

He papered over it — she had called herself ばあちゃん in the line he was
answering, which is a legitimate way to learn a name (3D §4.2). In a run where
she had not, he would have had to address the neighbourhood grandmother who
feeds him as somebody whose name he does not know.

**Not kinship.** 辰 is not her grandson — her granddaughter is `woman-01`, and
her own prose has the two boys as 「奧山家那兩個小男孩」. 「おばあちゃん」 is what
any child on that street calls her. The gap is smaller than it first looked and
it is still a gap: he plainly knows her, and the engine does not know that he
does. **Character data, not an engine bug**, and the kind only a real reader
surfaces.

### 7. `conversation` changes shape line by line

`speaker` and `to` are sometimes the string `"you"`, sometimes a known label, and
sometimes `{ref, looks}`. Three shapes in one array for the model to unpick.

### 8. The harness logged what the Brain said, not what the world took

Found by running it: `demo-brain.js` printed `answer.text`, so the truncation in
finding 1 was invisible in the transcript and only showed up in the *next*
character's package. Fixed — it now prints what was committed and says so when
the rest was dropped.

---

## What it costs

The full prompt — stable prefix plus package — ran **3,348 → 4,921 characters**
across six turns, growing as the transcript filled. The prefix is about 2,400 of
that and is identical every time, so it caches; the package is the part that is
paid for at full rate, which is what `pacing-and-latency.md` §6b says.

Six calls produced five spoken lines: **1.2 calls per line**, matching the
1.15–1.22 the scripted tuning run measured. The one decline was 澄子's, and it
was the right answer.

---

## What to decide before 3F-A

1. ~~**`speechLimit`.**~~ **DONE** — per character, from `talkativeness`, cut at
   a sentence boundary, and audited.
2. **Grounding.** *Still open, and now the biggest one left.* The package needs, at minimum: what time it is, where I am, and
   what I am doing. Without it a Brain invents, and inventions become facts.
3. ~~**The act vocabulary**~~ **DONE for the shape** — two acts per breath, one
   volume. What a cafe order looks like is still 3F-A.
4. ~~**Whether the addressee rule should ever yield**~~ **DONE** — it yields to
   waiting, at a rate the character sets.
5. **Episode gists** — an episode a Brain cannot attach to a person is a wasted
   line of package.
6. **`knows` audit** across the whole cast against each `self.md`.

Items 1, 3 and 4 are done. Items 2, 5 and 7 are engine-side and still open —
grounding is the one that matters, because a Brain with a hole where the
situation should be fills it with invented world state that then commits as
fact. Item 6 is character data.
