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

### 1. `speechLimit: 240` cuts a real Brain mid-word — silently

Two of 星さん's three lines were truncated: 271 and 280 characters against a limit
of 240. The world committed 「…脱いでお」 and threw away 「いで、ばあちゃんが
ちゃちゃっと縫っといてあげる」.

`phase-3e-tuning.md` §4 records that `speechLimit` "never bound". It never bound
*for a scripted brain saying `…3`.* It bound on the first real turn of a
talkative character, and it will bind on most of them.

Worse than the number: **the truncation is silent in both directions.** The Brain
is never told its line was cut, and the listener sees a sentence that stops. A
cut at 240 characters is not a shorter sentence, it is a broken one.

### 2. A Brain with no situational grounding invents world state

星さん said she had walked over from the park a moment ago. She said 辰's sleeve
was frayed. **The package contains neither fact, and no fact in the world
supports either.** They are now committed speech, in the fact stream, replayable.

The package carries `tick: 4` and everyone else's location — and says nothing
about **where the observer is, what they are doing, or what time of day it is.**
A model asked to speak as a person will supply what a person would know. The
invention is not the model misbehaving; it is the package leaving a hole exactly
where grounding should be.

### 3. One act per turn is not how people talk

辰 wrote 「ハナも連れてっていい？ハナ、おいで、ほらちゃんと来るでしょ。」 inside a
`reply:seen-1`. He answered his grandmother and called the dog in one breath,
which is what a seven-year-old does — and because the act was `reply` and not
`call_over`, **ハナ was never called.** The engine saw one act; the sentence
contains two.

The act vocabulary belongs to 3F-A. This is the first evidence about what it
needs to be.

### 4. The addressee-first rule never yields the floor

Seven offers; five went to whoever had just been addressed. Each utterance
re-arms the floor, each new round clears `asked`, and the addressee ranks first
again — so an A↔B exchange restarts the round forever. **渡辺, sitting at the
same table, was never offered the floor once in six rounds.**

This is the ranking working as written, and it may be right: two people talking
to each other do not hand a third a turn. But it is worth deciding on purpose
rather than discovering later, because it also explains the tuning run's
`top3Share: 0.77`.

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
she had not, he would have had to address his own grandmother as a stranger.
**A data gap, not an engine bug**, and the kind only a real reader surfaces.

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

1. **`speechLimit`.** Raise it, cut at a sentence boundary, or refuse and let the
   Brain retry? Silent mid-word truncation is the one thing it must not stay.
2. **Grounding.** The package needs, at minimum: what time it is, where I am, and
   what I am doing. Without it a Brain invents, and inventions become facts.
3. **The act vocabulary** (3F-A owns this) — whether one utterance may carry a
   second act, e.g. speaking to a person while calling an animal.
4. **Whether the addressee rule should ever yield**, or whether a two-person
   exchange locking out the room is correct.
5. **Episode gists** — an episode a Brain cannot attach to a person is a wasted
   line of package.
6. **`knows` audit** across the whole cast against each `self.md`.

Items 1, 2, 5 and 7 are engine-side and small. Item 6 is character data. Items 3
and 4 are design decisions and belong to the owner.
