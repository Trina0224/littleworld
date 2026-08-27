# Pre-3F note — manual real-LLM Brain demo

Status: PARKED — revisit before starting Phase 3F.

## Observation

Phase 3E already exposes almost the complete boundary needed to let a real LLM inhabit a character. We do **not** need Phase 3G provider integration to try the world with actual model judgement.

The engine already decides when a character gets an opportunity and can build that character's private dynamic Brain package:

```text
World / Perception / Memory
        ↓
Floor selects one character
        ↓
buildContext(character)
        ↓
private model-visible suffix + legal choices
        ↓
external intelligence chooses
        ↓
floors.commit() / decline()
```

For an early demo, the external intelligence can simply be ChatGPT or Claude operated manually. The human operator copies one Brain request out of the harness, gives **only that character's package and private stable prefix** to the model, and pastes the model's choice back into the harness.

This is not the scripted participant used by the 3E acceptance run. The model genuinely decides from the package. The only manual part is transport.

## Correct latency semantics

**Do not pause the World Engine for the model, and do not expire the conversational offer because simulation ticks passed.**

The agreed Simulation contract is:

```text
World ticks / deterministic activities continue
        |
Floor has selected character A and waits for A's actual decision
        |
ChatGPT / Claude may take any wall-clock time
        |
A eventually returns speech or `nothing`
        |
only then does this Floor advance to the next conversational decision
```

Provider wall-clock latency is not fictional social time. The Floor waits for the character it asked; the world itself does not freeze.

The manual harness therefore keeps one outstanding request per Floor until the operator returns its answer. If relevant world state invalidates the request (actor leaves, Floor disappears, target becomes invalid), the response may become stale. Merely accumulating simulation ticks never makes it stale.

There is no K=3 conversational batch in this model. The Floor asks one Brain at a time. If that Brain chooses `nothing`, the next ranked eligible character is asked.

This is now the binding correction in `docs/specs/engine/phase-3e-owner-latency-correction.md`.

## Why do this before 3F / 3G

This is a useful architecture/interface test, not merely a toy demo. It can reveal whether a model can actually function as a character while knowing only what the engine intentionally exposes.

Likely discoveries include:

- missing situational information (time of day, posture, current location/state);
- insufficient or excessive conversation transcript;
- appearance descriptions that are too ambiguous for recognition;
- missing legal actions in the menu;
- personality instructions that do not create the intended behaviour;
- accidental canonical-name/entity-id leakage;
- memory/context that makes sense structurally but not to an actual LLM.

Finding these before provider adapters and scheduling exist is cheaper than discovering them after 3G.

## The full Brain request is larger than `buildContext()`

`buildContext()` currently supplies the dynamic private suffix: perception, recognition/memory, conversation and legal choices. A real character Brain also needs its own stable identity prefix.

Conceptually:

```text
PRIVATE STABLE PREFIX
  characters/<id>/self.md
  derived social-personality guidance
  stable shared world/role/tool guidance when implemented

PRIVATE DYNAMIC SUFFIX
  buildContext(...).forModel
  why this character has the floor
  legal choices already supplied by 3E
```

The harness must never substitute `bible.md` for `self.md`. Bible files are author/director material and are forbidden to character Brains.

The social numeric vector remains canonical engine data; before a real Brain demo, the missing prompt-assembly layer should translate relevant social traits into concise natural-language guidance as `social-personality.md` requires.

## Minimal harness idea

Add a thin interactive runner, tentatively:

```text
node src/engine/demo-brain.js
```

The simulation keeps ticking. When a Floor creates an offer, the harness prints a self-contained Brain request and marks it outstanding:

```text
BRAIN REQUEST #12
character: [operator/debug identity only — not part of model-visible world data]

[that character's self.md]
[derived personality guidance]
[private perception]
[private memory]
[conversation transcript]
[why this character received the offer]
[legal choices exactly as supplied by 3E]

request remains pending until a response is pasted
```

The operator may take as long as needed to ask ChatGPT or Claude. Meanwhile other deterministic world activity may continue. The same Floor does not ask its next character until this request is answered or explicitly cancelled by infrastructure/world invalidation.

The pasted response should use the same 3E `pick` + optional speech text contract. The harness must not invent another action language.

## Important isolation rule

A model playing character A receives only A's model-visible package and A's own `self.md`/derived guidance. It must not receive canonical world state, another character's `self.md`, any `bible.md`, other characters' private memory, internal entity ids, or names A has not learned.

Different characters can be assigned manually to different real models (for example ChatGPT and Claude). The World Engine should not care which model supplied a valid response.

## Overheard / newly audible conversation

The manual demo is also a good place to test the owner-decided social opportunity rule:

```text
A + B are already talking
C moves close enough to hear the active conversation
  -> World Engine may ask C once whether C wants to get involved
```

This is the existing `why = overheard` opportunity, bounded to one per observer/source-zone/social-spell.

Moving close must **not** reveal old lines spoken while C was too far away. It creates a current opportunity, not retroactive hearing. If C enters the source zone, ordinary Floor membership takes over automatically; there is no join action.

## First demo scope

Keep the first run small. A useful cast is approximately:

- 星さん / grandma-01
- 渡辺 / man-01
- 澄子 / shopkeeper-01
- 辰 / brother-01
- ハナ / dog-01 (deterministic, not an LLM Brain)

The point is to validate the Brain boundary, not to run all eleven speaking characters at once.

## Boundary with later phases

This harness is intentionally **not** 3F-B and **not** 3G:

- no provider API;
- no concurrency/quota scheduler;
- no retry/backoff policy;
- no automated routing between model vendors;
- no need to make provider latency entertaining.

It is a manual transport adapter around the completed conversation contract. If the experiment works, 3F-B/3G later automate transport, provider policy and budget management without changing the Brain-facing social semantics.

## Replay is a separate clock and editing pass

The manual Simulation may take a long wall-clock time because each chosen Brain is allowed to think. That is fine.

After Simulation, the committed history can be handed as a whole to the presentation/script pass. Replay may retime and compress provider waits/idle spans and build its own audience-facing timeline. It is **not required to reproduce the generation process tick-for-tick**; causal/event/dialogue integrity remains governed by `simulation-replay-architecture.md`.

## Resume point

Before beginning Phase 3F, decide whether to spend a short pass implementing this harness and run at least one real ChatGPT/Claude conversation through the world. Treat any resulting context/menu/privacy defects as interface corrections, not as reasons to optimize Simulation around provider latency.