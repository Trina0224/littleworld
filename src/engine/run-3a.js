/**
 * Phase 3A scenario, items 1-4: clock, activity runtime, canonical seats,
 * atomic reservation.
 *
 * There is no LLM here and no mock of one, no perception, no memory, no zones
 * (section 17.1). Two scripted agents want the same bench slot. One gets it,
 * rests, and gives it back; the other is refused and falls to idle, then takes
 * the slot once it is free.
 *
 *     node src/engine/run-3a.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createActivityRuntime, sitAndRest, idle } from './activity.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ANCHORS = join(HERE, '..', '..', 'docs', 'specs', 'world', 'anchors.json');

const SEAT = 'bench-slot-2';

/** The script: what happens, at which tick. Not part of the engine. */
const SCRIPT = [
  { t: 2, agent: 'brother-01', want: sitAndRest, seat: SEAT, rest: 15 },
  { t: 2, agent: 'brother-02', want: sitAndRest, seat: SEAT, rest: 15 },
  { t: 30, agent: 'brother-02', want: sitAndRest, seat: SEAT, rest: 10 }
];

export function runScenario({ seed = 20260823, ticks = 60, anchors }) {
  const world = createWorld({ anchors, seed, tickDurationMs: 100 });
  const runtime = createActivityRuntime(world);

  world.start();
  for (const id of ['brother-01', 'brother-02']) {
    world.spawn(id, [480, 262]);
    runtime.assign(id, idle());          // cold start: everyone has an activity
  }

  while (world.tick < ticks) {
    for (const line of SCRIPT.filter((l) => l.t === world.tick)) {
      // An intention is not a fact. It goes to the audit stream, and the
      // renderer never sees it.
      world.log.note(world.tick, 'intent', {
        agent: line.agent, activity: 'sit_and_rest', target: line.seat
      });
      runtime.assign(line.agent, line.want(line.seat, line.rest));
    }
    runtime.tick();
    world.clock.advance();
  }
  return world;
}

function main() {
  const anchors = JSON.parse(readFileSync(ANCHORS, 'utf8'));
  const world = runScenario({ anchors });

  const show = (rows, title) => {
    console.log(`\n${title}  (${rows.length})`);
    for (const e of rows) {
      const { v, t, type, ...rest } = e;
      console.log(`  t=${String(t).padStart(3)}  ${type.padEnd(18)} ${JSON.stringify(rest)}`);
    }
  };
  show(world.log.facts, 'FACTS   — renderer and replay read this');
  show(world.log.audit, 'AUDIT   — why; the renderer may not read this');

  // --- the two things items 1-4 have to prove
  const problems = [];
  const occupied = world.log.facts.filter((e) => e.type === 'seat_occupied' && e.seat === SEAT);
  const released = world.log.facts.filter((e) => e.type === 'seat_released' && e.seat === SEAT);
  for (let i = 0; i < occupied.length; i += 1) {
    const prevRelease = released.filter((r) => r.t <= occupied[i].t).length;
    if (prevRelease < i) problems.push(`${SEAT} occupied twice without a release between`);
  }
  if (occupied.length !== 2) problems.push(`expected 2 occupations of ${SEAT}, got ${occupied.length}`);
  if (occupied[0]?.by === occupied[1]?.by) problems.push('the loser never got the seat back');

  // Weak today - nothing in this scenario draws from the rng yet - but the
  // check exists from the start so it fails the day something does.
  const second = runScenario({ anchors });
  if (JSON.stringify(world.log.facts) !== JSON.stringify(second.log.facts)) {
    problems.push('same seed produced a different fact stream');
  }

  console.log('');
  console.log(problems.length ? `FAILED\n  ${problems.join('\n  ')}` : 'OK  seat held once at a time, reused after release, same seed = same stream');
  process.exitCode = problems.length ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith('run-3a.js')) main();
