# Phase 3E — Conversation Sessions and Speech Transport

**Status:** implementation contract / design baseline  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Updated:** 2026-08-26 — tick position (§2.1), transcript source (§9.0), the 3D
boundary made concrete (§9.3), engine effect of `continue_listening` (§5.3), turn
ownership reconciled with `world-engine-2.5.md` §11.4 (§11.0), acceptance
mechanism sharpened (§17.0)  
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

### 2.1 Conversation is a stage of the canonical tick

Session state is updated at **step 8** of the tick order in
`phase-3c-perception.md` §2, owned by the loop and not by whichever scenario
happened to think of it.

```text
6  refresh perception
7  accumulate private memory
8  update conversation sessions from committed speech    <- here
9  evaluate wake reasons
10 dispatch
```

Its position is fixed by two dependencies and not by taste: sessions are built
from committed speech facts (step 5), and the wake reasons of §14 are read out of
session state at step 9. It sits after memory only because neither depends on the
other.

This is written down before any of it is implemented on purpose. Twice now a
stage has existed as a correct module that nothing actually ran — perception for
a whole phase, memory until a review caught scenarios calling it by hand — and
both times the module was fine and the *order* was the defect. A loop given a
conversation store it never ticks should be refused rather than left to look busy.

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

### 5.3 What the two do in the engine

Neither produces a `speech_said` fact — §17.4 requires that no fake speech is invented, and that applies to both. The difference is entirely in session state:

| choice | fact | session |
|---|---|---|
| `continue_listening` | none | stays a participant; **defers the idle threshold**; may clear its own turn |
| `nothing` | none | untouched — no social commitment is recorded |

So both are recorded in **audit**, never in facts, on the same terms as a memory write: a renderer has nothing to draw for either, and a run still has to be explicable afterwards.

The consequence that matters is that a room of quiet listeners keeps its session alive, while a room of characters who each chose `nothing` lets it go quiet and wind down — which is the behaviour §5.1 and §7.3 exist to protect.

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

### 9.0 The transcript is built from committed facts, not from a perception queue

The session is server-side and already knows its participants, so it reads `speech_said` out of the committed fact stream directly.

It must **not** be a third consumer of the perception queue. That queue already has two readers with deliberately different rights (`phase-3d-memory.md` §2.1): Brain delivery drains it, memory reads it without draining and tracks its position with a cursor. Adding a third reader with a third rule is how that contract stops being checkable.

Reading facts instead gives §17.15 for free — conversation bookkeeping cannot duplicate a delivery or an ingestion, because it never touches the mechanism either one uses.

It also keeps the three boundaries honest in different directions:

```text
perception queue  -> what one observer may know it heard
fact stream       -> what the world committed
transcript        -> what this session's participants said, server-side
```

A participant who could not hear an utterance still does not see it: the transcript is rendered per observer (§10), and what a given Brain is shown stays filtered by what that observer perceived. The session storing an utterance is not the same as every participant being told it.

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

### 9.3 What this changes in 3D, concretely

This section is not only a rule for 3E — it revises behaviour that already ships.

Before 3E, memory wrote a long-term episode for **every** heard utterance, because there was nowhere else for a sentence to go. The example in §9 above is literally what the implementation produced. `phase-3d-memory.md` §6.1 now replaces that with:

> **The engine writes exactly one kind of episode: `first_meeting`. Everything else in the episode list was proposed by the Brain.**

What the engine keeps instead is structural, permanent and one line per person:

```text
encounters    distinct meetings
spokenWith    how many of those meetings words passed in
lastSeenTick  while contact holds
```

So §17.7 becomes a property of 3D rather than something 3E has to arrange, and §17.8 stays possible because the Brain's own proposals are untouched. 3E does not have to *prevent* transcript promotion; there is no longer a mechanism that promotes it.

3D's exactly-once ingestion contract does **not** relax. It is still required, now because a re-ingested utterance would inflate `spokenWith` and drag `lastSeenTick` backwards. Ingestion happens once; only what it writes changed.

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

### 11.0 Turn ownership is addressee-driven, not rotational

`world-engine-2.5.md` §11.4 decided **strict turn-taking with a timeout** for the MVP, and that stands: the session owns whose turn it is and when it expires. This section says only what "whose turn" resolves to, because with three participants it is otherwise ambiguous.

> **The turn goes to whoever was addressed, not to whoever is next in a list.**

`A replies to B` gives the turn to B. It does not give it to C because C has not had one recently. Rotation among participants would rebuild §3's round-robin inside the session after taking the trouble to keep it out of the scene, and it is also the mechanism that makes a three-person conversation feel like a meeting rather than a conversation somebody else is standing near.

The timeout still belongs to the session: a turn that is never taken expires, and an expired turn is one of the ways a session goes quiet and reaches `winding_down`. `address_group` (§6, optional) is the case with no single addressee, and is why it stays optional in this phase.

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

### 17.0 What "scripted/mock" means here, and what it does not

§18 assigns the **Mock Brain** to 3F-B, so the acceptance mechanism for this phase has to be something smaller: a **scripted participant** whose choice at each turn is written into the test.

```text
scripted participant (3E)   the test says: this turn, B selects reply
mock Brain (3F-B)           a stand-in that DECIDES, without a provider
```

The distinction matters because a mock that decides would make these tests pass for reasons the test does not control, and 3E is about session mechanics rather than about anything resembling judgement. Every one of the fifteen tests below must be reachable with choices the test wrote itself.

**§17.12 needs one exception, and only one.** Social asymmetry cannot be demonstrated by a test that writes down the choices, because writing them down is what it is trying to prove the engine does not do. So 3E exposes a single **pure function** — social vector plus situation in, a number out — and the test exercises it statistically over many situations:

```text
in scope for 3E       socialWeight(traits, situation) -> number
out of scope for 3E   concurrency, quotas, priority, dropping, retry   (3F-B)
```

Nothing inside 3E may call it to decide anything. It exists so that §7.1's eligibility inputs are real and checkable before a scheduler exists to consume them, and so that 3F-B inherits a function rather than a paragraph.

Phase 3E is not complete until scripted participants demonstrate all of these without a real provider:

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
3E-0  apply the 3D transcript boundary (§9.3): stop writing an episode per
      utterance, add spokenWith, keep the exactly-once cursor
3E-1  ConversationSession store + lifecycle + tick stage (§2.1)
3E-2  local speech transport integration + act-derived scope
3E-3  legal conversational action menu
3E-4  turn/direct-address wake reasons
3E-5  transcript working window
3E-6  third-party join / leave
3E-7  social-personality guidance hooks + socialWeight() (§17.0)
3E-8  scripted acceptance scenarios + mutation tests
```

3E-0 comes first because it is the only step that *removes* behaviour, and
removing it after the session store exists would mean writing tests against a
contract that is about to change. It is also the only step that touches a phase
already marked complete, so it should land as its own change with its own
mutations rather than inside a larger one.

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
