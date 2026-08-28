# LittleWorld — Simulation and Replay Architecture

**Phase labels superseded by `phase-3f.md`** (2026-08-28): what this file calls `3F-A` and `3F-B` are one implemented Phase 3F. Ownership statements below are still accurate; only the phase names changed, and nothing after 3E is 'next' any more.

**Status:** binding project architecture decision  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Supersedes for pacing/presentation:** the earlier assumption that LIVE simulation is the primary audience-facing experience in `world-engine-2.5.md` §8/§16 and the unresolved day-length discussion in `pacing-and-latency.md`.

LittleWorld is now explicitly two cooperating systems rather than one live demo that must satisfy both simulation correctness and audience pacing.

> **Simulation generates a world history. Replay presents that history to people.**

The two systems share a fact-stream contract but optimize for different things.

---

## 1. Part A — Simulation / World Generation

Simulation is the primary autonomous-world system. It may run slowly, unattended, or for a long real-world time. LLM provider latency is acceptable here and must not be hidden by corrupting simulation semantics.

Simulation owns:

```text
World Engine
Activity Runtime
Perception
Private Memory
Conversation Sessions
LLM Scheduler / Agent Brains
Cafe / venue runtime
attendance and presence
human director inputs
committed fact stream
private audit stream
```

Its design goal is:

> **causal correctness, autonomous behaviour, private minds, and a trustworthy recording.**

Simulation does **not** have to be entertaining every wall-clock second.

### 1.1 LLM latency belongs to generation, not presentation

An LLM may take seconds or tens of seconds to answer. The world still ticks and the character remains in its current deterministic activity or fallback. No simulation rule should be distorted merely to make live waiting pleasant to watch.

Pure provider wait is an implementation delay, not meaningful fictional time that an audience must later sit through.

### 1.2 Day length is a simulation control, not a presentation duration

There is no requirement that one simulation day fit a short demo window.

A reasonable initial unattended configuration may be approximately:

```text
1 real hour ~= 1 simulation day
```

but this is configuration, not a project invariant.

The human director may request an earlier day transition. A long automatic ceiling may remain for unattended runs.

Consequently, `ticksPerDay` is not chosen to make the audience see every character quickly. It exists only to advance simulation-day semantics when automatic rollover is desired.

### 1.3 Human Director

The simulation may accept explicit external direction without turning characters into player avatars.

Examples:

```text
request next day
allow / force selected rostered characters to arrive
introduce an automatic/deterministic actor
change permitted simulation configuration
start / stop recording
```

The human directs the **world conditions**, not an individual LLM character's thoughts or dialogue.

All director actions that can affect the resulting history must be recorded as external inputs/facts with the simulation tick at which they occurred.

The determinism statement is therefore:

> **same seed + same recorded external inputs = same deterministic simulation behaviour**

Provider outputs themselves remain recorded results rather than assumed reproducible.

### 1.4 Day transition may later become graceful

The current engine may change presence immediately at a day boundary. Once the simulation renderer displays those transitions, a human-requested next day should eventually mean a closing transition rather than ten characters visibly evaporating.

A later implementation may do:

```text
day transition requested
  -> stop opening new long interactions
  -> allow or bound current interactions
  -> agents leave / are withdrawn through legal world actions
  -> advance day
  -> settle attendance
  -> new arrivals enter
```

This is a presentation-quality refinement of Simulation and is not a prerequisite for Phase 3D memory.

---

## 2. The boundary — Recording

The committed fact stream is the contract between Simulation and Replay.

Simulation records **what actually happened**, not merely what an Agent Brain proposed.

Examples:

```text
speech_said
move_started / move_completed
resource_reserved / occupied / released
agent_arrived / agent_departed
activity transitions
venue-service facts
human director inputs that alter world history
```

Plans, prompts, private memories, private reasoning and rejected proposals remain outside the audience replay stream. They may exist in the audit/debug layer.

Replay is playback of committed history, **never re-simulation and never another LLM run**.

The recording must preserve causal ordering and enough timing/transition information to reconstruct meaningful visible behaviour.

---

## 3. Part B — Replay / Presentation

Replay is the preferred audience-facing path for demonstrations.

It consumes a completed or selected recording and constructs a presentation timeline without calling any LLM.

Its design goal is:

> **human comprehension, pacing, readability, and visual continuity.**

Replay may:

```text
remove or heavily compress provider-latency gaps
compress long periods with no meaningful visible event
preserve readable speech-bubble/subtitle duration
preserve causal ordering
preserve enough movement duration to avoid teleportation
speed up repetitive deterministic service work
add camera / focus / subtitle presentation policy
select an interesting span from a longer simulation run
```

Replay must not:

```text
change who said what
change the order of causally dependent facts
invent world facts that did not happen
rerun Agent Brains to improve a recording
reinterpret rejected proposals as events
```

### 3.0 The script pass, and the one thing it may not do

The owner's intent is that a completed recording may be handed **whole** to an
LLM, which re-times it, inserts readable intervals, and gives each character a
reply rhythm and tone drawn from who they are. That produces a better result than
any rule the simulation could follow, because pacing is a judgement about the
whole scene rather than about one tick.

It also makes the recorded gaps disposable rather than something to annotate: if
the script pass assigns all dialogue timing, the original wait carries no
information beyond **order**. Only inference silence is disposable — deterministic
durations (a walk, a steeping tea, a nerikiri being shaped) are world facts and
stay.

The script pass is offline and is **not the renderer**, so unlike the renderer it
may read the audit stream. That is how interiority reaches an audience — a
subtitle drawn from what a character actually recorded — without the renderer's
fact-only rule being touched.

The constraint, agreed with the owner:

```text
may   re-time, insert intervals, set per-character rhythm and tone
may   add presentation-only material: subtitles, camera, interiority from audit
may   select a span, drop a dull stretch
must not   change an utterance's words
must not   change who said it
must not   change causal order
must not   invent an event
```

**This is checkable, and should be checked rather than instructed.** A model given
a whole transcript will improve the dialogue if allowed to, and it will do it
well, which is exactly the danger — the output looks better and is no longer what
the agents said. The assertion is cheap:

> the script's dialogue lines are a subsequence of the recording's, unchanged.

Same discipline as the rest of this project: block it with a check, not a rule.

Detailed design is deferred until there is a recording worth scripting.

### 3.1 Replay preserves causality, not provider latency

This is the central presentation rule.

Example generation history:

```text
A speaks
provider waits 8.4 real seconds
B replies
```

An audience replay may show:

```text
A speaks
short readable pause
B replies
```

The 8.4-second provider delay is not sacred presentation time.

If useful visible deterministic activity occurred during the gap — a character walked, the dog moved, the shopkeeper worked — Replay may retain that activity while compressing only the dead wait.

### 3.2 Replay owns a presentation timeline

Simulation ticks remain the source ordering/time metadata. Replay may map them onto a separate presentation clock.

Therefore:

```text
simulation time != presentation time
```

The mapping may be piecewise rather than one global speed multiplier.

Examples:

```text
conversation text        enough time to read
walking                   visibly continuous
pure inference silence    aggressively compressed
long idle stretch         skipped or accelerated
interesting overlap       retained
```

This policy belongs only to Replay. Simulation must never add artificial behaviour solely because a replay editor would like a shorter pause.

---

## 4. Renderer relationship

The renderer may still share low-level fact-to-visual-state code between live inspection and replay, but the two products are no longer required to have identical wall-clock pacing.

```text
Simulation facts --------------------+
                                     |
                                     +--> recording
                                             |
                                             v
                                  Replay Timeline Builder
                                             |
                                             v
                                      Presentation Renderer
```

A live/debug renderer may also observe Simulation directly, but it is an engineering/authoring view, not the preferred demonstration path.

Static GitHub Pages can host Replay without credentials. Simulation with real Agent Brains requires an engine process holding provider credentials.

---

## 5. Consequences for current phases

This architectural split **does not change the Simulation phase order**:

```text
3C   perception                    complete
3D   private memory                next
3E   conversation + speech
3F   unified world runtime         DONE, phase-3f.md
3G   real provider integration
```

The Replay / Presentation system is a parallel project block consuming the fact-stream contract. It does not need to block 3D/3E unless a change would make recordings insufficient for later presentation.

When adding a new Simulation feature, ask:

> **Does the fact stream contain enough information for Replay to show what happened later without rerunning the simulation?**

If yes, presentation can remain deferred.

---

## 6. What this decision removes from the critical path

The following are no longer reasons to distort or block the Simulation architecture:

```text
"LLM replies take too long for an audience"
"one day must fit in a five-minute demo"
"every deterministic cafe action needs a detailed animation now"
"live provider congestion must still look exciting every second"
```

A simulation may run for an hour or longer to generate useful history. The presentation system can later turn a selected part of that history into a compact replay.

The project therefore has two independent quality bars:

> **Simulation must be believable and causally correct.**
>
> **Replay must be understandable and enjoyable to watch.**
