# Phase 3E — Owner correction: latency, sequential offers, and overheard entry

**Status:** binding correction  
**Created:** 2026-08-26 (`America/Los_Angeles`)  
**Supersedes:** the parallel K>1 offer/`floor_lost` latency optimization and simulation-tick offer expiry in `phase-3e-implementation-structure.md` §3.2/§3.4, the matching parts of `phase-3e-floor-clarifications.md` §3/§5/§7.6/§8.2/§8.4, and any test or README text that treats provider latency as a reason for a conversational offer to expire.

This correction restores the Simulation semantics agreed by the project owner before the offered-floor implementation became over-optimized for live latency.

## 1. Simulation waits for the selected Brain decision; the world does not

Two statements are simultaneously true:

```text
The World Engine never blocks on LLM inference.
The conversational Floor waits for the Brain decision it actually asked for.
```

The distinction is the whole architecture.

While a Brain request is outstanding, deterministic world time and activities may continue. But the Floor does **not** decide that the Brain declined merely because many simulation ticks elapsed.

Provider wall-clock latency is not fictional social time.

```text
Floor selects A
  -> ask A whether A wants to speak
  -> A's Brain may take 2 s, 20 s, or 2 min
  -> world ticks / deterministic activity may continue
  -> the Floor still waits for A's answer

A says something
  -> commit it
  -> recompute the next conversational opportunity from the new world/floor state

A chooses nothing
  -> explicit decline
  -> ask the next ranked eligible character
```

A pending result becomes invalid only because **the relevant world state changed** (for example the actor left, the Floor ceased to exist, the target became invalid, or a later scheduler explicitly dropped/cancelled the request), never merely because a simulation-tick counter reached a deadline.

Provider timeout/retry/drop policy belongs to 3F-B infrastructure. If 3F-B later chooses to drop a request, that is an explicit scheduler outcome, not a timer hidden inside 3E.

## 2. One conversational Brain offer at a time

The open-floor batch optimization is withdrawn.

```text
K = 1
```

3E asks the highest-ranked eligible character first and waits for that character's choice. If that character explicitly declines, 3E asks the next one. A full sequential pass in which everybody declines is one quiet round.

The former K=3 design existed to hide provider latency by generating several counterfactual replies in parallel. Simulation does not need that optimization: it is allowed to take real time to generate history, and Replay is the audience-facing pacing layer.

Consequences:

- provider response order cannot race because only one conversational offer is outstanding per Floor;
- `floor_lost` is no longer part of normal conversation flow;
- generated-but-losing counterfactual utterances disappear from the design;
- the perception provisional-delivery API remains useful for requests explicitly cancelled/dropped before use, but normal sequential Floor resolution settles the one used context as delivered;
- personality ranking still matters: it decides who is asked first, then who is asked next after a decline.

## 3. Silence remains offer-based, not tick-based

The useful part of the offered-floor architecture stays unchanged:

```text
ask ranked character 1 -> nothing
ask ranked character 2 -> nothing
...
all eligible characters declined
  -> quietRounds += 1
  -> quietLimit may make the Floor dormant
```

Silence therefore depends on actual character decisions, not on host/provider latency and not on elapsed ticks.

A Brain that has not answered is **not silence**.

## 4. Moving into audibility creates one optional social opportunity

The existing overheard-nudge idea remains, with one correction.

A character does not need to wait for the next utterance after moving close enough to hear an already-active neighboring conversation.

```text
A + B have an active social Floor in zone Z1
C is outside that Floor
C moves into current ordinary hearing range of the active conversation
  -> C may receive one `why = overheard` opportunity for that source social spell
```

This is a social opportunity, not retroactive perception.

C must **not** receive transcript lines spoken before C could hear them. The Brain package may truthfully communicate that a nearby conversation is in progress through current sensory/social context, while actual words enter C's perception only when C really hears them.

The existing suppression rule remains:

```text
at most one overheard opportunity
per observer + source zone + source social spell
```

Declining does not cause another prompt on the next sentence. A new source social spell may create a new opportunity later.

If C physically enters Z1, no join action is needed: standing in the zone makes C eligible in that Floor's next sequential offer order.

If C remains in another zone, hearing still does not equal Floor membership. Any cross-zone speech/action remains constrained by the legal menu and transport rules.

## 5. Simulation history vs Replay presentation

Simulation generates causal history. Replay is not required to preserve the Simulation's wall-clock waits or tick spacing one-for-one.

The intended pipeline remains:

```text
Simulation recording
  -> whole-record/script presentation pass
  -> Replay presentation timeline
```

The presentation pass may retime, compress idle/provider waits, select spans, and otherwise produce a watchable presentation according to `simulation-replay-architecture.md`. The existing dialogue/event integrity constraints in that document continue to govern what it may rewrite; this correction only makes explicit that **Replay is not a tick-for-tick reproduction of the generation process**.

## 6. Acceptance corrections

The following replace the old latency-oriented tests:

1. An open Floor exposes exactly one Brain offer at a time.
2. If the first character declines, the next ranked eligible character is offered next.
3. An unanswered offer remains outstanding across arbitrarily many simulation ticks and creates no automatic decline/speech.
4. Deterministic movement/activity continues while that offer is outstanding.
5. A physically invalidated outstanding offer may be cancelled without committing its proposal.
6. A character moving into ordinary hearing range of an active neighboring Floor receives at most one overheard opportunity for that source social spell, even before another utterance is spoken.
7. That movement-created opportunity does not retroactively add earlier conversation lines to the observer's transcript/perception.

With this correction, 3E returns to the project-level rule:

> **Simulation may be slow. Causality matters; provider latency does not author the fiction.**