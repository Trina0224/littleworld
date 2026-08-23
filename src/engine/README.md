# World Engine — Phase 3A

Plain ES modules, no dependencies, no build step. They run under Node today and
in the browser later without change; nothing here imports a host API except the
scenario runner, which reads `anchors.json` from disk.

```bash
node src/engine/run-3a.js
```

## What is here

| File | |
|---|---|
| `clock.js` | integer ticks, and nothing else |
| `rng.js` | seeded random numbers |
| `events.js` | the two streams |
| `world.js` | authoritative state, seats, reservations |
| `activity.js` | the Activity Runtime |
| `run-3a.js` | the scripted scenario, and the checks it has to pass |

## Items 1–4 of the slice

Done: the clock, the Activity Runtime state machine, seats loaded from
`docs/specs/world/anchors.json`, and atomic reservation.

Not done yet, and deliberately: movement (item 5), the recording file and replay
(items 6–7). `sit_and_rest` therefore has no `approach` step — the agents are
spawned beside the bench. Movement inserts a step; it does not change anything
else.

**Nothing outside items 1–4 is here.** No perception, no memory, no zones, no
conversation, no scheduler, no provider adapter — not even a mock one. See
§17.1 of `docs/specs/engine/world-engine-2.5.md` for why that list is a fence
rather than a to-do.

## Three things worth knowing before reading the code

**A step spends the tick it finishes in.** A four-step activity takes at least
four ticks even when nothing waits, and `restTicks` is the waiting part only.

**"Atomic" reservation means one thing here:** only the World Engine touches
`seat.state`, and it reads and writes without yielding. Two agents cannot both
find the same seat free. That is the whole mechanism, and it is enough as long
as the rule holds — the moment anything else mutates a seat, it stops being true.

**A failed step releases what it holds.** An activity that dies holding a
reservation is how a world runs out of seats an hour into a demonstration.

## What the scenario proves

Two brothers want `bench-slot-2` on the same tick.

```
t=2   brother-01 reserves it        brother-02 is refused, falls to idle
t=3   brother-01 sits
t=20  brother-01 releases it
t=30  brother-02 asks again, and gets it
```

Checked automatically: the seat is never occupied twice without a release
between, the loser does get it afterwards, and the same seed produces an
identical fact stream. That last check is weak today — nothing in this scenario
draws from the rng — but it is in place so that it fails on the day something
does.

The refusal is in the audit stream, not the fact stream: nothing changed, so
there is no fact. The fact stream shows one occupation at a time, which is the
same thing said in the only way the renderer can read.
