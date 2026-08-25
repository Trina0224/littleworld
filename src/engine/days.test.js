/**
 * Days, and not being here on one.
 *
 *     node src/engine/days.test.js
 *
 * The cast asked for this before the engine did. Two characters are defined by
 * turning up only every so often, and until now the world had no way to say so:
 * an agent existed or it did not, and there was no day for it to be absent from.
 *
 * Four things are worth a test rather than a reading of the code.
 *
 * ATTENDANCE SURVIVES A NEW CAST MEMBER. This is the one that would have bitten.
 * Drawing attendance from the world's seeded rng looks equivalent and is not: a
 * stream's values depend on how many times anyone else has drawn from it, so
 * adding one character would silently reshuffle everyone else's schedule. The
 * test runs the same world twice, the second time with an extra agent rostered,
 * and asserts the first agent's days are untouched.
 *
 * GOING HOME GIVES THE SEAT BACK. Every agent here sits down for longer than a
 * day lasts, so the day boundary always catches somebody mid-rest. A seat still
 * held by someone who went home is the same leak a half-finished activity would
 * cause, and the world runs out of seats either way.
 *
 * ABSENCE REACHES THE RENDERER. A departed agent leaves the snapshot, because
 * the view is built from facts alone and a renderer is only ever told what to
 * draw.
 *
 * REPLAY STILL MATCHES, ACROSS BOUNDARIES. Same assertion as phase 3A, now with
 * arrivals and departures in the stream.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createActivityRuntime, sitAndRest } from './activity.js';
import { createNav } from './nav.js';
import { createView, replay } from './view.js';
import { attends } from './attendance.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = join(HERE, '..', '..', 'docs', 'specs', 'world');

const TICKS_PER_DAY = 60;
const DAYS = 5;
const DOOR = [200, 250];
const SEATS = ['bench-slot-2', 'bench-slot-1', 'table-near-1'];

// every: 1 is a fixture, 3 is the retired stationmaster's few days, 6 is the
// old hand from the main shop looking in.
const CAST = [
  { id: 'a-fixture', every: 1, seat: SEATS[0] },
  { id: 'b-every-3', every: 3, seat: SEATS[1] },
  { id: 'c-every-6', every: 6, seat: SEATS[2] }
];

function run({ anchors, grid, seed = 20260824, extra = null, onTick }) {
  const nav = createNav(grid);
  const world = createWorld({
    anchors, nav, seed, tickDurationMs: 100, ticksPerDay: TICKS_PER_DAY
  });
  const runtime = createActivityRuntime(world);
  const cast = extra ? [...CAST, extra] : CAST;

  world.start();
  for (const c of cast) world.roster(c.id, { at: [...DOOR], every: c.every });
  world.beginDay();

  // Stops one tick short so the last advance stays inside day DAYS-1. Going all
  // the way would step into a day the run never plays and log a day_started for
  // it, and the trailing onTick below would repeat a tick that already had a
  // frame - which replay, driving one frame per tick, would not.
  const TICKS = TICKS_PER_DAY * DAYS;
  let seen = 0;
  while (world.tick < TICKS - 1) {
    // Anyone here and doing nothing sits down for longer than a day lasts, so
    // the boundary always lands on somebody holding a seat.
    for (const id of world.presentIds()) {
      const agent = world.agents.get(id);
      if (agent.activity.name !== 'idle' || world.walking(id)) continue;
      const seat = cast.find((c) => c.id === id)?.seat;
      if (seat && world.resource(seat)?.holder === null) {
        runtime.assign(id, sitAndRest(seat, TICKS_PER_DAY * 2));
      }
    }
    world.stepMovement();
    runtime.tick();
    if (onTick) onTick(world.log.facts.slice(seen), world.tick);
    seen = world.log.facts.length;
    world.advance();                       // rolls the day over when it is due
  }
  world.stop();
  if (onTick) onTick(world.log.facts.slice(seen), world.tick);
  return world;
}

function main() {
  const anchors = JSON.parse(readFileSync(join(SPEC, 'anchors.json'), 'utf8'));
  const grid = JSON.parse(readFileSync(join(SPEC, 'navgrid.json'), 'utf8'));
  const problems = [];

  // Named seats must exist. The first version of this test used bench-slot-4,
  // which anchors.json does not have, so one of the three agents silently never
  // sat down and a third of the scenario tested nothing. A missing resource is a
  // typo, not a scenario.
  {
    const nav = createNav(grid);
    const probe = createWorld({ anchors, nav, seed: 1 });
    for (const id of SEATS) {
      if (!probe.resource(id)) problems.push(`no such resource: ${id}`);
    }
  }

  const live = createView();
  const liveFrames = [];
  const world = run({
    anchors, grid,
    onTick(fresh, t) {
      for (const e of fresh) live.apply(e);
      live.goto(t);
      liveFrames.push(live.snapshot());
    }
  });
  const facts = world.log.facts;

  // --- days exist, and are integer division ---
  const days = facts.filter((e) => e.type === 'day_started');
  if (days.length !== DAYS) problems.push(`expected ${DAYS} day_started, got ${days.length}`);
  for (const e of days) {
    if (e.day !== Math.floor(e.t / TICKS_PER_DAY)) {
      problems.push(`day_started at t=${e.t} says day ${e.day}`);
    }
  }

  // --- a habit, not dice: on screen exactly on the agent's own cycle ---
  // Measured from the frames, not from arrival facts: an agent who never leaves
  // never arrives again, so counting arrivals would call a fixture absent.
  const daysOnScreen = (frames, id) => {
    const seen = new Set();
    frames.forEach((f, t) => {
      if (f.agents.some((a) => a.id === id)) seen.add(Math.floor(t / TICKS_PER_DAY));
    });
    return [...seen].sort((x, y) => x - y);
  };
  for (const c of CAST) {
    const got = daysOnScreen(liveFrames, c.id);
    const want = [];
    for (let d = 0; d < DAYS; d += 1) if (attends(facts[0].seed, d, c.id, c)) want.push(d);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(`${c.id} was on screen ${JSON.stringify(got)}, policy says ${JSON.stringify(want)}`);
    }
  }
  if (daysOnScreen(liveFrames, 'a-fixture').length !== DAYS) problems.push('the every-1 agent missed a day');
  if (daysOnScreen(liveFrames, 'c-every-6').length >= DAYS) problems.push('the every-6 agent never missed one');

  // --- adding a cast member does not reshuffle anyone else ---
  const withExtra = run({
    anchors, grid,
    extra: { id: 'd-newcomer', every: 2, seat: SEATS[0] }
  });
  const daysIn = (w, id) => {
    const seen = new Set();
    for (const e of w.log.facts) {
      if ((e.type === 'agent_spawned' || e.type === 'agent_arrived') && e.agent === id) {
        seen.add(Math.floor(e.t / TICKS_PER_DAY));
      }
    }
    return [...seen].sort((x, y) => x - y).join(',');
  };
  for (const c of CAST) {
    if (daysIn(world, c.id) !== daysIn(withExtra, c.id)) {
      problems.push(`${c.id} changed schedule when another agent was added: `
        + `${daysIn(world, c.id)} -> ${daysIn(withExtra, c.id)}`);
    }
  }

  // --- going home gives the seat back ---
  // Stated as an invariant over every frame rather than as a pairing of events:
  // nothing may ever be held by someone the renderer is not drawing.
  const departures = facts.filter((e) => e.type === 'agent_departed');
  if (!departures.length) problems.push('nobody ever went home, so nothing was tested');
  const sat = facts.some((e) => e.type === 'resource_occupied');
  if (!sat) problems.push('nobody ever sat down, so the leak was never possible');
  for (const [t, f] of liveFrames.entries()) {
    const onScreen = new Set(f.agents.map((a) => a.id));
    for (const r of f.resources) {
      if (r.holder && !onScreen.has(r.holder)) {
        problems.push(`t=${t}: ${r.id} held by ${r.holder}, who is not in the scene`);
        break;
      }
    }
    if (problems.length && problems[problems.length - 1].startsWith(`t=${t}`)) break;
  }

  // --- absence reaches the renderer ---
  for (const d of departures) {
    const frame = liveFrames[d.t];
    if (frame && frame.agents.some((a) => a.id === d.agent)) {
      problems.push(`${d.agent} departed at t=${d.t} but is still in the snapshot`);
    }
  }
  const absentDay = liveFrames.find((f) => f.agents.length < CAST.length);
  if (!absentDay) problems.push('every frame had the whole cast in it');

  // --- replay still matches, across day boundaries ---
  const replayFrames = [];
  replay(world.log.recording(), { onTick: (f) => replayFrames.push(f) });
  if (liveFrames.length !== replayFrames.length) {
    problems.push(`live ran ${liveFrames.length} frames, replay ${replayFrames.length}`);
  }
  for (let i = 0; i < Math.min(liveFrames.length, replayFrames.length); i += 1) {
    if (JSON.stringify(liveFrames[i]) !== JSON.stringify(replayFrames[i])) {
      problems.push(`live and replay differ at tick ${i}`);
      console.log('\n  live  ', JSON.stringify(liveFrames[i]));
      console.log('  replay', JSON.stringify(replayFrames[i]));
      break;
    }
  }

  // --- same seed, same stream ---
  const again = run({ anchors, grid });
  if (JSON.stringify(facts) !== JSON.stringify(again.log.facts)) {
    problems.push('same seed produced a different fact stream');
  }
  // --- and a different seed moves people to different days ---
  const other = run({ anchors, grid, seed: 7 });
  if (CAST.every((c) => daysIn(world, c.id) === daysIn(other, c.id))) {
    problems.push('changing the seed changed nobody\'s schedule');
  }

  const roll = [];
  for (let d = 0; d < DAYS; d += 1) {
    const who = CAST.filter((c) => attends(facts[0].seed, d, c.id, c)).map((c) => c.id);
    roll.push(`    day ${d}: ${who.join(', ') || '(nobody)'}`);
  }
  console.log(roll.join('\n'));

  console.log('');
  if (problems.length) {
    console.log(`FAILED\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`OK  ${DAYS} days over ${liveFrames.length} ticks; attendance is a habit,`);
    console.log('    survives a new cast member, gives seats back at going-home time,');
    console.log('    leaves the snapshot, and replays identically across every boundary');
  }
  process.exitCode = problems.length ? 1 : 0;
}

main();
