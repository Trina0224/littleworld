# Pacing, Latency, and Three Open Items

**Status:** two decisions settled, one proposal awaiting the owner
**Created:** 2026-08-25
**Companion to:** `phase-3c-perception.md`, `phase-3c-venue-interactions.md`, `world-engine-2.5.md` §4, §8.3, §16.1

Nothing here is implemented. This is a record of a discussion so the reasoning is
not lost while the owner thinks about the last part.

Three questions had been left open since the Phase 3C review. Two are now
decided. The third turned out to rest on something the analysis had missed, and
the owner's answer to it is a proposal rather than a setting.

---

## 1. Known-person salience — DECIDED: keep the hook, let 3D fill it

**The question.** When perception ranks what to send to a Brain, should someone
the observer already knows rank higher?

`phase-3c-perception.md` §11 says not to use a known-person boost *if determining
"known" would require reading the observer's private prose*, and adds that a
later memory interface may supply an explicit non-prose attention hint.

**What was noticed.** That hint already exists. `knows` in `character.json` is a
structured field, not prose, so the condition never bites. But implementing
against it directly has a cost that only shows up later.

| option | |
|---|---|
| **A** leave it out entirely | Cleanest boundary, zero risk. But ユキ walks in and ranks the same as a stranger in her own grandmother's package — and the grandmother's whole character is that she knows everyone. Ordering matters because refs are numbered by rank, so `seen-1` should be the person you would actually look at first. |
| **B** perception reads the observer's `knows` | Correct today, small, and affects only ordering and inclusion — never content. But it **duplicates what 3D memory will do**: after 3D, "known" means "I have a person model", which includes people met at runtime. Two sources, two answers, and drift. |
| **C** ✅ `attentionHint` stays the only door | Perception never reads a relationship; it accepts an opaque number. A trivial provider reading `knows` gives B's behaviour today, and 3D swaps that provider for memory — same door, better answer, one source. |

**Decision: C.** It is B's behaviour with A's boundary, and the only one that does
not create a second source of truth when 3D lands. The hook is already in
`perception.js`.

**Binding constraint:** the hint returns **a number, not a name**. If it ever
returned "you know them as 森牧師", perception would be performing recognition,
which is precisely what §5 forbids.

---

## 2. Broadcast scope — DECIDED: derived from the act, not declared by the model

**The question.** Does an Agent Brain declare `scope: broadcast` on an utterance,
or does the engine derive how far a voice carries from the structured action?

| option | |
|---|---|
| **A** the model declares it (spec as written) | Simplest, and the model has the most context. But it is **a rule aimed at a model** — "should not default to broadcast" — and this project has twice concluded rules do not hold there. In a 640×360 scene broadcast always works, so a model will find it. |
| **B** ✅ the engine derives it from the act | *LLM chooses social destination; World Engine chooses physical placement* already governs movement; this is the same rule applied to sound. The model has no knob to abuse. Needs the act vocabulary, which is 3F-A. |
| **C** the model asks, the engine may refuse | Implementable today, keeps flexibility. But silent downgrade **lies to the agent** — it believes it shouted and did not — and this project has been careful that agents get honest feedback, which is what `own_action_failed` is for. |

**Decision: B**, deferred to 3F-A because it needs the action vocabulary.

The failure mode A invites is worth stating plainly, because it is not "the model
is impolite": once anything broadcasts by default, everyone hears everything, and
**the entire distance model built and tested in 3C silently stops mattering**.

**The owner's framing, which is the mechanism:** the model must be taught that
carrying voice is for ordering or for a specific reason, and that otherwise one
does not raise one's voice. That teaching is not a sentence in a prompt — **it is
the act vocabulary itself.** The model receives a menu of acts, and only some of
them carry:

```text
greet, ask, reply, chat        local
order, call_across_park        carries
raise_voice                    carries, and is deliberate and visible
```

There is no `scope` field for a model to set, so there is no instruction for it
to forget.

**Cheap thing available now, before 3F-A.** `world.say()` currently takes `scope`
as a free parameter. Changing it to take a named act, with the engine mapping act
to scope, locks the boundary today and leaves 3F-A only the job of adding acts.
Not yet done.

---

## 3. `ticksPerDay` — the analysis was wrong, and the fix may not be a number

### 3.1 What the first analysis said

Arithmetic at `tickDurationMs = 100`, so 1 second = 10 ticks: a coffee is 120
ticks, a ten-minute visitor sees 6000 ticks, 熊田 attends `every: 6` and 小野
`every: 3`. That gave `ticksPerDay ≈ 1000`, so that a visitor would see about six
days and meet the intermittent characters at least once.

### 3.2 What it missed

**LLM latency is the one quantity in this world that no config knob can
compress.** Service time, menu prep, movement speed, seasons — all are numbers we
choose. Inference is real seconds.

| one LLM round trip | seconds | ticks |
|---|---:|---:|
| optimistic — cached prefix, short output, no queue | 3 | **30** |
| realistic — a large model | 8–15 | **80–150** |
| congested — several agents thinking at once | 20–40 | **200–400** |

A minimal social exchange — greet, reply, respond — is three round trips:

```text
optimistic     90 ticks
realistic     300-450 ticks
congested     600-1200 ticks
```

So **a character needs to be present for roughly 500 ticks to complete one
exchange, and 1500 or more for anything that reads as a conversation.**

At `ticksPerDay = 1000`, 熊田 arrives, sits down, speaks — and goes home before
anyone has finished answering him.

### 3.3 The actual finding

The day counter is doing two jobs whose requirements point in opposite
directions:

| | wants |
|---|---|
| rotating the cast, so a visitor sees everyone | **short** |
| one visit lasting long enough to finish a conversation | **long** |

And the first analysis had the dependency backwards. The shop does *not* need a
long day, because `service_time_scale` is a knob. **Latency is the only real
floor, so the day length should be derived from it and everything else adjusted
around that.**

### 3.4 Options considered

| option | |
|---|---|
| **A** short day (~1000) | Cast rotates fast. But under realistic latency a visiting character leaves before anyone answers. **Rejected.** |
| **B** longer day (~3000) plus shorter `every` cycles | 300 seconds of presence is ten or more round trips even when congested. Two numbers, no new machinery. But "不常來" becomes "every other day", and it tunes against a *guessed* viewing duration. |
| **C** decouple presence from the day | Day stays long for the shop; presence gets its own period. Both work at their own scale — and the fiction survives untouched, because **a viewer cannot see days at all**: the art has no day/night, no clock, no calendar. "Every few days" is carried by the character files, not by the engine's counter. More machinery, and `every` changes meaning. |

The interim recommendation was B, on the grounds that **the number should come
from a measurement rather than from arithmetic** — 3F's Mock Brain can be given
an artificial delay of 5s / 15s / 30s, and whether 熊田 can finish a sentence is
then observed rather than predicted.

---

## 4. The owner's proposal: let a human change the day — NOT YET DECIDED

> *"設定一個按鈕給人類，人類覺得無聊了就按下去換日子？因為設定時間了可能看不到精彩對話。"*

### 4.1 Why it is better than tuning

It removes the guess. Every calculation above was predicting two unknowable
things — how long a viewer watches, and how long a good conversation takes. **A
button lets the viewer answer both with their finger.**

The consequence that matters:

> **`ticksPerDay` stops being a target and becomes a ceiling.**

Attended, a human paces it. Unattended, it still rotates. And a ceiling is easy
to choose — pick something generous, because the "I am bored" case has been taken
over by the button. **Question 3 largely dissolves.**

There is also event-design value that has nothing to do with the engine: at a
church event, people standing around a screen with something to press are
participants rather than an audience.

### 4.2 What it does not solve

It hides latency; it does not fix it. **If the silence while an agent thinks is
itself the boring part, a viewer will press during that silence and never see a
conversation finish.**

The antidote is not the button. It is that the scene must be visibly busy while
brains are thinking — which is exactly what the deterministic layer is for:
walking, sitting, the dog, and 澄子 shaping a nerikiri by hand.

> That setting was given for character reasons. It turns out to be the answer to
> a scheduling problem as well: while she is making a sweet the picture is alive
> and she costs nothing.

### 4.3 Consequence — the determinism invariant has to be restated

The engine's guarantee is currently `same seed = same stream`. A human pressing a
button at an arbitrary wall-clock moment is **non-deterministic input**.

The repair is standard and the machinery already exists: **the press is a fact,
recorded with the tick it happened on.** Replay is playback, so it reproduces
exactly. But the guarantee must be written as:

```text
same seed  +  same inputs  =  same stream
```

This is not a weakening. It is the correct statement for any interactive system,
and the current wording was only sufficient because nothing was interactive yet.

Work this implies, if the proposal is accepted:

- `run-3a.js`'s "same seed produced a different fact stream" assertion needs the
  input log included;
- a new assertion: a recorded press changes the day **on the same tick** in
  replay as it did live.

### 4.4 Consequence — `depart()` is instantaneous

Characters currently vanish. Nobody has noticed because **the browser page does
not use the engine at all**, so nothing renders it.

With a human-triggered day change on a page that *does* render, ten people
evaporating at once reads as a bug. The button should mean *closing time*, not
*clear the room*: leaving should be a walk. Recorded as work; not urgent until
the page is wired up.

### 4.5 Three shapes for the button

| | |
|---|---|
| **A. next day** — end today, everyone leaves, new cast | Fits what is already built; `beginDay()` exists. Bluntest: it also ends whatever conversation was in progress. |
| **B. someone new arrives** — bring in one rostered absentee without clearing | **Interrupts nobody.** What a viewer usually wants is *something new*, not *start over*. But the scene only ever fills up, and it bypasses the attendance model. |
| **C. fast-forward** — run at 10× | **Should be rejected.** Fast-forward accelerates only the deterministic layer; brains still think in real seconds, so bodies run ahead of minds and the world starts saying things from a minute ago. |

Suggested: **A and B as two buttons**, because they cure different kinds of
boredom — *I have seen enough of this* and *give me something to happen*. Both are
cheap.

### 4.6 The cost question the button forces

**One shared world, or one world per viewer?**

Per viewer multiplies LLM cost by the number of viewers, and the owner's account
is already hitting quota limits. One shared world with one operator — or a
passed-around control — is close to the only affordable shape.

This also settles part of §16.1 deployment: LIVE needs an engine process holding
the credential, and **that process is the shared world.**

---

## 5. The adjacent problem, recorded now because it is the same problem

**The scheduler needs a budget, not a queue.**

Twelve characters all thinking at once queue behind each other even at 5-second
latency, and the account is already constrained. The architecture already has the
answer:

> An agent that is walking, sitting, working or waiting continues doing so while
> its sensory state changes. No model call is required merely because another
> character moved a little closer.

Which means **the wakeup policy is the cost control.** What 3F must decide is not
only *who should think* but *how many calls this minute can afford, and who gets
them.*

---

## 6. State of the three

| | decision | still to do |
|---|---|---|
| known-person salience | **C** — `attentionHint` is the only door; 3D fills it | wire a `knows`-reading provider (~10 lines); swap for memory in 3D |
| broadcast scope | **B** — derived from the act; the act vocabulary *is* the teaching | change `world.say()` to take an act now; acts arrive in 3F-A |
| pacing | **open** — the button proposal is with the owner | if accepted: two buttons, restate the invariant, record presses as facts, make departure a walk |

Nothing in this document has been implemented.
