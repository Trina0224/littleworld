# LittleWorld World Engine 2.5 — Architecture Draft

**Status:** design draft, reviewed with Claude  
**Created:** 2026-08-22 23:38 PT (`America/Los_Angeles`)  
**Review incorporated:** 2026-08-23 00:55 PT (`America/Los_Angeles`)

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

Example event:

```json
{
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
5. Active Activity / Conversation