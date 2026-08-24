# World Engine — Phase 3A, plus days

Plain ES modules, no dependencies, no build step. They run under Node today and
in the browser later without change; only the scenario runner touches a host
API, to read the spec files from disk.

```bash
python3 docs/specs/world/navgrid-derive.py    # once, after the painted maps change
node src/engine/run-3a.js
node src/engine/nav.test.js
node src/engine/days.test.js
```

| File | |
|---|---|
| `clock.js` | integer ticks, and which day they fall in |
| `rng.js` | seeded random numbers |
| `resources.js` | the states a claimable thing can be in |
| `events.js` | the two streams |
| `attendance.js` | who is here today |
| `nav.js` | A* over the painted walkable map |
| `world.js` | authoritative state, resources, reservations, movement |
| `activity.js` | the Activity Runtime |
| `view.js` | facts → what a renderer draws, and replay |
| `run-3a.js` | the scripted scenario, and the checks it has to pass |
| `nav.test.js` | the one navigation property that is easy to lose |
| `days.test.js` | days, absence, and the schedule that must not move |

**Nothing outside the slice is here.** No perception, no memory, no zones, no
conversation, no scheduler, no provider adapter — not even a mock one. See
§17.1 of `docs/specs/engine/world-engine-2.5.md` for why that list is a fence
rather than a to-do.

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
