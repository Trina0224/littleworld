# Phase 3C Companion — Venue Interaction Rules

**Status:** design notes / implementation contract supplement  
**Created:** 2026-08-23 22:58 PT (`America/Los_Angeles`)  
**Updated:** 2026-08-23 23:58 PT (`America/Los_Angeles`) — routine cafe service ownership clarified  
**Companion to:** `phase-3c-perception.md`, `world-engine-2.5.md`

This file records decisions that affect perception and later activity/runtime work without expanding Phase 3C into a full cafe simulation.

The central cafe rule is now:

> **Routine commerce is engine-owned; socially meaningful conversation is Brain-owned.**

The shopkeeper's LLM should not be asked to decide or narrate every mechanical shop task.

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

At a suitable Brain wakeup, the dynamic context may tell the customer, in sensory/social terms, that it has been using the cafe for a while and that it would be appropriate to order something if it intends to stay.

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
  -> customer chooses a loud order from current location
  -> broadcast speech fact is committed
  -> cafe runtime recognizes/records the order
  -> routine deterministic service begins
```

The order does not require the customer to walk to the counter unless the customer independently chooses to do so for social reasons.

## 3. Cafe Runtime owns routine service

Routine shop operation belongs to the World Engine / Activity Runtime, not to the shopkeeper Brain.

Once a valid order exists, the runtime should own the ordinary lifecycle:

```text
order received
  -> order queued
  -> shopkeeper workload updated
  -> preparation starts when capacity is available
  -> preparation duration is calculated from menu/runtime data
  -> item becomes ready
  -> serving/delivery activity is scheduled
  -> item delivered
  -> customer venue obligation satisfied
  -> eventual clearing / return-to-workstation
```

The shopkeeper does not need an LLM call to decide whether tea takes time to steep, whether an order goes into a queue, whether a finished item is ready, or whether she should physically carry a completed order to the customer.

Preparation duration should be deterministic runtime data, with optional seeded variation only if later useful. Conceptually:

```text
coffee             fixed/base preparation ticks
black tea           fixed/base preparation ticks
nerikiri / wagashi  fixed/base handling ticks
combined order      derived from item timings / available capacity
```

Exact menu values are deferred until the cafe runtime is implemented.

Routine movement is also engine-owned. A typical service path may be:

```text
counter/workstation
  -> prepare
  -> carry to semantic destination/customer
  -> serve
  -> return to workstation
```

The World Engine chooses the physical path and placement exactly as it does for other activities.

## 4. When the shopkeeper Brain is actually needed

The shopkeeper Brain should be invoked for socially meaningful or open-ended interaction, not mechanical service bookkeeping.

Examples that may require the Brain:

```text
"今天有什麼推薦的？"
"這個和菓子是什麼？"
"最近生意怎麼樣？"
a customer makes a joke or starts a personal conversation
whether to remain and chat briefly after serving
how to respond to unusual/non-menu social requests
```

Examples that should normally stay deterministic/runtime-owned:

```text
accepting an unambiguous menu order
queueing it
preparing it
tracking preparation time
carrying it to the customer
handing it over
collecting finished dishes
returning to the workstation
```

A trivial acknowledgment such as `はい、少々お待ちください` may eventually be a fixed/templated world utterance rather than an LLM request. If richer wording matters in context, the Brain may be used, but ordinary service must not depend on model availability.

This preserves the non-blocking world invariant: a provider outage must not stop the cafe from functioning mechanically.

## 5. Shopkeeper interaction load

The shopkeeper is physically tied to a workstation more than most characters. The world should therefore create believable inbound interactions through venue operation rather than making her periodically initiate unrelated conversation.

Suitable inbound causes include:

```text
new order
additional order / refill
question about today's wagashi
serving / collecting dishes
payment / leaving greeting
```

The World Engine may use shopkeeper activity/load as a scheduling signal for when venue obligations become due. When she is busy, customer grace periods may stretch; when she has been idle for a long time, an already-plausible customer obligation may become eligible sooner. This is workload shaping, not scripted social behavior.

Principles:

> **World Engine creates the social obligation; customer Brain decides how to satisfy it.**
>
> **Cafe Runtime performs routine service; shopkeeper Brain decides socially meaningful language and choices.**

## 6. Implementation sequencing

The cafe runtime is not part of the Phase 3C perception implementation itself, but it should be implemented **before real LLM provider integration**.

Suggested dependency order:

```text
3C   perception / subjective sensory state
3D   private memory
3E   conversation sessions + speech transport
3F-A cafe / venue runtime (deterministic routine commerce)
3F-B scheduler + mock Brain integration
3G   real LLM provider integration
```

The exact phase labels may change, but the dependency matters: routine cafe behavior should already work with scripted/mock decisions before real model behavior is introduced.

## 7. Two special interaction points — recorded for later

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
