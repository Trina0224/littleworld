# Cafe Menu — circa 1960 Fukushima

**Implemented 2026-08-28** as `docs/specs/world/cafe-menu.json` (the authoritative live availability data) and `src/engine/cafe.js` (the runtime), under `phase-3f.md`. Prep ticks in the JSON are already at `serviceTimeScale` 0.1, and the nerikiri shaping steps are the deterministic work §3 asks for rather than a shelf.

**Status:** menu/runtime design baseline; runtime JSON wins on current availability  
**Created:** 2026-08-24 (`America/Los_Angeles`)  
**Updated:** 2026-08-28 — aligned with current shop definition; no shortcake/cake  
**Companion to:** `phase-3c-venue-interactions.md`, `phase-3f.md`, `replay-presentation.md`

This document defines the initial fictional menu and preparation-time model for the LittleWorld cafe. The historical target is **around 1960 (昭和35年前後), Fukushima**, not an exact reconstruction of one real shop.

The menu is intentionally broad enough to give Agent Brains meaningful choices, while keeping the cafe culturally plausible for the period. The current character/world definition says this shop does **not** sell cake, so `ショートケーキ` is not part of the live menu.

## 1. Time model

The engine clock currently defaults to **100 ms per tick = 10 ticks per real second**. Simulation logic must still store durations in integer ticks rather than wall-clock seconds.

Cafe service should use a configurable **Simulation service-time scale** rather than baking one historical duration into every runtime action.

Initial baseline:

```text
realistic service time × 0.1 = Simulation service duration
```

Equivalent formula at the current 10 ticks/sec clock:

```text
prep_ticks = realistic_seconds × 10 × service_time_scale
service_time_scale = 0.1
```

Example:

```text
3-minute tea steep
180 realistic seconds
→ 180 × 10 × 0.1
→ 180 simulation ticks
→ about 18 wall-clock seconds while the Simulation is running at the current default clock
```

`service_time_scale` must be runtime/config data so the whole cafe can later be sped up or slowed down without rewriting the menu.

**These ticks do not define audience replay duration.** Replay / Presentation may compress deterministic service work, idle gaps, or provider latency according to its own presentation timeline while preserving causal order. See `replay-presentation.md`.

Therefore this menu answers **how long the authoritative Simulation treats work as occupying the shopkeeper/runtime**, not how long a demonstration viewer must watch that work.

## 2. Preparation model

Menu items have a realistic preparation duration and may later expose deterministic preparation steps.

Multiple components of one order are **not automatically serialized**. Work that can overlap should overlap.

Example:

```text
black tea: 180 ticks
nerikiri shaping work: 180 ticks
```

A combined order should not blindly become `360 ticks`. If the shopkeeper can shape the sweet while tea is steeping, the order duration is closer to the critical path plus handling overhead.

The Cafe Runtime owns this scheduling. The shopkeeper Brain does not decide preparation timing.

## 3. Important decision — nerikiri is finished to order

Nerikiri is **not** treated as a fully finished sweet that the shopkeeper merely removes from a case.

The cafe keeps the required base materials prepared in advance — for example prepared nerikiri dough / colored portions and filling — but after an order the shopkeeper may shape and finish the individual piece by hand using traditional small tools.

Conceptual deterministic workflow:

```text
order received
→ take prepared dough / filling
→ select or combine colors if needed
→ wrap filling
→ shape by hand
→ use spatula / triangular shaping tool / small implements for details
→ plate
→ serve
```

This is intentionally a meaningful **Simulation** shopkeeper activity. It gives the stationary shopkeeper deterministic work without requiring an LLM call. Replay does not need a bespoke hand-animation for every shaping step; it only needs enough committed facts to present or summarize what happened later.

Initial time classes after the 0.1 service-time compression:

```text
simple nerikiri       120–180 ticks   (~2–3 realistic minutes)
medium nerikiri       180–240 ticks   (~3–4 realistic minutes)
complex nerikiri      240–300 ticks   (~4–5 realistic minutes)
```

Suggested initial classification:

```text
梅 / 菊                simple
桜 / 朝顔              medium
紫陽花 / 紅葉 / 雪      complex
```

## 4. Menu baseline

Prices are fictionalized around a **50-yen ordinary coffee baseline**, appropriate to the project's circa-1960 atmosphere. They are designed for internal consistency rather than strict historical price reconstruction.

### 4.1 Coffee

| ID | Menu name | Price | Realistic prep | Initial prep ticks |
|---|---|---:|---:|---:|
| `coffee_house` | 珈琲（ハウスブレンド） | 50円 | ~2 min | 120 |
| `coffee_mocha` | モカ | 55円 | ~2 min | 120 |
| `coffee_kilimanjaro` | キリマンジャロ | 60円 | ~2 min | 120 |
| `coffee_blue_mountain` | ブルーマウンテン | 70円 | ~2 min | 120 |
| `coffee_milk` | ミルク珈琲 | 55円 | ~2.5 min | 150 |

### 4.2 Black tea

| ID | Menu name | Price | Realistic prep | Initial prep ticks |
|---|---|---:|---:|---:|
| `tea_ceylon` | セイロン紅茶 | 40円 | ~3 min | 180 |
| `tea_darjeeling` | ダージリン | 45円 | ~3 min | 180 |
| `tea_assam` | アッサム | 45円 | ~3.5 min | 210 |
| `tea_milk` | ミルク紅茶 | 45円 | ~3.5 min | 210 |
| `tea_lemon` | レモン紅茶 | 45円 | ~3 min | 180 |

### 4.3 Japanese tea

| ID | Menu name | Price | Realistic prep | Initial prep ticks |
|---|---|---:|---:|---:|
| `tea_sencha` | 煎茶 | 25円 | ~1.5 min | 90 |
| `tea_hojicha` | ほうじ茶 | 20円 | ~1.5 min | 90 |
| `tea_matcha` | 抹茶 | 40円 | ~1.5 min | 90 |

### 4.4 Fukushima / traditional wagashi

| ID | Menu name | Price | Service handling | Initial prep ticks |
|---|---|---:|---:|---:|
| `wagashi_usukawa_manju` | 薄皮饅頭 | 20円 | plate | 30 |
| `wagashi_yubeshi` | 家伝ゆべし | 25円 | plate | 30 |
| `wagashi_awa_manju` | あわ饅頭 | 20円 | plate | 30 |
| `wagashi_yokan` | 羊羹 | 25円 | cut + plate | 45 |
| `wagashi_monaka` | 最中 | 20円 | plate | 30 |
| `wagashi_dorayaki` | どら焼 | 25円 | plate | 30 |

### 4.5 Nerikiri — shaped/finished after ordering

| ID | Menu name | Price | Complexity | Initial prep ticks |
|---|---|---:|---|---:|
| `nerikiri_ume` | 練切・梅 | 30円 | simple | 150 |
| `nerikiri_kiku` | 練切・菊 | 30円 | simple | 150 |
| `nerikiri_sakura` | 練切・桜 | 30円 | medium | 210 |
| `nerikiri_asagao` | 練切・朝顔 | 30円 | medium | 210 |
| `nerikiri_ajisai` | 練切・紫陽花 | 30円 | complex | 270 |
| `nerikiri_momiji` | 練切・紅葉 | 30円 | complex | 270 |
| `nerikiri_yuki` | 練切・雪 | 30円 | complex | 270 |

### 4.6 Limited western sweets

Western sweets exist in the period, but this shop is not a modern pastry cafe and **does not sell cake**.

| ID | Menu name | Price | Service handling | Initial prep ticks |
|---|---|---:|---:|---:|
| `western_castella` | カステラ | 30円 | slice/plate | 30 |
| `western_choux` | シュークリーム | 35円 | plate | 30 |

`ショートケーキ` was removed from the live runtime on 2026-08-28 because it contradicted the current shop definition. Do not restore it merely because an older revision of this file listed it.

### 4.7 Light food / cold drinks

| ID | Menu name | Price | Realistic prep | Initial prep ticks |
|---|---|---:|---:|---:|
| `food_toast` | トースト | 35円 | ~3 min | 180 |
| `drink_milk` | 牛乳 | 25円 | ~20 sec | 20 |
| `drink_calpis` | カルピス | 30円 | ~45 sec | 45 |
| `drink_cider` | サイダー | 35円 | ~20 sec | 20 |

## 5. Runtime requirements derived from this menu

The implemented Cafe Runtime supports fixed menu validation, service-time scaling, integer tick durations, parallelizable preparation, shopkeeper capacity, multi-step nerikiri shaping, serving and clearing.

The runtime emits committed facts sufficient for Replay to explain routine commerce without parsing dialogue. In particular, `order_placed` is authoritative even if the natural-language sentence accompanying the structured order does not name the item.

Replay may collapse several preparation facts into a shorter presentation beat as long as the order is not shown as served before it was prepared.

## 6. Brain boundary

A customer Brain chooses what to order through an engine-authored structured choice plus natural speech. The Cafe Runtime decides whether the item exists, how long it takes, how the work is scheduled, and when it is served.

The shopkeeper Brain is **not** invoked merely because a nerikiri takes several steps. Those steps remain deterministic routine commerce.

The shopkeeper Brain is reserved for socially meaningful interaction such as recommendation, explanation, unusual requests, jokes or conversation.
