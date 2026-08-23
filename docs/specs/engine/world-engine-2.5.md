# LittleWorld World Engine 2.5 — Architecture Draft

**Status:** design draft, reviewed with Claude  
**Created:** 2026-08-22 23:38 PT (`America/Los_Angeles`)  
**Review incorporated:** 2026-08-23 00:55 PT (`America/Los_Angeles`)  
**Second review incorporated:** 2026-08-23 02:10 PT (`America/Los_Angeles`) — cold start, prefix schema scope, replay determinism, deployment modes

## 1. Core principles

LittleWorld uses a hybrid design:

> **The LLM decides what a character wants to do and why. The engine decides how that intention can legally and coherently happen in the world.**

Phaser renders. The World Engine owns authoritative state. Each character has a private LLM session. The Perception Engine decides what each character can know. The Activity Runtime turns intentions into legal multi-step actions. Conversation Sessions preserve long-running dialogue without merging private minds.

Three invariants are non-negotiable:

```text
WORLD TRUTH != AGENT KNOWLEDGE
LLM OUTPUT = PROPOSAL, NOT WORLD TRUTH
WORLD TIME NEVER WAITS FOR AN LLM
```

The third invariant is operationally critical: an LLM request may be slow, fail, time out, or be dropped without freezing the simulation.

## 2. Runtime architecture

```text
                         +-----------------------+
                         |      WORLD CLOCK      |
                         | never waits for LLMs  |
                         +-----------+-----------+
                                     |
                         +-----------v-----------+
                         |      WORLD ENGINE     |
                         | authoritative state   |
                         +-----+-----------+-----+
                               |           |
                         events|           |activity state
                               |           |
                    +----------v--+   +----v-------------+
                    | PERCEPTION  |   | ACTIVITY RUNTIME |
                    | + MEMORY    |   | deterministic    |
                    +------+------+   +----+-------------+
                           |               |
                     agent context         |
                           |               |
                    +------v---------------v--+
                    |      LLM SCHEDULER      |
                    | budget / priority /     |
                    | concurrency / timeout   |
                    +-----------+-------------+
                                |
                         +------v------+
                         | AGENT BRAIN |
                         | LLM adapter |
                         +------+------+
                                |
                           proposal only
                                |
                         +------v------+
                         | validation  |
                         +-------------+

Every visible mutation -> EVENT STORE -> live renderer and replay
```

The architecture has six logical server-side responsibilities:

1. **World Engine** — authoritative shared state and clock.
2. **Activity Runtime** — deterministic execution, reservations, progression and fallback.
3. **Perception + Memory** — subjective knowledge for each agent.
4. **LLM Scheduler** — bounded asynchronous access to model providers.
5. **Agent Brain** — intention, language and meaningful choices.
6. **Event Store** — audit, debugging, persistence and replay.

Phaser remains outside these responsibilities as a renderer.

## 3. Private Agent Sessions

Where the content of a private session comes from — the bible, the self sheet,
the appearance line, and seeded recognition — is specified separately in
`character-identity.md` (Phase 3B).

Every character has an independent LLM context. An agent must never receive another agent's private prompt, personality, memories, hidden goals, internal plan, or private reasoning state.

A server-built request should contain logically separate stable and dynamic sections.

### 3.1 Stable prefix

Keep stable content byte-for-byte stable where practical so provider adapters may exploit prompt caching:

```text
[IDENTITY — immutable]
[PERSONALITY — stable]
[STABLE WORLD / ROLE KNOWLEDGE]
[ACTIVITY AND TOOL SCHEMAS]
```

Do not put timestamps, changing state, observations, retrieved memories, or other volatile content into this prefix.

`[ACTIVITY AND TOOL SCHEMAS]` is the **complete** schema set, identical for every
agent and every situation. Do not filter it down to what is currently legal — that
is a per-decision fact and belongs in `[CURRENTLY LEGAL ACTIVITIES / TARGETS]` in
the dynamic suffix. A situation-filtered schema differs on every call and destroys
the stable prefix it is sitting in.

The World Engine specification does not mandate any provider-specific cache threshold or metric. Provider adapters may use their own caching semantics and telemetry.

### 3.2 Dynamic suffix

```text
[CURRENT STATE]
[CURRENT INTENTION / ACTIVITY]
[CURRENTLY LEGAL ACTIVITIES / TARGETS]
[RELEVANT PRIVATE MEMORY]
[CURRENT OBSERVATIONS]
[CURRENT CONVERSATION CONTEXT]
[DECISION INSTRUCTION]
```

Identity is server-owned. Model output cannot rewrite identity or world truth.

Do not implement an agent as one ever-growing lifetime chat transcript. Rebuild dynamic context at meaningful decision points from authoritative state, retrieved memory, perception, and active sessions.

## 4. World Engine and non-blocking world clock

The World Engine is the only authority allowed to mutate shared state.

It owns at least:

```text
World
  time
  agents
  pets / deterministic actors
  positions and semantic zones
  seat/station runtime occupancy
  active activities
  active conversations
  world event stream
```

### 4.0 World time is an integer tick — decided

The world clock counts ticks, and a tick is an integer. `tick = 1842` is the
time. Seconds exist only where a human or a renderer needs them, as
`tick * tickDurationMs`, and never inside simulation logic.

Elapsed floating-point seconds would work on the first day and rot afterwards:
accumulated rounding and timer jitter make two runs of the same scenario diverge
for reasons that have nothing to do with the simulation, and every such
divergence has to be chased before a real one can be seen. An integer tick has
no such failure mode.

Durations are therefore expressed in ticks, not milliseconds — a move that takes
40 ticks, a turn deadline of 60 ticks.

### 4.1 World tick never waits for inference

Every agent must always have a deterministic current runtime activity or fallback state. Requesting a new LLM decision does not replace that state with `waiting_for_llm`.

Example:

```text
Agent is sitting on bench
        |
        +-- Brain request returns -> validated new activity may replace sitting
        |
        +-- Brain request is slow -> agent keeps sitting
        |
        +-- timeout/failure       -> deterministic fallback continues
```

No network call, provider outage, quota wait, structured-output failure, or model latency may block simulation time.

Therefore **timeout and fallback support are required runtime infrastructure**, not an open design question. Exact fallback behavior may vary by activity.

The same rule covers cold start. On the first tick, before any inference has ever
run, every agent already holds a deterministic activity. There is no bootstrap
state in which an agent exists but has nothing to do; the world is a working
simulation before the first Brain request is dispatched, and stays one if none
ever succeeds.

Candidate defaults:

```text
planning timeout       continue current activity / idle safely
conversation timeout   remain attentive; session applies turn timeout policy
invalid model output   treat as failed inference; keep safe current state
stale target           invalidate remaining plan and request replan when budget permits
provider unavailable   continue deterministic world behavior
```

## 5. World geometry and canonical anchors

The engine consumes scene semantics; it does not redefine them.

`docs/specs/world/anchors.json` is the **single source of truth** for seat and station identities and geometry. The engine must not maintain a second hand-written list of seats or station coordinates.

At runtime it may attach mutable state to an anchor, for example:

```json
{
  "anchor": "bench-slot-2",
  "state": "reserved",
  "reservedBy": "boy-01"
}
```

Geometry and canonical IDs remain owned by the world spec.

## 6. Perception Engine

Agents never receive the full world database. The engine creates a subjective Observation Package.

For the MVP, perception deliberately avoids ray-cast or pixel-depth line-of-sight simulation.

```text
world truth
  -> semantic zone
  -> distance
  -> hearing range
  -> recognition
  -> salience / attention
  -> observation package
```

### 6.1 Semantic zones

Initial zones should be simple, for example:

```text
cafe-counter
cafe-terrace
park-open
street-edge
backstage
```

Candidate behavior:

```text
same zone       normal visibility / salience
neighbor zone   visible with reduced salience
far zone        normally omitted
```

Exact boundaries and distance thresholds remain to be measured.

### 6.2 Render occlusion is not perception

`occdepth.png` and related painted depth data exist to render sprites correctly. They must not automatically be treated as a visual line-of-sight model. A table hiding part of a sprite should not imply that the person cannot perceive someone across the table.

A richer LOS system may be added only if simple zones and distance prove visibly inadequate.

### 6.3 Recognition

Internal IDs must not reveal names automatically.

A stranger may see:

> A middle-aged man in a dark suit is standing near the cafe.

An acquaintance may see:

> You recognize Daniel near the cafe.

Names and relationships belong to each agent's knowledge and memory.

### 6.4 Attention

Visible does not mean noticed. Observation packages should be bounded and prioritize, roughly:

```text
directly addressed          very high
current activity changed    very high
goal-relevant event         high
very close event            high
known person                medium
sudden change               medium
far-away idle actor         low
```

Exact salience thresholds remain open.

## 7. Memory Engine

Each agent owns a private memory store.

### Working memory

Short-lived context for the current activity or conversation.

### Episodic memory

Subjective recollections of events the agent actually perceived.

### Social / semantic memory

Longer-lived knowledge about people, places, names, familiarity, impressions, and relationships.

Memory should distinguish when useful:

```text
known_fact
heard_claim
personal_impression
inference
```

An LLM may propose memory candidates, but the server decides what is stored. The memory layer should verify that the agent actually perceived the source event, avoid duplicates, preserve source/epistemic type, and eventually support contradiction, consolidation, importance and forgetting.

Exact consolidation and forgetting policy remains open.

## 8. Event Store and replay

The World Engine keeps an objective event stream for simulation, debugging, persistence and replay.

A global event is not global knowledge. After an event, the Perception Engine decides who could perceive it and what each observer learns.

### 8.1 Replay is a first-class design goal

Replay is not merely a debugging side effect. It is required as a demo reliability mechanism.

Every externally visible world mutation must be reproducible from either:

```text
complete event stream
```

or, when logs become large:

```text
snapshot + subsequent event stream
```

The renderer should be able to consume either live world output or replayed output through the same presentation path:

```text
Live World ----+
               +----> Renderer
Replay File ---+
```

Target runtime modes:

```text
LIVE
REPLAY
MOCK / SCRIPTED
```

This permits a known-good run to be replayed during a demonstration if network access, provider availability, credentials or quota fail. It also permits deterministic inspection of failures without requiring the same LLM behavior to occur again.

### 8.2 Facts and intentions are two different logs — decided

The event stream the renderer and replay consume records **committed world
facts**, never wants or proposals. Not:

```text
agent wants to sit at bench-slot-2
```

but the transitions that actually happened:

```text
seat_reserved -> move_started -> move_completed -> seat_occupied
```

Intentions, plans and model proposals are recorded too, in a **separate audit
stream**, for debugging and for answering "why did she do that". Nothing in the
renderer or the replay path may read it.

Keeping them in one stream looks harmless and is not: it leaves replay quietly
undecided between *re-executing commands* and *playing back what happened*. Those
are different systems with different failure modes, and the ambiguity only
surfaces once a command would now produce a different result than it did when it
was recorded.

With facts as the contract, **replay is playback, not re-simulation.** A fact
carries what a viewer needs — where a move went and how long it took, which seat
was taken — so the renderer never re-derives it.

### 8.3 Determinism, and what it is actually for

Because replay plays back facts, replay fidelity does not depend on the
simulation being reproducible. Determinism is still required, for a different
reason: re-running a scenario from the same seed to reproduce a bug, and tests
that assert on a whole run rather than on one step.

The rules are the same either way:

```text
no unseeded randomness
no wall-clock reads inside simulation logic
no iteration over unordered collections where order affects outcome
```

All randomness comes from a seeded generator whose seed is recorded in the event
stream. All time comes from the world clock, never from the host clock. Where a
map or set is iterated and the order can change a result, sort first.

This is cheap to honour from the first line of code and expensive to retrofit. A
run that is only *nearly* deterministic reproduces a bug most of the time, which
is worse than not reproducing it at all.

Events carry a schema version. A stream recorded before a schema change must
either still replay or be refused outright — never replayed as if it matched.

Example event:

```json
{
  "v": 1,
  "t": 482,
  "type": "talk",
  "actor": "boy-01",
  "target": "boy-02",
  "data": {"text": "You aren't scared of that dog, are you?"}
}
```

## 9. Intentions and short plans

Single-step LLM control is not the primary design. Agents should choose a short-term intention and normally a 2–5 step meaningful plan.

Example:

```json
{
  "intention": "convince Kenji to approach the dog with me",
  "activity": "social_explore",
  "target": "boy-02",
  "subject": "dog-01",
  "plan": [
    {"type": "talk", "intent": "tease Kenji about being scared"},
    {"type": "approach", "target": "dog-01"},
    {"type": "observe", "target": "boy-02"}
  ],
  "commitment": "medium"
}
```

LLMs choose motive, target and meaningful choices. They do not manage pixel coordinates, exact delays, seat locking, collision or sprite direction.

### 9.1 Stale plans

Every step is revalidated immediately before execution.

If a step becomes invalid because a target moved, a seat was taken, or another required precondition changed:

1. cancel the remaining steps of that plan;
2. leave the agent in a safe deterministic activity/fallback;
3. request a new intention only when scheduler budget and priority permit.

Do not execute queued stale decisions later merely because capacity becomes available.

## 10. Activity Runtime

The Activity Runtime converts intention into legal deterministic world operations.

Candidate MVP activities:

```text
wander
sit_and_rest
talk_to_person
have_drink
work_at_cafe
observe_something
social_explore
```

Activities may sequence approach, reserve, sit, speak, wait, observe, stand and release operations. The runtime owns orchestration; the LLM owns motive, target selection, meaningful choices and language.

### 10.1 Reservations

Scarce resources require runtime state:

```text
available
reserved
occupied
```

Reservation operations must be atomic from the World Engine's point of view so two agents cannot both claim the same seat.

### 10.2 Commitment and interruption

Activities need commitment and interruption policy so agents do not constantly replan and accomplish nothing.

Candidate interruption classes:

```text
critical   danger / emergency
high       direct social interruption
medium     important need
low        optional observation
```

Exact thresholds remain open.

## 11. Conversation Session

Conversation is a persistent first-class activity, not a series of unrelated one-line `talk()` calls.

A session owns:

```text
participants
state
topics
unresolved threads
tone
rolling summary
recent transcript
pinned facts / promises / questions
current turn
turn deadline
```

### 11.1 Shared conversation, private minds

Participants share only speech and publicly observable session state. They never receive another participant's private identity, memory, hidden goals, intentions or reasoning state.

### 11.2 Long conversations

Long conversations retain:

```text
older transcript -> rolling summary
recent turns -> verbatim
important facts / promises / unresolved threads -> pinned
```

This permits two or more LLMs to continue a serious conversation for many turns without losing topic continuity.

### 11.3 Continuity

Once a conversation is `ACTIVE`, continuing is the default. It does not ask after every sentence whether the participant still wants to talk.

A conversation ends or pauses for a meaningful reason: deliberate departure, natural completion, refusal, timeout, physical separation, or sufficiently high-priority interruption.

### 11.4 Turn scheduling — decided for MVP

MVP conversations use **strict turn-taking with a timeout**. The Conversation Session owns whose turn it is and when that turn expires.

More natural interruption/overlap may be explored later, but it is not required for MVP.

### 11.5 Multiple participants

A nearby agent may perceive a conversation and request to join. Session membership remains explicit while all Agent Sessions remain private.

### 11.6 Subjective memories

At the end of a conversation, each participant may form a different private memory from the same shared transcript.

## 12. LLM Scheduler and budget manager

All model access goes through a bounded asynchronous scheduler between Agent Brain requests and provider adapters.

It must support at least:

```text
maximum concurrent requests
requests-per-minute / provider quota controls
timeout
limited retry policy
priority queue
drop policy
stale-request cancellation
```

Exact numeric budgets are configuration, not architecture constants.

### 12.1 Priority

Initial priority order:

```text
P0  active conversation: directly addressed / current turn
P1  current activity failed or was invalidated
P2  idle agent needs a new intention
P3  high-salience optional observation
P4  reflection / curiosity / nonessential thought
```

When budget is exhausted, low-priority P3/P4 wakeups should normally be **dropped rather than indefinitely queued**. An agent continues its deterministic current activity.

P0/P1 may receive limited retry according to provider policy, but still may not block the world clock.

### 12.2 Stale requests

Before dispatch and before accepting a result, verify that the request still applies to the agent's current activity/session generation. A late answer to an obsolete situation must be discarded.

## 13. Agent Brain and provider boundary

The Agent Brain produces intention, language and meaningful choices. It does not own world state.

All model-specific behavior should sit behind a provider interface so the same World Engine can use AMD Gateway or another provider/model without architectural changes.

Conceptually:

```text
brain.decide(context)
brain.converse(context)
brain.summarize(context)
```

### 13.1 Structured output — decided

Decision calls use provider-supported structured outputs / schemas where available. Do not depend on ad-hoc parsing of free-form prose for machine actions.

A schema validation failure is treated as an inference failure and follows the normal non-blocking fallback path.

Speech content may remain natural language inside a structured response.

## 14. Pets and deterministic actors — decided

Pets use the **same world event and perception interfaces** as LLM-driven characters where applicable, but their brain is deterministic / probabilistic rather than an LLM.

This keeps one simulation path:

```text
perceive -> choose behavior -> validated world action -> event
```

A pet may use a small state machine such as wander, approach, follow, rest and react, with state such as familiarity, energy and owner relationship.

## 15. One-decision asynchronous data flow

```text
1. World Engine continues ticking with Agent A in its current deterministic activity.
2. A meaningful decision point creates a Brain request.
3. Perception Engine derives A's subjective observations.
4. Memory Engine retrieves relevant private memories.
5. Active Activity / Conversation Session contributes current session state.
6. Server assembles A's isolated stable-prefix + dynamic-suffix context.
7. LLM Scheduler accepts, delays, drops or dispatches the request according to priority and budget.
8. World Engine keeps ticking while the request is in flight.
9. If the response arrives, scheduler checks that the request generation is still current.
10. Structured output is validated; invalid output is treated as inference failure.
11. Activity Runtime interprets the valid proposal.
12. World Engine validates the next operation against current world truth.
13. World Engine executes or rejects it without rewinding time.
14. Objective event enters the Event Store.
15. Perception Engine distributes subjective consequences to eligible observers.
16. Private memory candidates may be consolidated.
17. On timeout/failure/drop, the agent simply remains in its safe deterministic current activity or fallback.
```

## 16. Phaser boundary

Phaser is a renderer, not the authority for agent state, memory, social knowledge, reservations, conversation ownership, or LLM behavior.

The presentation layer should consume the same event/state representation whether the source is:

```text
LIVE World Engine
REPLAY Event Store
MOCK / SCRIPTED run
```

This boundary is required so replay behaves like the live world rather than as a separate animation system.

### 16.1 Where each mode runs — decided

A provider credential must never reach the browser. `docs/` is published as a
static GitHub Pages site, which can hold no secret at all, and this settles the
deployment question for the MVP rather than leaving it open:

```text
GitHub Pages (static)   REPLAY and MOCK only - renderer plus a recorded stream
LIVE                    an engine process holding the credential, with the
                        renderer connected to it
```

The published page is therefore always able to show the world, with or without a
provider, a network, or remaining quota. LIVE mode adds an engine process — local
during development and on the day of a demonstration, or a small hosted service —
and the renderer talks to it over a stream rather than calling any provider
itself.

This is not a fallback bolted on at the end. It is the same three modes as §8.1,
resolved to where each one is allowed to run.

## 17. Phase 3A — first implementation slice

Do **not** begin implementation by connecting an LLM.

The first slice is entirely deterministic:

1. world clock;
2. Activity Runtime state machine;
3. load canonical seats/stations from `docs/specs/world/anchors.json`;
4. atomic seat reservation (`available / reserved / occupied`);
5. one scripted agent that goes from the cafe area to a bench, reserves it, sits, waits, stands and releases it;
6. two streams: committed world facts for every visible state transition,
   versioned and carrying the run's seed, and a separate audit stream for the
   script's intentions;
7. replay that reproduces the scripted run through the normal renderer path,
   from the recorded stream alone;
8. a second scripted agent attempting to claim the same seat, proving reservation conflict handling.

Success criteria for Phase 3A:

```text
- the world continues running with no LLM at all;
- two agents cannot occupy the same exclusive seat;
- every visible transition is represented in the event stream;
- a recorded run replays to the same visible sequence, from the fact stream
  alone, with the Activity Runtime not running at all;
- re-running the scenario live from the same seed produces an identical fact
  stream - if it only nearly matches, §8.3 is being broken somewhere;
- intention source can later be swapped from script/mock to LLM without changing World Engine mechanics.
```

### 17.1 What Phase 3A must not contain

The specification describes perception, memory, zones, salience, conversation and
scheduling. **None of it belongs in 3A**, however well specified it already is.

```text
not in 3A    perception, observation packages, salience
not in 3A    memory of any kind
not in 3A    semantic zones
not in 3A    conversation
not in 3A    LLM scheduler, budgets, priorities
not in 3A    any provider adapter, including a mock one
```

3A exists to prove exactly one chain:

```text
clock -> activity -> reservation -> state mutation -> events -> replay
```

Only after that chain is stable should implementation add Mock Brain / scheduler
integration, then a real provider adapter.

## 18. Decisions closed by this review

The following are no longer open questions for the MVP:

| Topic | Decision |
|---|---|
| World loop and LLM latency | World time never waits for inference. |
| LLM timeout/failure support | Required; deterministic fallback always exists. |
| Seat/station definitions | `docs/specs/world/anchors.json` is canonical. |
| MVP visual perception | Semantic zones + distance; do not use render occlusion as LOS. |
| Replay | First-class runtime and demo reliability requirement. |
| Conversation scheduling | Strict turn-taking + timeout, owned by Conversation Session. |
| Machine action output | Provider-supported structured output/schema; validation failure = inference failure. |
| Stale plan | Cancel remaining steps; replan only when scheduler permits. |
| Pets | Same perception/event/world-action interfaces, deterministic/probabilistic brain. |
| Provider coupling | Agent Brain uses an adapter; World Engine is provider-agnostic. |
| Prompt organization | Stable cache-friendly prefix + dynamic suffix; prefix schemas are the complete set, never situation-filtered. |
| Cold start | Every agent holds a deterministic activity from the first tick, before any inference. |
| Replay fidelity | Seeded randomness recorded in the stream, no host-clock reads in simulation logic, versioned events. |
| Deployment | Static Pages hosts REPLAY and MOCK; LIVE requires an engine process holding the credential. A credential never reaches the browser. |
| World time | Integer ticks. Seconds only for presentation, as `tick * tickDurationMs`. Durations in ticks. |
| Event streams | Two: committed world facts (renderer and replay read this) and an audit stream of intentions and proposals (they must not). |
| Replay semantics | Playback of facts, not re-execution of commands. |

## 19. Open questions before later implementation

These remain intentionally unresolved:

- simulation time model and speed — note that this is not independent of the scheduler: a faster simulation reaches more decision points per real minute and therefore spends provider budget faster, so tick rate and budget must be chosen together;
- exact semantic-zone boundaries;
- distance and hearing thresholds;
- salience scoring and maximum observation package size;
- memory importance, consolidation and forgetting;
- contradiction handling in private memory;
- exact activity interruption thresholds;
- exact scheduler concurrency/RPM/token budgets per provider;
- limited retry counts and timeout durations;
- token/window thresholds for conversation rolling summaries;
- multi-party conversation join/leave etiquette beyond strict turn ownership;
- exact structured-output schemas for `decide`, `converse`, and `summarize`;
- needs model (hunger, energy, boredom, social drive) and how strongly it influences intention generation;
- persistence backend for long-running memory and event history;
- where the LIVE engine process is hosted for a public demonstration, and how the credential reaches it (that LIVE needs such a process, and that the browser never holds the credential, is settled in §16.1).

These should be decided incrementally after Phase 3A proves the deterministic runtime and replay path.