# Pre-3F note — manual real-LLM Brain demo

Status: PARKED — revisit before starting Phase 3F.

## Observation

Phase 3E already exposes almost the complete boundary needed to let a real LLM inhabit a character. We do **not** need Phase 3G provider integration to try the world with actual model judgement.

The engine already decides when a character gets an opportunity and can build that character's private Brain package:

```text
World / Perception / Memory
        ↓
Floor offer
        ↓
buildContext(character)
        ↓
private model-visible package + legal choices
        ↓
external intelligence chooses
        ↓
floors.commit() / decline()
```

For an early demo, the external intelligence can simply be ChatGPT or Claude operated manually. The human operator copies one Brain request out of the harness, gives **only that character's package** to the model, and pastes the model's choice back into the harness.

This is not the scripted participant used by the 3E acceptance run. The model genuinely decides from the package. The only manual part is transport.

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

## Minimal harness idea

Add a thin interactive runner, tentatively:

```text
node src/engine/demo-brain.js
```

When the Floor Engine produces an offer, print a self-contained Brain request and pause for input:

```text
BRAIN REQUEST #12

[character's own instructions / social personality]
[private perception]
[private memory]
[conversation transcript]
[why this character received the offer]
[legal choices exactly as supplied by 3E]

Paste Brain response:
>
```

The pasted response should use the same 3E `pick` + optional speech text contract. The harness must not invent another action language.

## Important isolation rule

A model playing character A receives only A's model-visible package and A's own character instructions. It must not receive canonical world state, other characters' private memory, internal entity ids, or names A has not learned.

Different characters can be assigned manually to different real models (for example ChatGPT and Claude). The World Engine should not care which model supplied a valid response.

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
- no need to solve LLM latency for presentation.

It is a manual transport adapter around the already-completed 3E contract. If the experiment works, 3F-B/3G later automate what the human operator was doing without changing the Brain-facing semantics.

## Resume point

Before beginning Phase 3F, decide whether to spend a short pass implementing this harness and run at least one real ChatGPT/Claude conversation through the world. Treat any resulting context/menu/privacy defects as interface corrections, not as reasons to expand 3E's feature scope.