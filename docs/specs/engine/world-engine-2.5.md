# LittleWorld World Engine 2.5 — Architecture Draft

**Status:** design draft  
**Created:** 2026-08-22 23:38 PT (`America/Los_Angeles`)

## 1. Core principle

LittleWorld uses a hybrid design:

> **The LLM decides what a character wants to do and why. The engine decides how that intention can legally and coherently happen in the world.**

Phaser renders. The World Engine owns authoritative state. Each character has a private LLM session. The Perception Engine decides what each character can know. The Activity Engine turns intentions into legal multi-step actions. Conversation Sessions preserve long-running dialogue without merging private minds.

The key invariant is:

```text
WORLD TRUTH != AGENT KNOWLEDGE
```

## 2. Private Agent Sessions

Every character has an independent LLM context. An agent must never receive another agent's private prompt, personality, memories, hidden goals, internal plan, or private reasoning state.

A server-built request should contain only:

```text
[IDENTITY — immutable]
[PERSONALITY — stable]
[CURRENT STATE]
[CURRENT INTENTION / ACTIVITY]
[RELEVANT PRIVATE MEMORY]
[CURRENT OBSERVATIONS]
[CURRENT CONVERSATION CONTEXT]
[AVAILABLE ACTIVITIES]
[DECISION INSTRUCTION]
```

Identity is server-owned. Model output cannot rewrite identity or world truth.

Do not implement an agent as one ever-growing lifetime chat transcript. Rebuild context at each meaningful decision from identity, state, retrieved memory, perception, and active sessions.

## 3. World Engine

The World Engine is the only authority allowed to mutate shared state.

It owns at least:

```text
World
  time
  agents
  pets / non-LLM actors
  positions and zones
  seats and stations
  reservations and occupancy
  active activities
  active conversations
  world event log
```

LLM output is always a proposal. The engine validates before execution.

Example:

```json
{
  "activity": "sit_and_rest",
  "target": "bench-slot-2"
}
```

The engine checks existence, reachability, reservation, occupancy, and whether the agent is free to act.

## 4. Perception Engine

Agents never receive the full world database. The engine creates a subjective Observation Package.

```text
world truth
  -> proximity
  -> visibility / hearing
  -> zone / occlusion rules
  -> recognition
  -> salience / attention
  -> observation package
```

### Recognition

Internal IDs must not reveal names automatically.

A stranger may see:

> A middle-aged man in a dark suit is standing near the cafe.

An acquaintance may see:

> You recognize Daniel near the cafe.

Knowledge of names and relationships belongs to each agent's memory.

### Attention

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

Exact thresholds remain open.

## 5. Memory Engine

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

## 6. Global Event Log

The World Engine keeps an objective event log for simulation, debugging, replay and persistence.

Example:

```json
{
  "t": 482,
  "type": "talk",
  "actor": "boy-01",
  "target": "boy-02",
  "data": {"text": "You aren't scared of that dog, are you?"}
}
```

A global event is not global knowledge. After an event, the Perception Engine decides who could perceive it and what each observer learns.

## 7. Intentions and short plans

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

## 8. Activity Engine

The Activity Engine converts intention into legal world operations.

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

Every step is revalidated immediately before execution because plans become stale.

Scarce resources require reservation state:

```text
available
reserved
occupied
```

Activities also need commitment and interruption policy so agents do not constantly replan and accomplish nothing. Candidate interruption classes:

```text
critical   danger / emergency
high       direct social interruption
medium     important need
low        optional observation
```

Exact rules remain open.

## 9. Conversation Session

Conversation is a persistent first-class activity, not a series of unrelated one-line `talk()` calls.

A session may contain:

```yaml
id: conv_104
participants: [boy-01, boy-02]
state: active
started_at: 14:31
topics:
  - the dog
  - who is braver
unresolved:
  - Kenji still denies being frightened yesterday
tone: playful_argument
summary: The brothers are teasing each other about who is more afraid of the dog.
recent_transcript:
  - Taro: "You ran away yesterday."
  - Kenji: "I didn't. I went to find Grandma."
```

### Shared conversation, private minds

Participants may share the transcript and public session state because they heard it. They must never receive another participant's private identity, memory, hidden goals, intentions or private reasoning.

### Long conversations

Long conversations should retain:

```text
older transcript -> rolling summary
recent turns -> verbatim
important facts / promises / unresolved threads -> pinned
```

This allows two or more LLMs to continue a serious conversation for many turns without losing topic continuity.

### Continuity

Once a conversation is ACTIVE, continuing is the default. It should not ask after every sentence whether the speaker still wants to talk.

A conversation ends or pauses only for a meaningful reason: deliberate departure, natural completion, refusal, timeout, physical separation, or a sufficiently high-priority world interruption.

### Multiple participants

A nearby agent may perceive a conversation and request to join. The Conversation Session owns participant membership and turn management while all private Agent Sessions remain separate.

### Subjective memories

At the end of a conversation, each participant may form a different private memory from the same shared transcript.

## 10. LLM invocation policy

LLMs do not run on render frames or every world tick. Wake an Agent Brain only at meaningful decision points, such as:

- idle and needing a new intention;
- a meaningful activity branch;
- directly addressed by another character;
- high-salience observation;
- plan/action failure;
- next turn in an active Conversation Session.

Deterministic timers, need decay, reservation expiry and routine activity progression should not require LLM calls.

## 11. One-decision data flow

```text
1. World Engine reaches a decision point for Agent A.
2. Perception Engine derives A's subjective observations.
3. Memory Engine retrieves relevant private memories.
4. Active Activity / Conversation contributes session state.
5. Server assembles A's isolated context.
6. LLM A proposes an intention, continuation, speech or meaningful choice.
7. Activity Engine interprets the proposal.
8. World Engine validates the next operation.
9. World Engine executes or rejects it.
10. Objective event enters the global log.
11. Perception Engine distributes subjective consequences.
12. Private memory candidates may be consolidated.
```

## 12. Phaser boundary

Phaser is a renderer. It should receive world state and display it, not decide agent truth, memory, social knowledge, reservation ownership or LLM behavior.

## 13. Open questions before implementation

The following are intentionally unresolved:

- simulation time model and speed;
- perception radius and hearing rules;
- exact occlusion/line-of-sight integration with the painted world spec;
- salience scoring and observation limits;
- memory importance, consolidation and forgetting;
- contradiction handling in memory;
- exact LLM structured-output schema;
- activity interruption thresholds;
- conversation turn scheduling and join/leave etiquette;
- token thresholds for transcript summarization;
- timeout/retry/fallback behavior when an LLM call fails;
- whether pets use the same perception/event interfaces with a deterministic brain;
- how needs such as hunger, energy, boredom and social drive affect intention generation.

These should be decided incrementally. This document describes the architecture boundary, not a claim that every policy is already solved.
