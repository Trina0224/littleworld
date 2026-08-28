# Phase 3F — Unified World Runtime, Brain Runtime, and Ambient Bootstrap

**Status:** binding implementation contract — **IMPLEMENTED 2026-08-28**  
**Result:** `src/engine/run-3f.js` is §12 cases 1-14; case 15 is
`docs/notes/third-real-brain-run.md`. New engine files: `ambient.js`, `cafe.js`,
`brain-runtime.js`, and the menu as data in `docs/specs/world/cafe-menu.json`.  
**Created:** 2026-08-27 (`America/Los_Angeles`)  
**Supersedes:** the project-level split between `3F-A` and `3F-B`. From this point forward there is one Phase 3F. Historical documents may still use the old labels; this file wins on sequencing and ownership.  
**Consumes:** `phase-3c-venue-interactions.md`, `cafe-menu-1960.md`, all binding Phase 3E corrections, `simulation-replay-architecture.md`.

Phase 3F is implemented as one coherent milestone. Do not split it into cafe/runtime and scheduler sub-phases. The reason is practical: the first real Brain runs showed that venue knowledge, ambient world knowledge, Brain opportunities, deterministic work, and provider/session transport are one interface boundary in actual use.

The phase goal is:

> **A character can live in the cafe/park, know the ordinary world facts a person standing there would know, make structured choices through a Brain, and have the World Engine carry out routine consequences without inventing missing world state.**

Real provider adapters remain Phase 3G. Phase 3F may use the manual Brain harness and/or mock providers to exercise the complete interface.

---

## 1. World invariant: the playable world is always in daylight

LittleWorld has no day/night cycle in the MVP.

No matter how long the Simulation runs, the visible/social scene remains in a naturally lit daytime period. `ticksPerDay` and attendance/day rollover are simulation bookkeeping and **must not be interpreted as the sun moving through a full 24-hour cycle**.

Binding rules:

```text
- The world never becomes night during the MVP.
- A long Simulation run does not make characters conclude that darkness arrived.
- Grounding must not derive morning/evening/night from tick fraction.
- If a coarse time label is useful, use a configured authored daylight label
  such as 午後 / 白天 / 傍晚前, not a fake clock calculated from ticks.
```

Default for the current scene:

```text
daylight = true
daypart = 午後
```

A future owner decision may change the authored daylight label, but Phase 3F must not create a day/night system to solve this.

---

## 2. One ambient world bootstrap per Simulation run

At Simulation start, the World Engine creates one small public **ambient bootstrap** describing obvious shared conditions that every ordinary human present would naturally know without needing a private memory episode.

Minimum initial fields:

```text
daylight          always true for the MVP
weatherType       e.g. 晴れ / 薄曇り / 曇り / 小雨
ambientTempC      integer or compact numeric value
feltCondition     optional human-readable summary such as 暖かい / 涼しい
surfaceCondition  optional, only when meaningful, e.g. 地面は乾いている
```

Example:

```json
{
  "daylight": true,
  "daypart": "午後",
  "weatherType": "晴れ",
  "ambientTempC": 24,
  "feltCondition": "暖かい",
  "surfaceCondition": "地面は乾いている"
}
```

### 2.1 Generated once, then authoritative

The initial weather/temperature may be selected deterministically from configuration or seed, or supplied by a human director. Once chosen for a run, it becomes authoritative shared world state and is recorded so Replay and debugging know what the run used.

Do not silently mutate weather because many ticks passed. Weather changes are outside MVP scope unless the owner explicitly adds them later.

### 2.2 This is not Private Memory

Ambient bootstrap information is not a memory episode such as "I remember that today was 24°C".

It is simply background world knowledge available when the Brain session starts.

Do not write ambient bootstrap facts into long-term character memory merely so the model can keep seeing them.

---

## 3. World common-sense bootstrap

Simulation engines do not possess the huge body of mundane assumptions a human carries automatically. Phase 3F therefore gives each character a **small common-sense/world bootstrap** once when that character's Brain session begins.

This bootstrap should contain only things that satisfy all three conditions:

1. a normal person physically present would almost certainly know it;
2. the engine/package cannot safely expect the LLM to infer it from mechanics alone;
3. omitting it has already caused or is likely to cause the model to invent world facts.

Examples appropriate to the current world:

```text
- You are in an open/semi-open cafe-and-park environment with natural daylight.
- Nearby normal speech is local; calling across distance requires a carrying voice.
- Chairs are for sitting and tables are surfaces for food/drink; exact resource ids do not exist in your fiction.
- What a venue sells is defined by the venue/menu information you are shown; do not assume unlisted food exists.
- Physical details not present in grounding/perception are unknown rather than invitations to invent vivid details.
```

Do **not** turn this into a generic encyclopedia, social etiquette manual, or massive system prompt. The bootstrap exists to bridge simulation-specific common-sense holes, not to teach a model how humans work.

---

## 4. Bootstrap/session lifetime — say it once

The owner rule is:

> **Tell the character once. If the conversation becomes long and the model later forgets, that is acceptable.**

Therefore ambient/common-sense bootstrap belongs to the **volatile Brain session**, not to every dynamic turn package and not to Private Memory.

Conceptual lifetime:

```text
character Brain session starts
  -> self.md stable identity
  -> personality guidance
  -> world common-sense bootstrap
  -> this run's ambient bootstrap

later Brain opportunities
  -> dynamic private package only
```

If a provider/session implementation naturally keeps the bootstrap in a cached prefix, that is ideal. If context pressure eventually pushes it out, do not continually inject it again merely to guarantee perfect recall.

The manual fresh-context Brain harness is a test instrument and may need to resend the bootstrap on every isolated request because those requests deliberately have no session continuity. That does **not** redefine production semantics.

---

## 5. Dynamic grounding remains separate

The one-time bootstrap does not replace Phase 3E self-grounding.

Every Brain opportunity still receives current dynamic grounding for facts that may change during the run:

```text
where I am
posture / movement
current deterministic activity
what/where I am occupying when meaningful
why the Floor is asking me now
```

For time, dynamic grounding should use the authored daylight/daypart from Phase 3F world state. It must not derive a five-part daily clock from `world.tick / ticksPerDay`.

Ambient bootstrap is "what kind of day/world am I in?"

Dynamic grounding is "what am I doing here right now?"

Private Memory is "what has this person actually remembered from experience?"

Keep those three boundaries separate.

---

## 6. Venue knowledge is world knowledge, not hallucination guard text

The second real Brain run invented `ここのカレー` because a person sitting in a cafe normally knows something about what the cafe sells, while no menu information reached the Brain.

Phase 3F must fix this through authoritative venue grounding.

At minimum, a customer currently using the cafe must be able to know the **available menu for that run** in model-visible form. Use `cafe-menu-1960.md` as the baseline data source, subject to the actual runtime availability rules.

The Brain must not be expected to invent an item and then rely on a rejection loop to learn the menu.

Rules:

```text
- available items shown to the Brain are engine-authored
- ordering acts are selected from engine-authored legal choices
- items not available are not silently mapped to something similar
- routine ordering does not require Shopkeeper Brain judgment
- socially meaningful questions/recommendations may wake the Shopkeeper Brain
```

Do not send internal item ids as fictional prose when a human-readable menu name is available; the choice menu may retain internal refs/ids as validated transport.

---

## 7. Unified cafe/venue runtime

All of the existing requirements in `phase-3c-venue-interactions.md` and `cafe-menu-1960.md` now belong to **Phase 3F**, without an A/B subdivision.

Required runtime responsibilities include:

```text
venue obligation / grace period / refresh due
fixed menu and current availability
engine-authored order choices
semantic action router
order queue
shopkeeper workload/capacity
preparation timing in integer simulation ticks
parallelizable preparation where appropriate
multi-step deterministic nerikiri finishing
order ready / serving / delivered
clearing / ordinary return to work
routine movement/placement owned by World Engine
open-ended shopkeeper interactions routed to a Brain opportunity
```

The central boundary remains:

> **Routine commerce is engine-owned; socially meaningful judgment and language are Brain-owned.**

The World Engine never parses free prose to guess which product was ordered.

---

## 8. Unified Brain runtime and scheduler policy

What older roadmap text called `3F-B` is part of this same Phase 3F.

Phase 3F must provide the runtime seam that consumes Brain opportunities and returns validated Brain decisions while preserving the owner-corrected conversation semantics:

```text
one conversational Brain offer at a time per Floor
selected Brain may take arbitrary wall-clock time
elapsed simulation ticks never fabricate a decline
world/deterministic activity may continue
explicit `nothing` is a valid character decision
```

Infrastructure policy may include:

```text
bounded global/provider concurrency
quota / token / RPM budgets
provider request timeout
limited retry
explicit cancellation
stale-request cancellation when relevant world state invalidates the proposal
explicit drop policy for nonessential opportunities under pressure
```

But all infrastructure outcomes that change history must be explicit/auditable. A provider timeout/drop is not fictional silence merely because a tick counter expired.

Phase 3F may implement this against mock/manual Brain transport. **Real external provider adapters remain Phase 3G.**

---

## 9. Common-sense and ambient recording rules

Anything that can change the resulting world history must be recoverable from the recording or configuration snapshot.

Record at Simulation start at least:

```text
world/bootstrap version
configured daylight/daypart
weather type
temperature
other ambient condition fields actually supplied
menu/runtime availability version or snapshot sufficient to explain legal choices
```

Replay does not need to reproduce the exact generation tick spacing, but it must know the world conditions under which the characters generated the committed history.

---

## 10. Brain package cleanup carried into Phase 3F

The second real Brain run found two interface-quality issues that should be fixed during this phase rather than reopening Phase 3E.

### 10.1 Do not duplicate same-floor speech

If an utterance is already present in the observer's own `conversation` transcript, do not repeat the same full speech as a `speech_heard` entry in `recentPerceivedEvents` for that same package.

Cross-zone overhearing must remain in perception because it is not the observer's conversation.

Do not remove non-speech perceived events merely because a conversation exists.

### 10.2 Conversation identity shape may be normalized if it helps

Current conversation rendering may represent self, known people, and unknown people in different surface shapes. Phase 3F may normalize this into a compact tagged representation if doing so reduces model ambiguity without materially increasing token cost.

This is optional unless real-Brain testing shows a concrete failure. Do not refactor only for aesthetic schema symmetry.

---

## 11. What Phase 3F does not add

Do not expand scope into:

```text
nighttime or a day/night cycle
dynamic weather transitions
full economic simulation
payments/accounting beyond what cafe interaction needs
inventory simulation for every prop
large generic commonsense knowledge bases
real provider-specific adapters
presentation/replay editing UI
```

The current world is deliberately small.

---

## 12. Acceptance contract for completing Phase 3F

Claude or any implementation agent should complete Phase 3F as one batch and prove the integrated path, not merely individual helper functions.

Minimum automated + manual acceptance:

```text
1. A run starts with authored daylight and one recorded ambient weather/temperature state.
2. No amount of simulation-day/tick advancement turns the scene into night or derives a night daypart.
3. A Brain session receives common-sense + ambient bootstrap once as session initialization, not as long-term memory.
4. Dynamic opportunities continue to receive current self-grounding without duplicating the full bootstrap every turn in production-session semantics.
5. A cafe customer sees only actual available menu knowledge and cannot order an invented curry through a legal engine-authored choice.
6. A normal fixed-menu order is accepted deterministically without waking Shopkeeper Brain merely to approve it.
7. Preparation follows configured deterministic timing/capacity, including nerikiri work where applicable.
8. The correct customer receives the prepared order; venue obligation is satisfied; routine shop work returns to a coherent state.
9. An open-ended shopkeeper question routes to a Brain opportunity rather than being guessed by runtime code.
10. The existing 3E direct-address/interject/overheard/privacy contracts still pass unchanged.
11. Same-floor speech is not duplicated in both conversation and recent perceived speech in one Brain package; cross-zone overhearing still appears correctly.
12. A pending conversational Brain request does not expire because simulation ticks pass.
13. Explicit scheduler/provider drop/cancel behavior, if implemented, is auditable and never masquerades as tick-based social silence.
14. A long soak remains deterministic for the same seed + recorded external/bootstrap inputs and does not leak held perception contexts or duplicate ordinary memories.
15. Run at least one real-Brain/manual-provider scenario through the integrated cafe path and inspect whether the character naturally uses the supplied weather, daylight and menu knowledge without inventing venue items or physical conditions.
```

Run the full engine suite and relevant mutation/soak checks after implementation.

---

## 13. Roadmap after this file

The roadmap is now deliberately simple:

```text
3E  conversation / Brain interface complete
 ↓
3F  unified world runtime + cafe + ambient/bootstrap + Brain runtime/scheduler
 ↓
3G  real provider adapters
 ↓
Replay / Presentation completion
```

Do not reintroduce `3F-A`, `3F-B`, or additional alphabetic sub-phases unless the project owner explicitly asks for them.

The intended implementation handoff is therefore:

> **Implement Phase 3F completely in one pass. Build the mundane world knowledge a human would naturally have into the Brain-session bootstrap, keep dynamic self-grounding per opportunity, implement the cafe as deterministic routine commerce with Brain-owned social judgment, and add the bounded Brain runtime/scheduler seam without confusing provider wall-clock latency with fictional time.**