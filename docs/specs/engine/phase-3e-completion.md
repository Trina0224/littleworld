# Phase 3E — Completion Record

**Status: COMPLETE, with owner latency correction applied 2026-08-26**

Phase 3E is the conversation/social-runtime slice of the world engine. This file is the final completion note; binding behavior is defined by `phase-3e-conversation.md`, `phase-3e-implementation-structure.md`, `phase-3e-floor-clarifications.md`, `phase-3e-pre-floor-corrections.md`, and the later owner correction `phase-3e-owner-latency-correction.md`.

Where the owner correction conflicts with the earlier parallel-offer/expiry design, **the owner correction wins**.

## What is now implemented

3E-0 through 3E-11 are complete, with the offer-runtime correction noted below:

- 3E-0 — conversation transcript is not automatic long-term memory; `spokenWith` means actual directed exchange, and overhearing alone is not a meeting.
- 3E-1 — one authoritative audibility predicate; `speech_said.heardBy` is committed at speech time.
- 3E-2 — provisional perception delivery with explicit settlement; a context cancelled before use can restore pending perception without duplicating memory.
- 3E-3 — one offered Floor per semantic zone, including temporary cross-zone direct-address qualification.
- 3E-4 — **corrected:** conversational offers are sequential, one Brain at a time. Personality/address/question ranking decides who is asked first; explicit `nothing` advances to the next eligible character. Elapsed simulation ticks never fabricate a decline.
- 3E-5 — legal silence, dormancy and socially-salient re-arm; overheard nudges are suppressed per observer/source-zone/social-spell rather than per temporary Floor lifetime.
- 3E-6 — observer-specific transcript rendering; hearing a neighboring conversation does not make it part of that observer's conversation transcript.
- 3E-7 — engine-authored action menus and act-derived speech scope; the Brain cannot invent ids, coordinates or transport scope.
- 3E-8 — open-question debt exists only when the target actually heard the question and clears on answer or physical separation.
- 3E-9 — deterministic animal interaction (`call_over`, `praise`, `shoo`) with audibility, authored familiarity and deterministic per-event randomness; animals receive no Brain, memory, offer or transcript.
- 3E-10 — social personality ranking is a pure policy fed by real Floor situation (`participants`, `quietRounds`, `roundIndex`, `lastSpeakerWasMe`) through a memory-aware adapter for `withStranger`. Low-drive characters are not "repaired" by infrastructure.
- 3E-11 — scripted end-to-end acceptance plus low-level fact replay equivalence. `animal_responded` is presentation-visible and replayable.

## Owner correction: Simulation latency is not conversation time

The first complete 3E implementation introduced two mechanisms intended to hide provider latency:

```text
open-floor K=3 parallel offers
simulation-tick offer expiry
```

Those mechanisms contradicted the project-level Simulation decision. The project owner reconfirmed the intended model:

```text
Floor selects one Brain
  -> wait for that Brain's actual answer
  -> world/deterministic activities may continue ticking
  -> provider wall-clock delay has no social meaning
  -> speech commits, or explicit `nothing` advances to the next ranked Brain
```

Therefore the parallel batch and automatic tick timeout have been removed from production conversation flow. A pending offer remains pending for arbitrarily many simulation ticks unless relevant world state invalidates it or future 3F-B infrastructure explicitly drops/cancels it.

This preserves the foundational distinction:

> **The World Engine never waits for inference; the conversational decision waits for the Brain it actually asked.**

See `phase-3e-owner-latency-correction.md`.

## Owner correction: newly audible active conversation

The existing overheard-nudge mechanism was also sharpened.

A character who moves into current ordinary hearing range of an already-active neighboring social Floor may receive one `why = overheard` opportunity for that source social spell **without waiting for the next sentence to be spoken**.

This is current social opportunity, not retroactive perception:

- old lines spoken while the observer was too far away remain unheard and absent from the observer's transcript;
- later lines enter perception only if actually heard;
- one observer gets at most one nudge per source-zone/social-spell;
- physically entering the source zone makes the actor an ordinary Floor candidate with no join action.

## Exactly-once correction

The first 3E-11 runner contained an exactly-once assertion that compared two aliases of the same filtered `speech_said` collection. That assertion was tautological: duplicate facts would increase both sides equally.

`src/engine/exactly-once-3e.test.js` is the focused regression for this boundary. It drives a real Floor claim through the 3E runtime and requires one authored directed utterance to become:

```text
one committed Floor choice
        ↓
one speech_said fact
        ↓
one Floor transcript entry
        ↓
one spoken encounter
```

It also verifies that ordinary speech does not become an automatic long-term episode.

## Acceptance status

The old Phase 3E contract contains 18 numbered acceptance items, but several were written around the now-withdrawn parallel-latency optimization. The owner correction replaces those mechanics with stronger, simpler invariants:

1. exactly one conversational Brain offer is outstanding per Floor;
2. explicit decline advances to the next ranked character;
3. unanswered does not mean declined, regardless of elapsed simulation ticks;
4. deterministic world activity may continue while the Floor waits;
5. physical/world invalidation may stale a request, provider latency alone may not;
6. movement into audibility of an active neighboring conversation may create one bounded overheard opportunity without retroactive hearing.

The rest of the 3E acceptance properties remain: persistent zone Floors, no global round-robin, physical membership, legal silence, decline without removal, hearing boundaries, transcript/memory separation, identity safety, act-derived transport, personality asymmetry, provider independence, exactly-once speech, free dormancy, deterministic animal interaction, and fact replay.

## Simulation history vs Replay presentation

The low-level `view.js` replay regression is intentionally strict: feeding the same committed facts through the same view code reproduces the same fact-derived frames. That is an engine correctness test.

It is **not** the final audience presentation contract.

The actual presentation pipeline remains:

```text
Simulation recording
  -> whole-record/script presentation pass
  -> separate presentation timeline
  -> audience Replay
```

That pass may retime and compress provider waits/idle spans and is not required to reproduce Simulation tick spacing one-for-one. Its dialogue/event integrity rules remain defined by `simulation-replay-architecture.md`.

## Architectural boundary after 3E

3E deliberately stops before provider orchestration and cafe business logic.

```text
World / Perception / Memory
          ↓
3E Conversation + Social Runtime     COMPLETE
          ↓
optional pre-3F manual Brain demo    interface validation only
          ↓
3F-A Cafe / Venue Runtime            NEXT DOMAIN RUNTIME
3F-B Brain Scheduler                 NEXT ORCHESTRATION LAYER
          ↓
3G Real LLM providers
```

3E produces one conversational offer and consumes its resolved choice. It does not own provider concurrency, quotas, retry, dropping, cost, or wall-clock timeout policy. Those remain 3F-B. Cafe ordering, preparation, delivery and queue behavior remain 3F-A and should reuse the existing menu/commit boundary rather than create a parallel conversation mechanism.

## Final invariants

1. World facts are authoritative; model proposals are not history until committed.
2. Hearing does not imply Floor membership.
3. Direct address may cross zones only when the target actually heard it.
4. Silence is a completed round of actual declines, never a provider timeout.
5. A pending Brain response may take arbitrary wall-clock time while the world keeps running.
6. Only one conversational Brain is asked at a time on a Floor.
7. Moving into earshot of an active neighboring conversation may create one bounded optional nudge, with no retroactive transcript.
8. Character personality affects opportunity without forcing a quiet character to become talkative.
9. Private identity/memory remains observer-specific and does not leak canonical ids/names into model-visible context.
10. Replay presentation owns its own clock and does not need to reproduce provider waiting or Simulation tick spacing.

With those invariants implemented and covered, Phase 3E remains closed.