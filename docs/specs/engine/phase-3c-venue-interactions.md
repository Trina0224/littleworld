# Phase 3C Companion — Venue Interaction Rules

**Status:** design notes / implementation contract supplement  
**Created:** 2026-08-23 22:58 PT (`America/Los_Angeles`)  
**Companion to:** `phase-3c-perception.md`, `world-engine-2.5.md`

This file records three decisions that affect perception and later activity/runtime work without expanding Phase 3C into a full cafe simulation.

## 1. Cafe use creates a social obligation

The cafe area is not free public seating. Except for the two neighborhood boys (and deterministic dog), an adult or ordinary customer who uses the cafe seating area should eventually order something or leave.

This should be enforced by the World Engine as a lightweight **venue obligation**, not merely written into every character's `self.md`.

The engine may track, conceptually:

```text
entered cafe area
  -> grace period
  -> order_due
  -> order_satisfied
  -> after long dwell: refresh_due
```

The obligation is not meant to fire frequently. Its purpose is to preserve believable Japanese cafe etiquette and to keep the shopkeeper from becoming a stationary character with nothing to do.

The engine should account for shopkeeper load. If the shopkeeper is already talking, preparing food/drink, serving, or otherwise busy, the grace period may be extended and new order pressure may be delayed.

At a suitable Brain wakeup, the dynamic context may tell the agent, in sensory/social terms, that it has been using the cafe for a while and that it would be appropriate to order something if it intends to stay.

Possible responses remain character-driven:

```text
order coffee
order tea
order nerikiri / wagashi
order something else on the fixed menu
leave the cafe area
```

After a long dwell with an empty cup/finished food, a softer `refresh_due` may suggest either ordering again or leaving. It must not force repeat purchasing like a game mechanic.

The park/open garden area and the children's bench are not automatically subject to this cafe-purchase obligation.

## 2. Speech has spatial scope

Speech should support at least two transport scopes:

### Normal speech

Local/proximity-bound. Only agents inside the applicable hearing range receive the spoken content.

### Broadcast / loud speech

Scene-wide for this small venue. All present agents may hear the spoken content unless a later special rule says otherwise.

Broadcast is not a separate social activity; it is a speech transport mode. It should be reserved for contextually appropriate loud utterances, for example:

```text
calling an order from a table
calling the shopkeeper across the small cafe/garden
children shouting across the park
urgent or conspicuously loud calls
```

Ordinary conversation should remain local. The model should not default to broadcast for normal dialogue.

This allows cafe customers to order without walking to the counter every time. The world can stay focused on social interaction rather than unnecessary navigation churn.

A future order flow may therefore be:

```text
venue obligation becomes due
  -> Brain wakeup suggests ordering / leaving
  -> agent chooses a loud order from current location
  -> broadcast speech fact is committed
  -> shopkeeper receives the audible order
  -> deterministic/runtime order handling begins
```

## 3. Shopkeeper interaction load

The shopkeeper is physically tied to a workstation more than most characters. The world should therefore create believable inbound interactions through venue operation rather than making her periodically initiate unrelated conversation.

Suitable inbound causes include:

```text
new order
additional order / refill
question about today's wagashi
serving / collecting dishes
payment / leaving greeting
```

The World Engine may use shopkeeper activity/load as a scheduling signal for when venue obligations become due, but it must not script what a customer says beyond the social requirement being surfaced.

Principle:

> **World Engine creates the social obligation; Agent Brain decides how to satisfy it.**

## 4. Two special interaction points — recorded for later

The current scene contains two additional fixed locations that LLM characters may eventually be allowed to use:

1. **Public telephone**
2. **Drink vending machine**

These are now explicitly part of the future interaction design, but their mechanics are **deferred**. Phase 3C does not need to implement them yet.

When implemented, they should follow the same architecture boundary as other semantic destinations:

```text
Agent Brain chooses semantic intention
  -> "use the public telephone"
  -> "buy a drink from the vending machine"

World Engine / Activity Runtime
  -> resolves exact physical interaction point
  -> moves/places the character if needed
  -> validates availability / occupancy / timing
  -> commits observable facts
```

The LLM should not receive raw coordinates or internal anchor IDs for these objects.

Open questions deliberately deferred:

```text
public telephone:
- who can be called, if anyone
- whether calls are simulated, abstracted, or scripted
- whether other nearby agents can hear only one side of the call

vending machine:
- what drinks exist
- whether payment/inventory matters
- whether it competes with cafe-order obligations
- whether children may use it
```

Do not implement either interaction until the main perception, memory, conversation, and Brain loop are working.
