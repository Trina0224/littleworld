# Phase 3E — Conversation Sessions and Speech Transport

**Status:** implementation contract / design baseline  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Depends on:** Phase 3C perception, Phase 3D private memory, `social-personality.md`  
**Feeds:** Phase 3F-A Cafe / Venue Runtime, Phase 3F-B Scheduler + Mock Brain, Phase 3G provider adapter

Phase 3C answers **what can this character perceive?**  
Phase 3D answers **what does this character remember?**  
Phase 3E answers the next question:

> **How can two or more characters sustain a real conversation over time without turning the whole world into a round-robin chatbot?**

Conversation is a persistent world/session object. It is not a repeated sequence of independent `talk()` calls.

The central rule is:

> **A conversation persists by default once active, but speech never becomes mandatory.**

Some characters should rescue a fading conversation. Some should let it die. Silence is a valid outcome.

---

## 1. Conversation is a first-class session

A conversation session owns the local conversational state that would otherwise have to be reconstructed after every utterance.

Initial conceptual shape:

```text
ConversationSession
  id
  participants[]
  state                 opening | active | winding_down | ended
  startedTick
  lastSpeechTick
  lastSpeaker
  addressedParticipant  optional
  recentTurns[]
  openQuestion          optional lightweight marker
```

The exact JavaScript structure may differ, but these properties are semantic requirements.

### 1.1 Session identity is server-side

A Brain never invents a session id and never needs to see internal entity ids.

The server knows:

```text
conv-17 = [grandma-01, man-01]
```

A Brain receives only its own model-visible context: recognised/private labels where available, current visible refs, recent utterances, and legal choices.

### 1.2 One active social conversation per LLM actor in the MVP

For Phase 3E, an LLM actor may be an active participant in at most **one** conversational session at once.

This avoids unclear cases such as one character simultaneously taking turns in two nearby groups. A character may still **hear** other conversations through perception without joining them.

This is an MVP constraint, not a claim about human conversation.

---

## 2. Active means continuation is the default state

The old failure mode is:

```text
A talks
B replies
system asks whether they want to converse again
A politely waits
B politely waits
conversation dies in three lines
```

Phase 3E must not do that.

Once a session becomes `active`, **the session remains active until there is an explicit or physical reason to wind it down**.

An utterance does not close the session merely because it answered the previous sentence.

Examples of legitimate endings:

```text
participant chooses leave_conversation
participant walks out of conversational hearing conditions
participant departs the scene
session is silent beyond a configured idle threshold
human/day transition closes new social activity
an activity with higher authority makes continued conversation impossible
```

A short answer is **not by itself** an ending signal.

---

## 3. No global round-robin

There is no rule that every present character takes a turn.

Conversation is event-driven.

Typical two-person flow:

```text
A speaks to B
  -> B receives direct-address / conversation-turn reason
  -> B may reply, listen, say nothing, change topic, or leave

B replies
  -> A receives conversation-turn reason
  -> session remains active
```

A third character C who hears the speech:

```text
C hears it through perception
  -> C may remember it
  -> C does NOT automatically become a participant
  -> C does NOT automatically receive the next conversational turn
```

If C wants to join, that is a distinct legal social choice such as `join_conversation`.

This rule prevents one local conversation from becoming an eleven-agent meeting.

---

## 4. Speech transport and conversation membership are separate

Two concepts must never be conflated:

```text
who can hear speech
!=
who is a participant in the conversation
```

Perception / spatial transport decides who hears an utterance.
Conversation state decides who owns the active exchange and who may receive turn-oriented wake reasons.

Therefore:

- a nearby stranger may hear every word and still not be a participant;
- a participant who walks too far away may remain in the session object only long enough for it to wind down, but speech does not become telepathic;
- a broadcast/loud act may be heard by the whole scene without creating a scene-wide conversation.

### 4.1 Scope is derived from the selected act

The Brain does **not** set `scope: local|broadcast`.

The legal action vocabulary determines physical speech extent.

Examples:

```text
greet / ask / reply / chat / join_conversation
  -> ordinary local speech

order / call_across_park / raise_voice
  -> loud/broadcast transport as defined by the runtime
```

This keeps the Phase 3C hearing-distance model meaningful.

---

## 5. The Brain selects legal actions; it does not author schemas

At a Brain turn, the engine provides a finite list of legal choices for the current state.

Example:

```text
[
  reply:seen-2,
  ask:seen-2,
  continue_listening,
  change_topic:seen-2,
  leave_conversation,
  nothing
]
```

The model returns:

```text
one selected choice
+ optional free speech text where that choice allows speech
+ optional private memory proposals
```

The engine constructs the authoritative structured action from the selected choice.

The model does not invent action names, ids, coordinates, session ids, transport scopes, or internal entity ids.

### 5.1 `nothing` is always legal

`nothing` means:

> do not produce a new social action now; continue the current deterministic activity.

It must not be treated as provider failure.

This is required so shy, withdrawn, distracted, or simply uninterested characters are allowed to remain themselves.

### 5.2 `continue_listening` is distinct from `nothing`

`continue_listening` means the character remains socially engaged in the current session but does not take the conversational floor now.

`nothing` means no social commitment is made.

This distinction allows quiet listeners such as タタ or 草野 to remain part of a conversation without being forced to speak.

---

## 6. Minimum social action vocabulary for Phase 3E

The initial vocabulary should remain small.

Required conversational actions:

```text
greet(target)
start_conversation(target)
reply(target)
ask(target)
change_topic(target)
continue_listening
join_conversation(session/visible group)
leave_conversation
nothing
```

Optional if implementation proves useful without widening scope:

```text
address_group
acknowledge
```

Cafe-specific actions such as `order`, `ask_shopkeeper:recommendation`, billing, and vending-machine actions belong to Phase 3F-A even though they will reuse the same selection mechanism.

---

## 7. Social personality affects opportunities and guidance, not dialogue authorship

`social-personality.md` is a binding input to Phase 3E.

The ten numeric traits remain canonical character data. They may influence two different layers.

### 7.1 Engine / future scheduler use

The engine or scheduler may use these traits when weighting whether an optional social opportunity should become a Brain wake reason:

```text
initiative
conversationDrive
socialInhibition
persistence
```

Examples:

- high initiative: more eligible to start a conversation during a genuine social opening;
- high conversationDrive: more eligible to rescue an active conversation after a weak turn;
- high socialInhibition: less eligible to initiate with strangers;
- high persistence: less likely to treat one weak response as sufficient reason to stop.

Phase 3E itself should expose the necessary reasons/metadata; Phase 3F-B owns the full scheduler policy.

### 7.2 Brain guidance use

All ten traits plus `interests` may be translated into concise natural-language guidance for the Brain.

The model should receive semantic guidance, not unexplained decimal values.

Example high-drive guidance:

> You readily keep a conversation going. A short answer does not automatically mean the other person wants to stop. If the current thread is exhausted, you often find a natural hook in what was just said, what you remember, what you observe, or one of your interests.

Example low-drive guidance:

> You rarely start conversations and do not feel responsible for rescuing silence. You can answer when directly addressed, but a pause is acceptable.

### 7.3 Low traits must not be repaired

The system must not decide that a low-drive character is a UX problem and compensate by making them more talkative.

In particular, 渡辺's low social drive is part of the character, not a scheduler defect.

---

## 8. Topic handling stays intentionally shallow

The World Engine must not become a semantic conversation model.

Phase 3E may track only lightweight structural facts such as:

```text
who spoke last
who was addressed
whether the last turn was a question-like social action
whether that question received a response
recent turns
whether the session has gone quiet
```

The engine does **not** need to understand that a conversation is "about Tokyo" or "about marriage".

The Brain sees recent turns, relevant observations, its own memory, recognition, and interests and decides what the semantic topic is.

### 8.1 `openQuestion` is structural, not NLP

If the selected social act is `ask(target)`, the session may mark a lightweight open question from speaker to target.

When the target later selects `reply`, that marker may be cleared.

This is enough to preserve conversational structure without parsing prose.

---

## 9. Session transcript is working context, not long-term memory

This boundary is mandatory.

```text
Conversation transcript
  -> session-owned
  -> short-lived working context
  -> keeps recent utterances / turn structure

Private Memory (3D)
  -> agent-owned
  -> survives across sessions
  -> stores encounters and selected meaningful interpretations
```

Do **not** copy every conversational line into long-term memory.

Otherwise a sequence such as:

```text
こんにちは
こんにちは
今日はいい天気ですね
そうですね
```

would rapidly consume the episode budget while preserving nothing useful.

### 9.1 Transcript retention

Initial recommendation:

```text
keep the most recent 8–12 turns model-visible
```

The complete committed speech facts remain in the authoritative recording/event history for replay/debugging. The session's model-visible window is only working context.

### 9.2 Long-term memory proposals

A Brain may separately propose a memory-worthy interpretation such as:

```text
"He said he will return to Tokyo next spring."
"I learned that she calls herself Kyoko."
```

That proposal follows the Phase 3D canonicalization/private-memory path. The transcript itself is not automatically promoted.

---

## 10. Safe person references inside conversation context

Internal entity ids never enter a Brain prompt.

Within a live context, the Brain refers to visible people using the current perception refs (`seen-N`) and recognition annotations already established by 3C/3D.

For recent transcript turns, the Context Builder should render speakers using the observer's own safe knowledge where possible:

```text
recognised person -> observer's private label, e.g. 森牧師
currently visible stranger -> current ref + appearance description
not currently visible but known participant -> observer's private label if known
otherwise -> neutral session-local description/reference
```

Never fall back to the target's canonical name or internal entity id merely because it is convenient.

This is the 3D label rule applied to conversation history.

---

## 11. Conversation lifecycle

Initial lifecycle:

```text
none
  -> opening
  -> active
  -> winding_down
  -> ended
```

### `opening`

A social approach has been committed but reciprocal engagement has not yet been established.

Example:

```text
A start_conversation(B)
```

If B replies, asks back, or explicitly remains engaged, transition to `active`.

If B chooses `nothing`, leaves, or becomes unavailable, the session may end without ever becoming active.

### `active`

Conversation persistence is the default. Turns may continue without reopening the session.

### `winding_down`

Used when the session is still physically/socially present but should not generate new conversational expansion.

Possible triggers:

```text
explicit leave_conversation
physical separation beginning
idle threshold exceeded
day-closing mode
higher-priority deterministic activity
```

A brief farewell may occur, but the system must not require one.

### `ended`

No further conversation-turn wakeups arise from the session. Its transcript may remain available for debug/recording but is no longer active working state.

---

## 12. Proximity and interruption rules

Conversation cannot override the physical world.

Required rules:

- if participants can no longer hear one another under ordinary speech transport, ordinary local dialogue cannot continue;
- walking away can wind down/end a session;
- an agent may continue a deterministic movement/activity while waiting for a Brain result if that activity remains compatible with conversation;
- an incoming direct address from outside the current session may be perceived, but Phase 3E must not silently switch sessions; the Brain/scheduler decides whether to ignore, acknowledge later, or leave the current conversation;
- provider latency never freezes the session or the world clock.

---

## 13. Third-party joining

A nearby listener is not automatically included.

To join an existing session, the character must have:

```text
physical/auditory access
+ a legal join_conversation option
+ a selected social action to join
```

On commit, the server adds the character to `participants[]`.

The existing participants are not required to explicitly "approve" the join in Phase 3E. Their Brains may react naturally on their next turns. More complex exclusion/private-conversation mechanics are out of scope.

### 13.1 MVP group size

Phase 3E should support at least **three active participants** because third-party joining is part of the acceptance test.

There is no requirement yet to optimize large group conversation among all eleven characters.

---

## 14. Wake reasons produced by conversation

Phase 3E should expose explicit reasons rather than directly call an LLM provider.

Examples:

```text
direct_address
conversation_turn
conversation_opening
conversation_join_opportunity
conversation_fading
```

The later scheduler may rank them differently.

At minimum:

```text
direct_address > ordinary optional social opportunity
```

Phase 3E does not implement provider concurrency, quotas, or request budgeting. That remains Phase 3F-B/3G territory.

---

## 15. Provider failure and latency

Conversation state must survive provider delay or failure.

If a Brain request is pending:

- the world tick continues;
- deterministic activities continue where compatible;
- no placeholder speech is invented;
- another character may continue acting according to the scheduler/session rules;
- timeout/failure eventually resolves to the existing safe fallback (`nothing` / continue deterministic activity), not to a world freeze.

The authoritative recording may record provider timing in audit/debug metadata, but Replay is not required to reproduce that wall-clock delay.

---

## 16. Brain context for a conversation turn

A conversation-turn package should conceptually contain:

```text
stable self/personality prefix                 existing 3B + social guidance
current subjective sensory state              3C
private recognition + selected memory          3D
conversation session state                     3E
recent transcript window                       3E
why you were woken                             direct_address / turn / fading / etc.
legal action choices                           engine-generated
```

It must not contain:

```text
other agents' self.md
other agents' private memory
internal entity ids
canonical names the observer has not learned
raw server session ids unless absolutely required (prefer not)
world facts outside what this observer may know
```

---

## 17. Required acceptance tests

Phase 3E is not complete until scripted/mock participants demonstrate all of these without a real provider:

1. **Persistent two-person session:** A and B sustain at least 10 turns without opening a new session after every utterance.
2. **No round-robin:** C hears A/B but is not automatically granted a turn or added as participant.
3. **Explicit join:** C chooses `join_conversation` and the same session becomes a three-person session.
4. **Silence is legal:** B selects `nothing`; no fake speech fact is emitted.
5. **Listening is legal:** B selects `continue_listening`; B remains a participant without speaking.
6. **Physical boundary:** A walks outside ordinary hearing conditions and the conversation winds down/ends rather than becoming telepathic.
7. **Transcript is session-local:** ten conversational turns do not create ten long-term memory episodes merely because they occurred.
8. **Meaningful memory remains possible:** a separate Brain memory proposal is canonicalized and survives after the session ends.
9. **Third-party hearing remains perception:** a nonparticipant may remember heard speech without being made participant.
10. **Identity safety:** a stranger's transcript/context does not gain a canonical name or internal entity id.
11. **Act-derived transport:** a normal `reply` remains local; a loud act uses its defined wider transport without a model-provided scope field.
12. **Social traits remain asymmetric:** scripted policy or deterministic scoring must not make a deliberately low-drive character equally likely to initiate as a high-drive character when all other conditions are equal.
13. **Provider independence:** all session state/lifecycle tests run with no real LLM provider.
14. **Latency safety:** a pending async Brain result does not stop world ticks or deterministic activity.
15. **Exactly-once speech:** each committed utterance is delivered through perception/memory according to existing exactly-once contracts and is not duplicated by conversation bookkeeping.

---

## 18. Explicit non-goals for Phase 3E

Do not add these while implementing 3E:

```text
real LLM provider integration                         3G
provider quotas / concurrency scheduler              3F-B
cafe order queue / preparation runtime               3F-A
semantic topic classification by NLP
affinity/friendship scores computed by engine
emotion simulation
gossip propagation model
private whisper mechanics
large-group meeting facilitation
conversation summarization by a second model
vector database
replay editing / pacing logic
```

If one of these appears necessary to make a 3E test pass, reconsider the boundary before implementing it.

---

## 19. Implementation order inside Phase 3E

Recommended order:

```text
3E-1  ConversationSession store + lifecycle
3E-2  local speech transport integration + act-derived scope
3E-3  legal conversational action menu
3E-4  turn/direct-address wake reasons
3E-5  transcript working window
3E-6  third-party join / leave
3E-7  social-personality guidance hooks
3E-8  scripted/mock acceptance scenarios + mutation tests
```

Do not connect a real provider merely to make the conversation look alive during development. Scripted/mock choices are the acceptance mechanism for this phase.

---

## 20. Handoff gate

When Phase 3E passes its acceptance tests, the next required implementation milestone is still **3F-A Cafe / Venue Runtime** before any real provider integration.

The sequence remains:

```text
3A  deterministic runtime                complete
3B  identity / seeded knowledge          complete
3C  perception                           complete
3D  private memory                       complete
3E  conversation + speech transport      CURRENT
3F-A cafe / venue runtime                required next
3F-B scheduler + mock Brain integration
3G  real provider integration
```

If an implementer proposes going directly from 3E to a live model provider, stop and return to `phase-3c-venue-interactions.md` §8.
