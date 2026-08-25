# World Engine — Phases 3A and 3C

Plain ES modules, no dependencies, no build step. They run under Node today and
in the browser later without change; only the scenario runner touches a host
API, to read the spec files from disk.

```bash
python3 docs/specs/world/navgrid-derive.py    # once, after the painted maps change
node src/engine/run-3a.js
node src/engine/nav.test.js
node src/engine/days.test.js
node src/engine/loop.test.js
node src/engine/perception.test.js
node src/engine/run-3c.js          # shows what a Brain would actually be handed
```

| File | |
|---|---|
| `clock.js` | integer ticks, and which day they fall in |
| `rng.js` | seeded random numbers |
| `resources.js` | the states a claimable thing can be in |
| `events.js` | the two streams |
| `attendance.js` | who is here today |
| `loop.js` | one tick, in the order the spec says |
| `zones.js` | which semantic area a position is in |
| `perception.js` | the sensory boundary between the world and one Brain |
| `placement.js` | semantic destination in, physical position out |
| `nav.js` | A* over the painted walkable map |
| `world.js` | authoritative state, resources, reservations, movement |
| `activity.js` | the Activity Runtime |
| `view.js` | facts → what a renderer draws, and replay |
| `run-3a.js` | the scripted scenario, and the checks it has to pass |
| `nav.test.js` | the one navigation property that is easy to lose |
| `days.test.js` | days, absence, and the schedule that must not move |
| `loop.test.js` | the tick order, and that perception in it moves no fact |
| `perception.test.js` | every leak the 3C spec asks to be proved impossible |
| `run-3c.js` | the acceptance scenario, printed |

## The tick

`phase-3c-perception.md` §2 defines the canonical tick order, and for a while
nothing implemented it: every scenario open-coded its own loop and perception was
called by hand in a demo. `loop.js` is now the one place that owns it.

```
1  advance the integer world clock      5  commit the resulting world facts
2  advance deterministic movement       6  refresh perception for each present agent
3  advance deterministic activities     7  decide whether any agent needs a Brain wakeup
4  update reservations / presence       8  dispatch those requests asynchronously
```

Steps 1–7 never wait for inference. **Step 8 is not here** — it belongs to the
scheduler in 3F, and `onWakeup` is where it attaches. The contract is already
enforced by the shape: the hook is handed a list and its return value is
discarded, so there is nothing for a future implementer to await. `loop.test.js`
proves it by running the same scenario twice with a hook that returns a promise,
and comparing both streams.

Steps 4 and 5 are not separate calls — reservations move because an activity step
moved them, facts commit as they happen. They are named anyway because they are
real stages of the tick even where no line corresponds to them.

**Wiring perception in cannot change a fact,** because perception only ever reads
the two streams. That is a claim, so it is asserted: the same scenario runs with
and without perception and the fact *and* audit streams are compared byte for
byte — over a run that covers movement, reservation, occupancy, release, speech,
day boundaries and activity transitions, so the comparison is evidence rather
than a coincidence of two empty logs.

`speech_said` is a fact, so `view.js` carries it: an utterance shows for a fixed
number of **ticks**, never milliseconds, so a bubble expires at the same instant
live and in replay.

## Perception (3C)

> **The World Engine determines what an agent can perceive. The Agent Brain
> determines what those perceptions mean.**

Four decisions carry it.

**The server knows who; the model is told what it looks like.** Even when the
engine is certain an entity is `pastor-01`, the model-visible observation says
only *身材高瘦、帶明顯西洋輪廓的中年男子…*. Recognition belongs to the character —
to its own self sheet and memory — not to the world's eyes, and that is what
permits uncertainty and honest mistakes. Sanitising is an **allowlist**: the
model-visible object is rebuilt field by field, so a field added to the internal
record later cannot leak by being forgotten.

**Refs point, they do not name — and they are transport, not storage.** Inside one
delivered context the same entity is always the same `seen-N`, so a Brain can say
*approach seen-2* without ever being handed an id. Numbering follows the order the
model reads, never entity id — if `seen-1` always meant "alphabetically first", the
numbering would itself be an identity leak paid out slowly.

A ref is valid for one request and its answer. Anything that outlives that round
trip — an action target, a memory — is **canonicalised at commit**: `canonicalize()`
resolves every ref in the reply to its entity, and the entity is what gets stored.
So memory never holds a ref and never depends on an epoch surviving. The epoch
cache is a transport window; the test shrinks it to a single entry, evicts
everything, and proves a committed record is untouched. A ref that is stale at
commit is reported, never repaired by guessing at somebody nearby.

**A queue, because perception and delivery run at different speeds.** Sensory
state refreshes every tick; a Brain wakes rarely. A sentence spoken two hundred
ticks before the next wakeup is still there. It is not memory and not a message
broker: once an event reaches a successfully built context it counts as
delivered even if inference later fails, so nobody is told the same old
utterance again on every retry. A direct address is never displaced from the
queue by ordinary visual noise.

**Own failure is the one thing taken from audit.** A failed attempt changed
nothing, so it is not a fact and cannot be derived from the fact stream at all.
It reaches the agent that attempted it and nobody else, at any distance. That
*narrows* the audit stream's contract rather than widening it — before this it
had no defined consumer inside the simulation, and the spec quietly needed one.

Zones come from `docs/specs/world/zones.json`, and `zones.js` re-evaluates the
polygons rather than shipping a packed map: a byte per cell is ~300 KB base64
against a few hundred bytes of polygon. Two implementations of one containment
rule is where drift hides, so the JSON carries a 300-position sample the Python
assigned and the test asserts the JS reproduces all of it.

### What the tests prove

Every property in `phase-3c-perception.md` §14 and the clarifications §6, each
one asserted rather than promised. The leak tests run against the **real**
character files: a test with invented appearance strings would still pass if the
engine started reading `bible.md`, so the check that matters takes real sentences
out of a real bible and a real self sheet and asserts none of them appear.

Fifteen mutations were run to confirm the assertions bite — including making
perception append a fact, dropping step 6 from the loop, letting the loop observe
what the wakeup hook returned, and stopping the speech bubble from expiring — — leaking `entityId` into
the visible entry, hearing without distance, broadcasting `own_action_failed` to
bystanders, never marking events delivered, dropping protected events from the
queue, sourcing appearance from `self.md`, canonicalising without recursing,
guessing at a stale ref instead of reporting it, making `canonicalize` a no-op,
and making `releaseEpoch` do nothing. All fifteen failed the suite. One earlier
form of the wakeup mutation hung instead of failing, because returning before the
clock advanced left the run unable to finish; it was replaced with one that fails
cleanly, and the assertion was strengthened to compare audit as well as facts.

**Nothing outside the slice is here.** No perception, no memory, no zones, no
conversation, no scheduler, no provider adapter — not even a mock one. See
§17.1 of `docs/specs/engine/world-engine-2.5.md` for why that list is a fence
rather than a to-do. 3C adds perception and nothing else: no memory, no
conversation, no scheduler, no provider, no ray casting, and no model-generated
prose.

## Five things worth knowing before reading the code

**Seats and stations are one thing.** To a reservation they differ in nothing, so
the events say `resource_reserved`, not `seat_reserved`, and carry `kind`. What
an agent does once it holds one is the Activity Runtime's business.

**Cold start is an invariant of `spawn`, not a courtesy of the caller.** An agent
is never observable without an activity.

**A step spends the tick it finishes in.** A five-step activity takes at least
five ticks even when nothing waits, and `restTicks` is the waiting part only.

**"Atomic" reservation means one thing here:** only the World Engine touches
`resource.state`, and it reads and writes without yielding. Two agents cannot
both find the same seat free. That is the whole mechanism, and it holds exactly
as long as the rule does.

**A failed step releases what it holds.** An activity that dies holding a
reservation is how a world runs out of seats an hour into a demonstration.

## Not being here today

This one came from the cast rather than from the engine. Two characters are
defined by turning up only every so often — the old hand from the main shop
looks in every few visits, the retired stationmaster comes every few days
because the place is lively — and the world had no way to say so. An agent
existed or it did not, and there was no day for it to be absent from.

**The roster is who belongs here; presence is who turned up.** Keeping them
apart is the point: an agent who is not here has not stopped existing, it is
somewhere the scene does not show. `world.roster(id, {at, every})` declares the
habit, `beginDay()` settles who is in, and `agent_arrived` / `agent_departed`
carry it to the renderer. `presentIds()` is what the runtime and the movement
step iterate; `agentIds()` still returns everyone.

**A day is integer division and nothing else.** `ticksPerDay` on the clock,
`day = floor(tick / ticksPerDay)`. There are no dates, months or weekdays —
those would be decisions about the world, not about time. `ticksPerDay: 0`
means the world has no days at all, which is what phase 3A was and still is.

**Attendance is a habit, not dice.** Present when the day lands on the agent's
own phase, rather than a per-day coin flip. A coin clusters: a character meant
to appear "every few days" would vanish for a fortnight and then turn up four
days running. And a retired man dropping in every few days is keeping a habit,
so the periodic model is the more truthful one as well as the better behaved.

**Attendance does not draw from the world's rng, and that is the load-bearing
decision.** `createRng` gives a *stream*, and a stream's values depend on how
many times anyone else has drawn from it — so deciding attendance that way
would make adding one character silently reshuffle everybody else's schedule.
`attendance.js` hashes `(seed, agentId)` instead: the same agent on the same day
of the same seed always gets the same answer, whatever else the run contains.
Determinism across a whole run is what the rng is for; this needs stability
under change, which is a different property.

`days.test.js` runs the same world twice, the second time with one extra agent
rostered, and asserts nobody else's days moved. Swapping the hash for
`rng.next()` fails it exactly as predicted:

```
c-every-6 changed schedule when another agent was added: 1 -> 4
```

**Going home gives the seat back.** Everyone in the test sits for longer than a
day lasts, so the boundary always catches somebody mid-rest. The test states it
as an invariant over every frame rather than as a pairing of events — nothing
may ever be held by someone the renderer is not drawing — and deleting the
release in `depart` fails it:

```
t=240: table-near-1 held by c-every-6, who is not in the scene
```

## Walking

`reserve` comes before `approach` on purpose. Walking across a park and only then
discovering someone took the seat is how agents spend an afternoon achieving
nothing; claiming first makes a refusal cost one tick.

The path is solved once, when the move starts, and written into the
`move_started` fact. Replay follows the recorded path and never opens `nav.js`.

**Smoothing is cost-aware, and has to be.** A* charges backstage cells the
multiplier the world spec gives them and routes around them. String pulling then
asks "could I just walk straight from here to there instead" — and if it asks
only about walkability, the answer is yes, straight back through the cells A*
just paid to avoid. The path comes out looking smoother with the weighting
silently discarded. A shortcut is taken only when it is both clear and no more
expensive than the route A* actually chose, compared against the accumulated
cost A* already computed. `nav.test.js` fails on the walkability-only version
and passes on this one.

Speed is a flat 4 world units per tick — about 1.2 m/s where the bench is, which
is a walk. Flat in world units rather than in metres: making it flat in metres
means scaling by the height ramp, which is a refinement rather than a
correctness problem.

`navgrid.json` exists because the engine has no image decoder. The painted maps
are packed one bit per cell, base64, about 75 KB for both layers — small enough
to ship to the browser with the page.

## What the run proves

```
t=  2  brother-01 reserves bench-slot-2   brother-02 is refused, falls to idle
t=  3  brother-01 starts walking, 8 waypoints, arriving t=80
t= 81  sits
t=123  releases
t=150  brother-02 asks again, and gets it
t=248  releases
t=280  world_ended
```

Checked automatically:

- the seat is never occupied twice without a release between;
- the agent refused at t=2 does get it later;
- somebody actually walked;
- **live and replay produce an identical frame every tick** — the live view is
  fed facts as they are emitted, the replay view is fed the same facts read back
  from `docs/runs/3a-bench.json`, and both run the same `view.js`. The Activity
  Runtime does not run during replay at all;
- the same seed produces an identical fact stream. Weak while nothing draws from
  the rng, and in place so it fails the day something does.

The refusal is in the audit stream, not the fact stream: nothing changed, so
there is no fact. The fact stream says the same thing in the only way a renderer
can read — one occupation at a time.

`world_ended` bounds the recording, so a replay runs to the end of the world
rather than to the last thing that happened to occur.
