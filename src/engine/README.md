# World Engine — Phase 3A

Plain ES modules, no dependencies, no build step. They run under Node today and
in the browser later without change; only the scenario runner touches a host
API, to read the spec files from disk.

```bash
python3 docs/specs/world/navgrid-derive.py    # once, after the painted maps change
node src/engine/run-3a.js
```

| File | |
|---|---|
| `clock.js` | integer ticks, and nothing else |
| `rng.js` | seeded random numbers |
| `resources.js` | the states a claimable thing can be in |
| `events.js` | the two streams |
| `nav.js` | A* over the painted walkable map |
| `world.js` | authoritative state, resources, reservations, movement |
| `activity.js` | the Activity Runtime |
| `view.js` | facts → what a renderer draws, and replay |
| `run-3a.js` | the scripted scenario, and the checks it has to pass |

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

## Walking

`reserve` comes before `approach` on purpose. Walking across a park and only then
discovering someone took the seat is how agents spend an afternoon achieving
nothing; claiming first makes a refusal cost one tick.

The path is solved once, when the move starts, and written into the
`move_started` fact. Replay follows the recorded path and never opens `nav.js`.

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
