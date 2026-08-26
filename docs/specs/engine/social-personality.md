# Social Personality Vector — conversational behavior

**Status:** implementation contract / character-data baseline  
**Created:** 2026-08-25 (`America/Los_Angeles`)  
**Updated:** 2026-08-25 — offered-floor ranking ownership clarified  
**Companion to:** `character-identity.md`, `phase-3d-memory.md`, `phase-3e-conversation.md`, `phase-3e-implementation-structure.md`, `phase-3e-floor-clarifications.md`

This document defines the stable machine-readable social traits carried by each LLM character.

The purpose is **not** to turn personality into an engine-controlled script. The vector gives the Brain a stable behavioral bias so different characters do not all become the same polite assistant. The Brain still chooses words, topics, meaning, and whether a conversation continues.

> **The vector biases behavior; it does not author dialogue.**

## 1. Where it lives

Each `brain: "llm"` character carries these fields in `character.json`:

```json
{
  "social": {
    "initiative": 0.50,
    "conversationDrive": 0.50,
    "curiosity": 0.50,
    "questionTendency": 0.50,
    "talkativeness": 0.50,
    "socialInhibition": 0.50,
    "persistence": 0.50,
    "responsiveness": 0.50,
    "selfDisclosure": 0.50,
    "topicSwitching": 0.50
  },
  "interests": ["...", "..."]
}
```

All social values are in the inclusive range **0.0–1.0**. There is no requirement that they sum to anything.

These values are stable character data. They are not memory, mood, or current state.

`self.md` remains authored first-person identity prose. Do not duplicate the numeric vector into `self.md` merely to make it visible to the model.

## 2. The ten axes

| Field | High value means |
|---|---|
| `initiative` | readily starts interaction without being invited |
| `conversationDrive` | tends to keep a conversation alive when no one else drives it |
| `curiosity` | genuinely wants to know more about people, events, or ideas |
| `questionTendency` | expresses curiosity by asking questions rather than only observing/listening |
| `talkativeness` | naturally produces more speech and longer contributions |
| `socialInhibition` | hesitates around strangers, embarrassment, or social risk; **high = more inhibited** |
| `persistence` | does not immediately abandon a social thread after one weak response |
| `responsiveness` | readily notices and meaningfully answers what another person just said |
| `selfDisclosure` | readily volunteers personal information, feelings, or opinions |
| `topicSwitching` | readily introduces a new topic instead of staying on the current thread |

These axes are deliberately behavioral. Intelligence, processing speed, literalness, and reflection are **not** encoded here. If needed later, they belong in a separate cognitive-style schema.

## 3. Interests are topic seeds, not mandatory subjects

`interests` is a stable list of things the character naturally notices, enjoys discussing, or can use to open a conversation.

The Brain may combine:

```text
current observation
+ current conversation thread
+ relevant private memory
+ what is known about the other person
+ this character's interests
```

to find a natural topic.

An interest must never force a topic into every conversation. A pastor who likes history does not need to mention history to every customer; a child who likes robots does not need to turn every sentence into robots.

## 4. Runtime / prompt boundary

The canonical source is the numeric vector in `character.json`. The Context Builder should translate it into concise natural-language behavioral guidance rather than dumping unexplained decimals into the model prompt.

For example:

```text
conversationDrive = 0.90
questionTendency = 0.85
socialInhibition = 0.10
```

may become:

> You readily keep a conversation going, often ask natural follow-up questions, and are not very shy with strangers. A short answer does not automatically mean the other person wants to end the conversation.

By contrast:

```text
initiative = 0.15
conversationDrive = 0.30
socialInhibition = 0.85
```

may become:

> You rarely start conversations and are hesitant with unfamiliar people. You can answer when approached, but you do not need to rescue every silence.

The translation layer must preserve differences between characters. Do not flatten everyone into generic instructions such as "be engaging" or "keep the conversation going".

## 5. Conversation design consequence

The cast intentionally contains different social roles:

```text
strong topic starters / rescuers     星のおばあちゃん, 菅野, タツ
listeners who can deepen a thread    草野, 森牧師, 熊田
natural conversational companions    小野, 澄子
characters who usually need a lead   ユキ, タタ
strong social withdrawal             渡辺
```

This asymmetry is a feature. Some conversations should flourish and some should naturally die.

> **The goal is not to prevent silence. The goal is to stop every character from having the same reason for silence.**

## 6. Binding Phase 3E use

`phase-3e-conversation.md`, `phase-3e-implementation-structure.md`, and `phase-3e-floor-clarifications.md` are the active consumers of these traits.

Phase 3E uses the vector in two distinct ways rather than expecting the model to obey raw numbers by itself.

### 6.1 3E owns offered-floor personality ranking

The offered-floor architecture has an immediate consumer for the social vector: the pure deterministic function

```text
socialWeight(traits, situation)
```

used to rank otherwise-eligible characters inside one zone after direct-addressee and open-question priority.

Traits most relevant to that floor ranking include:

```text
initiative
conversationDrive
socialInhibition
persistence
```

Examples:

- high `initiative` raises a character under an genuinely open floor;
- high `conversationDrive` makes that character more likely to be offered an unclaimed conversational opening;
- high `socialInhibition` lowers unsolicited social priority, especially with strangers;
- high `persistence` makes one weak response less likely to push the character toward the bottom of a continuing exchange.

`socialWeight()` belongs to **Phase 3E** because it decides who should get the conversational floor. It must be pure and deterministic: no provider arrival timing, no wall clock, no shared RNG stream, and no hidden mutation.

Low traits are permissions not to act, not defects to repair. In particular, 渡辺's low social drive must remain visible in the ranking rather than being compensated away for UX reasons.

### 6.2 3F-B owns infrastructure scheduling, not a second personality policy

Phase 3F-B owns:

```text
global concurrency
provider/API queues
cross-zone and cross-system request priority
rate limits / quotas
retries and provider timeouts
defer/drop policy under global budget pressure
```

3F-B may delay or decline to service a 3E offer because infrastructure is busy, but it must not silently rerank characters inside a zone with a second social policy.

Conversely, 3E must not grow quota/concurrency logic merely because it creates offers.

> **3E decides who should get the conversational floor. 3F-B decides when infrastructure can service that offer.**

See `phase-3e-floor-clarifications.md` §5 for the binding ownership split.

### 6.3 Brain-facing traits

All ten traits plus `interests` may affect the derived natural-language guidance shown to the Brain.

Examples:

- high `questionTendency` encourages natural follow-up questions;
- high `responsiveness` favors answering what was actually said before changing topic;
- high `topicSwitching` allows a fresh observation or interest to become a new hook;
- low `talkativeness` permits short replies;
- high `selfDisclosure` permits volunteering personal experience more readily;
- low values are permissions to *not* act, not defects to be repaired.

The model should not receive an instruction such as "keep the conversation going" merely because a conversation exists. That would erase the cast distribution this schema exists to preserve.

## 7. Baseline cast values

The initial values are authored from the existing `self.md` characterizations, not generated independently from them. They are stored in each character's own `character.json` and should be reviewed there when a character changes.

The deterministic dog has no social vector. Its behavior remains parameter/state-machine driven.

## 8. Validation expectations

When Phase 3E/3F-B eventually exercises these values, validation should be statistical/behavioral rather than exact-text based.

Useful assertions include:

```text
星さん ranks above 渡辺 under otherwise-equal open-floor conditions
タタ produces less/shorter voluntary speech than 菅野 under equal opportunity
草野 can show high curiosity without becoming a high-initiative speaker
渡辺 remains allowed to let a conversation die
```

If real-model trials later show no meaningful behavioral separation, strengthen the derived guidance or 3E floor weighting. Do not rewrite the characters toward a common middle merely to make the test easier.
