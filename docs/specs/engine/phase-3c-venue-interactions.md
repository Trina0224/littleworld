# Phase 3C Companion — Venue Interaction Rules

**Superseded on sequencing and ownership by `phase-3f.md`** (2026-08-28), which merges what this file calls 3F-A and 3F-B into one Phase 3F. The venue rules below are still binding; only the phase labels changed.

**Status:** design notes / implementation contract supplement  
**Created:** 2026-08-23 22:58 PT (`America/Los_Angeles`)  
**Updated:** 2026-08-24 00:12 PT (`America/Los_Angeles`) — cafe runtime promoted to mandatory pre-provider milestone  
**Companion to:** `phase-3c-perception.md`, `world-engine-2.5.md`

This file records decisions that affect perception and later activity/runtime work without expanding Phase 3C into a full cafe simulation.

> **DO NOT FORGET:** the Cafe / Venue Runtime described here is a required implementation milestone. It is deliberately *not* part of Phase 3C, but it **must be completed and tested before real LLM provider integration**. Do not skip from perception/memory/conversation directly to live model providers.

The central cafe rule is:

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

Ordinary conversation should remain local.

> **Decided** (`pacing-and-latency.md` §2): **scope is derived from the act, not
> declared by the model.** An instruction not to default to broadcast is a rule
> aimed at a model, and in a 640×360 scene broadcast always works, so a model
> will find it — at which point everyone hears everything and the distance model
> built and tested in 3C silently stops mattering.
>
> The teaching is the act vocabulary itself. The model receives a menu of acts
> and only some of them carry (`order`, `call_across_park`, `raise_voice`);
> `greet`, `ask`, `reply` and `chat` stay local. There is no `scope` field to
> set, so there is no instruction to forget. This is the same rule §9.1 of the
> perception spec already applies to movement: the Brain chooses the social act,
> the World Engine chooses its physical extent.
>
> Deferred to 3F-A because it needs the act vocabulary. Available cheaply before
> then: `world.say()` takes an act instead of a `scope`.

This allows cafe customers to order without walking to the counter every time. The world can stay focused on social interaction rather than unnecessary navigation churn.

The order does not require the customer to walk to the counter unless the customer independently chooses to do so for social reasons.

## 3. Structured social action accompanies speech — decided

The World Engine must **not parse arbitrary natural-language speech to guess whether a customer has placed an order or whether the shopkeeper Brain should be invoked**.

When an Agent Brain intentionally performs a venue-relevant social act, its structured output should contain two logically separate channels:

```text
speech          what people in the world actually hear
social_action   server-private execution intent
```

Example — ordinary order:

```json
{
  "speech": {
    "text": "すみません、紅茶をお願いします。",
    "scope": "broadcast"
  },
  "social_action": {
    "type": "order",
    "item": "black_tea"
  }
}
```

The speech becomes an observable/audible world fact according to its transport scope. `social_action` is server-private control data: other characters do not hear or perceive it.

The runtime therefore does not need NLP to infer that `紅茶をお願いします` means `black_tea`. The Brain has already expressed its semantic intention in structured form.

> **Refinement — the Brain selects, it does not author.** Asking a model to
> construct a schema has a failure rate; asking it to pick from a list the engine
> just sent does not, because the engine validates against the list it supplied
> and an invalid choice is impossible by construction.
>
> So the request carries the legal actions for this moment:
>
> ```text
> [ order:coffee_house, order:tea_ceylon, ask_shopkeeper:recommendation,
>   leave, nothing ]
> ```
>
> and the reply is **one choice plus free prose**. The engine builds the
> `social_action` from the chosen item — the model never writes a structure.
> `nothing` is always present and always legal, and its fallback is the one the
> architecture already has: continue the current deterministic activity.
>
> This strengthens rather than weakens the rule above. A selection is not natural
> language parsing; it is a discrete choice, so §4.3's ban on repairing invalid
> structured data by guessing from the speech text still holds and now has almost
> nothing left to guess about.
>
> **The list and the act vocabulary of §2 are the same object.** Which acts carry
> a voice, and which actions are legal right now, are two views of one menu.

This pattern is not cafe-specific. Future public-telephone, vending-machine, payment and other world interactions may use the same boundary: natural language for the fiction, structured semantic action for execution.

## 4. Deterministic semantic router — decided

Venue-relevant structured actions pass through a deterministic semantic router before any second Brain is considered.

The routing question is:

> **Can the authoritative domain/runtime model completely and safely handle this action without a socially meaningful judgment?**

If yes, execute it deterministically. If no, escalate to the appropriate Brain.

Conceptually:

```text
Customer Brain
     |
     +-- speech --------------------> committed audible fact
     |
     +-- structured social_action
                    |
                    v
             semantic router
               /         \
      deterministic       social/open-ended
           |                    |
      Cafe Runtime       wake Shopkeeper Brain
           |                    |
           +---------+----------+
                     v
              committed facts
```

### 4.1 Actions normally handled without the shopkeeper Brain

Examples:

```text
order a valid fixed-menu item
cancel an order when cancellation is still legal
request a bill / finish service
routine thanks / service acknowledgment
supported fixed modifiers already represented in the menu schema
```

Example:

```json
{
  "type": "order",
  "item": "coffee"
}
```

If `coffee` is a valid menu item, the Cafe Runtime can create and queue the order immediately. The shopkeeper Brain is not invoked merely to accept it.

### 4.2 Actions that normally escalate to the shopkeeper Brain

Examples:

```text
ask for today's recommendation
ask what a wagashi is
start personal/small-talk conversation with the shopkeeper
make an unusual request not represented by the menu/runtime schema
ask an open-ended question whose answer belongs to the shopkeeper character
```

Example:

```json
{
  "speech": {
    "text": "今日は何がおすすめですか？",
    "scope": "broadcast"
  },
  "social_action": {
    "type": "ask_shopkeeper",
    "topic": "recommendation"
  }
}
```

The router knows that this is not a complete executable order and schedules a shopkeeper Brain wakeup.

### 4.3 Validation failure is not permission to guess

If a structured action is syntactically valid but cannot be executed, the runtime must not invent a nearby interpretation.

Example:

```json
{
  "type": "order",
  "item": "unknown_item"
}
```

Possible deterministic outcomes include:

```text
reject action and return an order-needs-clarification event
surface that the requested item is unavailable
request a new customer decision
escalate to the shopkeeper Brain if the situation is genuinely social/ambiguous
```

The exact policy may depend on the failure class, but **invalid structured data must never be repaired by silently guessing from the speech text**.

## 5. Cafe Runtime owns routine service

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

## 6. When the shopkeeper Brain is actually needed

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

## 7. Shopkeeper interaction load

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
>
> **Speech expresses the fiction; structured social actions drive deterministic execution.**

## 8. Mandatory implementation sequencing / handoff checkpoint

This section is a **project checkpoint**, not a suggestion.

The Cafe / Venue Runtime is intentionally deferred while Phase 3C perception, private memory, and conversation/speech transport are built. However, after those dependencies exist, the project **must return to this document and implement the Cafe Runtime before connecting any real LLM provider**.

Required order:

```text
3C   perception / subjective sensory state
     ↓
3D   private memory
     ↓
3E   conversation sessions + speech transport
     ↓
3F   UNIFIED WORLD RUNTIME — one phase, see phase-3f.md
     - venue obligation / grace / refresh_due
     - structured social_action schema
     - deterministic semantic router
     - fixed menu/runtime validation
     - order queue
     - preparation timing
     - shopkeeper workload shaping
     - deterministic preparation / serving / clearing
     - deterministic routine shopkeeper movement
     ↓
     (what this file called 3F-B is part of the same 3F)
     ↓
3G   REAL LLM PROVIDER INTEGRATION
```

### 8.1 Gate

**3G is blocked until 3F has an automated scripted/mock acceptance test.**
That test is `src/engine/run-3f.js` and it passes; the gate below is met.

The minimum Cafe Runtime acceptance test must demonstrate, without any real LLM:

```text
customer enters/uses cafe seating
  -> venue obligation eventually becomes due
  -> scripted/mock customer emits speech + structured order
  -> semantic router accepts the fixed-menu order without waking shopkeeper Brain
  -> order is queued
  -> deterministic preparation consumes the configured ticks
  -> shopkeeper serves the correct customer/semantic destination
  -> venue obligation becomes satisfied
  -> shopkeeper returns to ordinary work state
```

A second path must demonstrate that an open-ended action such as `ask_shopkeeper:recommendation` is **routed for a future shopkeeper Brain wakeup rather than treated as deterministic commerce**.

Anyone resuming this project — project owner, ChatGPT, Claude, or another implementation agent — should treat this section as the handoff reminder. If 3E is complete and the next proposed task is direct real-provider integration, **stop and implement 3F first**.

> **The A/B split is retired.** `phase-3f.md` supersedes it: there is one Phase
> 3F, and it is implemented. Do not reintroduce `3F-A`, `3F-B` or further
> alphabetic sub-phases.

## 9. Future structured-action examples

The same semantic-action routing pattern should later be reusable for other deterministic world affordances.

Conceptually:

```json
{"type":"use_public_phone"}
{"type":"buy_vending_drink","item":"ramune"}
{"type":"request_bill"}
```

The Brain may accompany those actions with natural speech or remain silent as appropriate. The World Engine resolves the physical interaction and deterministic mechanics.

## 10. Two special interaction points — recorded for later

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
