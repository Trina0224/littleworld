/**
 * Phase 3A: clock, activity runtime, canonical resources, atomic reservation,
 * movement, a recording, and replay.
 *
 * There is no LLM here and no mock of one, no perception, no memory, no zones,
 * no conversation, no scheduler (section 17.1).
 *
 *     node src/engine/run-3a.js
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createActivityRuntime, sitAndRest } from './activity.js';
import { createNav } from './nav.js';
import { createView, replay } from './view.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = join(HERE, '..', '..', 'docs', 'specs', 'world');
const RUNS = join(HERE, '..', '..', 'docs', 'runs');

const SEAT = 'bench-slot-2';
const CAFE = [200, 250];                 // in front of the cafe, on the paving

/** The script: what happens, at which tick. Not part of the engine. */
const SCRIPT = [
  { t: 2, agent: 'brother-01', seat: SEAT, rest: 40 },
  { t: 2, agent: 'brother-02', seat: SEAT, rest: 20 },
  { t: 150, agent: 'brother-02', seat: SEAT, rest: 20 }
];

export function runScenario({ anchors, grid, seed = 20260823, ticks = 280, onTick }) {
  const nav = createNav(grid);
  const world = createWorld({ anchors, nav, seed, tickDurationMs: 100 });
  const runtime = createActivityRuntime(world);

  world.start();
  world.spawn('brother-01', [...CAFE]);
  world.spawn('brother-02', [CAFE[0] + 6, CAFE[1]]);

  // The tick order lives in loop.js, not here. What belongs to a scenario is
  // what it injects and when.
  createLoop({ world, runtime }).run(ticks, {
    beforeTick(t) {
      for (const line of SCRIPT.filter((l) => l.t === t)) {
        // An intention is not a fact. Audit stream; the renderer never sees it.
        world.log.note(t, 'intent', {
          agent: line.agent, activity: 'sit_and_rest', target: line.seat
        });
        runtime.assign(line.agent, sitAndRest(line.seat, line.rest));
      }
    },
    onFrame: onTick
  });
  return world;
}

function main() {
  const anchors = JSON.parse(readFileSync(join(SPEC, 'anchors.json'), 'utf8'));
  const grid = JSON.parse(readFileSync(join(SPEC, 'navgrid.json'), 'utf8'));

  // Live: drive a view from facts as they are emitted, and snapshot every tick.
  const live = createView();
  const liveFrames = [];
  const world = runScenario({
    anchors,
    grid,
    onTick(fresh, t) {
      for (const e of fresh) live.apply(e);
      live.goto(t);
      liveFrames.push(live.snapshot());
    }
  });

  mkdirSync(RUNS, { recursive: true });
  const file = join(RUNS, '3a-bench.json');
  writeFileSync(file, JSON.stringify(world.log.recording()));

  // Replay: the same view code, fed from the file, with no runtime running.
  const replayFrames = [];
  replay(JSON.parse(readFileSync(file, 'utf8')), { onTick: (f) => replayFrames.push(f) });

  for (const e of world.log.facts) {
    const { v, t, type, path, ...rest } = e;
    const tail = path ? `${JSON.stringify(rest)} path=${path.length}pts` : JSON.stringify(rest);
    console.log(`  t=${String(t).padStart(3)}  ${type.padEnd(18)} ${tail}`);
  }
  console.log(`\n  audit (${world.log.audit.length}):`);
  for (const e of world.log.audit) {
    const { v, t, type, ...rest } = e;
    console.log(`  t=${String(t).padStart(3)}  ${type.padEnd(18)} ${JSON.stringify(rest)}`);
  }

  const problems = [];
  const occupied = world.log.facts.filter((e) => e.type === 'resource_occupied' && e.resource === SEAT);
  const released = world.log.facts.filter((e) => e.type === 'resource_released' && e.resource === SEAT);
  occupied.forEach((o, i) => {
    if (released.filter((r) => r.t <= o.t).length < i) {
      problems.push(`${SEAT} occupied again with no release between`);
    }
  });
  if (occupied.length !== 2) problems.push(`expected 2 occupations of ${SEAT}, got ${occupied.length}`);
  if (occupied[0]?.by === occupied[1]?.by) problems.push('the loser never got the seat back');
  if (!world.log.facts.some((e) => e.type === 'move_completed')) problems.push('nobody walked anywhere');

  const n = Math.min(liveFrames.length, replayFrames.length);
  if (liveFrames.length !== replayFrames.length) {
    problems.push(`live ran ${liveFrames.length} frames, replay ${replayFrames.length}`);
  }
  for (let i = 0; i < n; i += 1) {
    if (JSON.stringify(liveFrames[i]) !== JSON.stringify(replayFrames[i])) {
      problems.push(`live and replay differ at tick ${i}`);
      console.log('\n  live  ', JSON.stringify(liveFrames[i]));
      console.log('  replay', JSON.stringify(replayFrames[i]));
      break;
    }
  }

  // Weak while nothing draws from the rng, but in place so it fails the day
  // something does.
  const again = runScenario({ anchors, grid });
  if (JSON.stringify(world.log.facts) !== JSON.stringify(again.log.facts)) {
    problems.push('same seed produced a different fact stream');
  }

  console.log('');
  if (problems.length) {
    console.log(`FAILED\n  ${problems.join('\n  ')}`);
  } else {
    console.log(`OK  ${liveFrames.length} ticks; live and replay identical every tick;`);
    console.log(`    seat held once at a time and reused; same seed = same stream`);
    console.log(`    recording: docs/runs/3a-bench.json`);
  }
  process.exitCode = problems.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('run-3a.js')) main();
