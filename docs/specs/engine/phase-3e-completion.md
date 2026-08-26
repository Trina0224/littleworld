# Phase 3E — Completion Record

**Status: COMPLETE**

Phase 3E is the conversation/social-runtime slice of the world engine. This file is the final completion note; the binding behavior remains defined by `phase-3e-conversation.md`, `phase-3e-implementation-structure.md`, `phase-3e-floor-clarifications.md`, and `phase-3e-pre-floor-corrections.md`.

## What is now implemented

3E-0 through 3E-11 are complete:

- 3E-0 — conversation transcript is not automatic long-term memory; `spokenWith` means actual directed exchange, and overhearing alone is not a meeting.
- 3E-1 — one authoritative audibility predicate; `speech_said.heardBy` is committed at speech time.
- 3E-2 — provisional perception delivery with explicit settlement; losing/cancelled offers restore pending perception without duplicating memory.
- 3E-3 — one offered Floor per semantic zone, including temporary cross-zone direct-address qualification.
- 3E-4 — ranked/batched offers; rank, not provider return order, decides the winner; losing proposals commit nothing.
- 3E-5 — legal silence, dormancy and socially-salient re-arm; overheard nudges are suppressed per observer/source-zone/social-spell rather than per temporary Floor lifetime.
- 3E-6 — observer-specific transcript rendering; hearing a neighboring conversation does not make it part of that observer's conversation transcript.
- 3E-7 — engine-authored action menus and act-derived speech scope; the Brain cannot invent ids, coordinates or transport scope.
- 3E-8 — open-question debt exists only when the target actually heard the question and clears on answer, separation or expiry.
- 3E-9 — deterministic animal interaction (`call_over`, `praise`, `shoo`) with audibility, authored familiarity and deterministic per-event randomness; animals receive no Brain, memory, offer or transcript.
- 3E-10 — social personality ranking is a pure policy fed by real Floor situation (`participants`, `quietRounds`, `roundIndex`, `lastSpeakerWasMe`) through a memory-aware adapter for `withStranger`. Low-drive characters are not "repaired" by the scheduler.
- 3E-11 — scripted end-to-end acceptance plus live/replay equivalence. `animal_responded` is presentation-visible and replayable.

## Final exactly-once correction

The first 3E-11 runner contained an exactly-once assertion that compared two aliases of the same filtered `speech_said` collection. That assertion was tautological: duplicate facts would increase both sides equally.

`src/engine/exactly-once-3e.test.js` is the final regression for this boundary. It drives a real Floor claim through the 3E runtime and requires one authored directed utterance to become:

```text
one winning Floor claim
        ↓
one speech_said fact
        ↓
one Floor transcript entry
        ↓
one spoken encounter
```

It also verifies that ordinary speech does not become an automatic long-term episode.

This regression is authoritative for acceptance item 17.15 and supersedes the tautological count in the original `run-3e.js` acceptance runner until that runner is mechanically cleaned up.

## Acceptance status

The Phase 3E acceptance contract contains **18** items (not 15). The old phrase "fifteen tests" in early comments/document prose is stale wording only; the numbered contract in `phase-3e-conversation.md` contains 18 requirements.

The acceptance coverage is split across the focused engine tests, `run-3e.js`, and `exactly-once-3e.test.js`. In particular it covers persistent zone Floors, no global round-robin, physical membership, legal silence, decline without removal, hearing boundaries, transcript/memory separation, identity safety, act-derived transport, personality asymmetry, provider independence, latency independence, exactly-once speech, free dormancy, rank-over-network ordering, deterministic animal interaction, and live/replay equivalence.

## Architectural boundary after 3E

3E deliberately stops before provider orchestration and cafe business logic.

```text
World / Perception / Memory
          ↓
3E Conversation + Social Runtime     COMPLETE
          ↓
3F-A Cafe / Venue Runtime            NEXT DOMAIN RUNTIME
3F-B Brain Scheduler                 NEXT ORCHESTRATION LAYER
          ↓
3G Real LLM providers
```

3E produces offers and consumes resolved choices. It does not own provider concurrency, quotas, retry, dropping, cost, or latency policy. Those remain 3F-B. Cafe ordering, preparation, delivery and queue behavior remain 3F-A and should reuse the existing menu/commit path rather than create a parallel conversation mechanism.

## Final review note

At completion, the important invariants are:

1. World facts are authoritative; proposals and losing parallel responses are not history.
2. Hearing does not imply Floor membership.
3. Direct address may cross zones only when the target actually heard it.
4. Silence costs no recurring Brain calls once a Floor is dormant.
5. Character personality affects opportunity without forcing a quiet character to become talkative.
6. Private identity/memory remains observer-specific and does not leak canonical ids/names into model-visible context.
7. Replay consumes committed facts and does not need to reproduce provider timing.

With those invariants implemented and covered, Phase 3E is closed. Further behavior changes belong to a later phase unless they repair a demonstrated 3E regression.
