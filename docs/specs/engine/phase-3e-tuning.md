# Phase 3E — Tuning Record

**Status: measured 2026-08-27, before Phase 3F.**

Every constant in the 3E runtime had been chosen by argument. This note replaces
the argument with measurement, records what the measurement could *not* decide,
and names the two things the measuring found that were bugs rather than knobs.

Binding behaviour is still defined by `phase-3e-conversation.md` and the
implementation/clarification notes; this file only says why the numbers are the
numbers. It closes `phase-3e-implementation-structure.md` §16 item 1.

---

## 1. How it was measured

A harness outside the repository drives the full cast — eleven Brains and ハナ —
through 3,000 ticks (five minutes of world time) of the real engine: real
navgrid, real zones, real anchors, real `character.json` for everybody.

Two things make the harness worth trusting:

- **The scripted brains are not coin flips.** Each character's chance of taking
  an offer is computed from its own `social` vector — `initiative`,
  `conversationDrive`, `socialInhibition`, `responsiveness`, `curiosity`. What is
  measured is the cast as authored, not a uniform crowd.
- **They aim at people.** A brain answers whoever addressed it, and otherwise
  picks a `reply:` or `ask:` target three times in four rather than always
  broadcasting to the room. Without this the addressee-first rule never engages
  and the ranking is never exercised.

People also move: every 120 ticks somebody gets up and walks to another zone.
That is what an afternoon does, and it turned out to matter (§3).

Three seeds (7, 19, 101). Two runs of the same seed are byte-identical.

**What the harness cannot measure.** The scripted brains never *read* the package
they are given. So any knob that changes what a Brain sees rather than how often
it is asked shows up as a pure cost change with no behavioural difference — and
that absence is not evidence. `visibleLimit` and `transcriptWindow` are both such
knobs, and are treated accordingly below.

---

## 2. The measurements

Seed 7 / 19 / 101, 3,000 ticks, final constants:

| | seed 7 | seed 19 | seed 101 |
|---|---|---|---|
| lines spoken | 1,434 | 2,379 | 1,854 |
| ticks with every zone dormant | 55% | 26% | 41% |
| conversations (social spells that produced speech) | 29 | 45 | 41 |
| median conversation | 20 lines | 12 | 17 |
| longest conversation | 674 | 1,225 | 598 |
| characters who ever spoke | 11 of 11 | 10 | 11 |
| share taken by the three loudest | 77% | 61% | 51% |
| quietest voice | 6 lines | 58 | 38 |
| Brain calls per line spoken | 1.15 | 1.17 | 1.22 |
| overheard nudges spent | 6 | 14 | 16 |
| contexts held at once, max | 4 | 4 | 4 |
| encounters recorded for one pair, max | 3 | 4 | 4 |
| `spokenWith` for one pair, max | 2 | 3 | 2 |
| episodes held by one observer, max | 5 | 7 | 9 |

Package handed to a Brain, in characters of JSON — median / p95 / max:

| | median | p95 | max |
|---|---|---|---|
| seed 7 | 2,791 | 3,497 | 4,705 |
| seed 19 | 3,145 | 3,985 | 4,903 |
| seed 101 | 3,137 | 3,982 | 4,979 |

Where those characters go, averaged over ~1,650 offers (seed 7):

| part | bytes | share |
|---|---|---|
| `sensoryState.visible` | 1,461 | 52% |
| `conversation` | 598 | 21% |
| `choices` | 302 | 11% |
| `recentPerceivedEvents` | 283 | 10% |
| `memory` | 87 | 3% |

---

## 3. Two bugs the tuning found

Neither was a constant. Both were found because a number came out absurd.

**A measured run was 99% silent.** `agent_arrived` is the fact for entering the
*scene*; between rooms people walk, and `move_completed` was not in
`SOCIAL_FACTS`. So a dormant table could not be woken by somebody coming over to
sit at it, and once every zone had fallen asleep the world stayed asleep.
Whitelisted; `move_started` deliberately stays out, because a room somebody has
just left does not need waking to be told so. Both directions are now mutation-
covered in `floor-rounds.test.js`.

**Twenty-nine overheard nudges in a sixty-line conversation.** The nudge was
being spent when the offer was *built*, by which point the floor had already been
woken for the nudge and no longer looked dormant, so the suppression key never
took. It is now spent when the floor is actually granted.

Both are committed separately from this note.

---

## 4. What each constant is, and why

### `quietLimit: 1` — the one unambiguous result

How many fully-declined rounds a floor tolerates before going dormant.

| | lines | silence | conversations | median length |
|---|---|---|---|---|
| **1** | 1,434 | 55% | 29 | 20 lines |
| 2 | 5,576 | 0% | 10 | 504 lines |
| 3 | 9,030 | 0% | 6 | 1,963 lines |

At 2 the world never stops talking and a "conversation" is a five-hundred-line
smear with no shape. At 1 there are twenty-nine distinct conversations of about
twenty lines with real silence between them — which is a Sunday afternoon in a
park, and is what the whole offered-floor design is for. **1.**

### `transcriptWindow: 8` — the spec's own lower bound

`phase-3e-conversation.md` says to keep the most recent **8–12 turns**
model-visible. Across 4/6/8/12/16 the harness shows no behavioural difference at
all — as §1 warns, it cannot. What it does show is the price: 300 bytes of
transcript at 4, 598 at 8, 892 at 12, 1,183 at 16.

So the choice is made on the spec, not the sweep: **8**, the bottom of the stated
band, one third cheaper than the 12 it replaces. Should a real Brain visibly lose
the thread, 12 is where to go, and this is the number to revisit first.

### ~~`speechLimit: 240` — unchanged~~ — SUPERSEDED

> Recorded here as "never bound in any run; a line long enough to be truncated
> never occurred." It never bound **for a scripted brain saying `…3`**. It bound
> on the first real turn of a talkative character, twice in three lines, and cut
> her mid-word. See `phase-3e-post-brain-corrections.md` §1: the budget is now
> per character, derived from `talkativeness`, stated in the Brain's own prefix,
> and cut at a sentence boundary.
>
> The lesson generalises past this one constant. §1 of this file warns that a
> knob changing what a Brain *sees* cannot be judged by a brain that does not
> look. This is the mirror: a knob bounding what a Brain *writes* cannot be
> judged by a brain that does not write.

### `queueLimit: 16` — was 40

Perceived events owed to a Brain that has not been asked yet.

Delivered per offer: median 2–3, p95 10–13. Forty never showed up as a busy
moment — it showed up as *four minutes of backlog* handed to somebody nobody had
asked in a while, because a queue that is never drained just fills. It cost a
third of the worst-case package (6,478 → 4,705 characters) and bought nothing:
p95 is identical at 12, 16, 24 and 40.

Sixteen sits above p95 on every seed. The trim protects direct address, so what
falls off the end is the crowd walking past, which is the correct thing to
forget. **16.**

### `heldLimit: 8` — was 16

Not a tuning knob. It is the tripwire for a caller that builds a context and
never settles it. Four was the most ever outstanding — one per open floor —
across every run, so eight is comfortable headroom that still catches a leak
within a few offers rather than a few dozen.

### `visibleLimit: 8` — unchanged, and the sweep is not why

Half the package by weight, so it is the tempting one to cut, and cutting it
would be wrong on this evidence.

The sweep shows identical behaviour at 4, 6 and 8, and a clear change at 3
(1,718 lines instead of 1,434). But §1 applies: the scripted brains do not read
the list, so "no difference at 4" measures cost and nothing else. The list is
also not decoration — it is what carries `seen-N`, so anybody past the cut cannot
be addressed at all.

What the run does establish: at rest a zone holds two or three people, but when
the movement piles the cast into one room the addressable set reached **ten**.
Eight already truncates there. That truncation is acceptable because ranking is
by salience with an in-zone boost, so the two who fall off are the two furthest
away — which is what a crowded room is like. Three is a measured floor. **8,
unchanged, and to be revisited against a real Brain rather than a sweep.**

### `separationTicks: 60`, `episodeLimit: 24` — unchanged

Sixty ticks (six seconds) of being apart before meeting again counts as a new
encounter. Over five minutes of world time the busiest pair recorded four
encounters and three `spokenWith`; the busiest observer held nine episodes
against a limit of twenty-four. Neither limit binds, and the encounter counts
read like an afternoon rather than a counter ticking.

### `hearingRange: 70`, `soundRange: 140` — unchanged

Already derived from the real anchors rather than guessed: counter-to-near-table
is 48 units and audible, counter-to-far-table is 78 and is not. That is a fact
about the room, not a constant to sweep.

---

## 5. What this costs to run

`pacing-and-latency.md` §6b estimated the model-visible package at 840
characters. That was a 3C measurement, taken before conversation, choices and
memory existed. Measured now: **median ~2,900 characters, p95 ~4,000, max
~5,000** — roughly quadrupled.

At 18% CJK by character, ~2,900 characters is about **1,200–1,400 input tokens**
per decision. §6b's conclusion survives the correction: the dynamic suffix went
from about 2% of a decision's input cost to about 8%, while `effort` still moves
the bill several times further. The §6b arithmetic is being corrected for
accuracy, not because the answer changed.

One number §6b did not have: **1.15–1.22 Brain calls per line spoken.** Offering
the floor and being told "no" costs about one call in six. That is the price of
"no is an answer", and it is cheap.

**A finding for 3F, not a constant.** Over half the package is
`sensoryState.visible`, and almost all of that is `appearance` prose — fifty
characters of Chinese per person, resent in full every single time. The entries
for people the observer knows already carry `recognised`, `timesMet` and
`youCallThem`. Describing a familiar face by name instead of by clothing would
cut the largest part of the package roughly in half, and it is also simply more
truthful: you do not re-read a friend's cardigan every time you look up. It is a
change to what a Brain is shown, so it belongs with 3F and a real Brain, not
here.

---

## 6. Still open after this

Unchanged from `phase-3e-implementation-structure.md` §16:

2. **The animal repertoire.** `call_over` / `praise` / `shoo` proves the path;
   what else ハナ can be asked belongs with whoever owns deterministic actors.
3. **Whether a dormant zone should ever re-arm on a long timer.** Still no —
   events only. With `move_completed` whitelisted, ordinary comings and goings
   turn out to be enough to wake a room, which was the case a timer was proposed
   to cover.

Added here:

4. **Every knob that changes what a Brain sees is untuned**, because a scripted
   brain cannot judge it. `transcriptWindow` and `visibleLimit` are both parked
   at defensible values with the sweep recorded, waiting for the first real
   provider run to say whether a character loses the thread or cannot tell two
   strangers apart.
