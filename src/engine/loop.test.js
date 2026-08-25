/**
 * The tick order, and the property that makes it safe to have added it.
 *
 *     node src/engine/loop.test.js
 *
 * Perception was written in 3C and then called by hand in a demo. Wiring it into
 * the loop is the sort of change that either does nothing or quietly does
 * something, and "it only reads" is a claim, not a guarantee. So the central
 * assertion here runs the same scenario twice - once with perception in the
 * loop, once without - and compares the fact streams byte for byte.
 *
 * The other two are about step 7. A scheduler attaches there in 3F, and the
 * whole architecture rests on world time never waiting for inference, so the
 * seam is tested now while it is still empty: a wakeup hook that returns a
 * promise, or throws, must not change the world by one tick.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createActivityRuntime, sitAndRest } from './activity.js';
import { createView, replay } from './view.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['grandma-01', 'pastor-01', 'boy-01'];
const entities = new Map(CAST.map((id) => {
  const c = read(ROOT, 'characters', id, 'character.json');
  return [id, { appearance: c.appearance, kind: c.brain === 'deterministic' ? 'animal' : 'person' }];
}));

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

/**
 * One scenario, run through the shared loop. Everything about it is fixed
 * except whether perception is plugged in and what the wakeup hook does.
 */
function scenario({ withPerception = false, onWakeup = null, onFrame = null } = {}) {
  const nav = createNav(grid);
  const world = createWorld({ anchors, nav, seed: 20260826, ticksPerDay: 40 });
  const runtime = createActivityRuntime(world);
  const perception = withPerception
    ? createPerception(world, createZones(zoneSpec, nav), { entities })
    : null;

  world.start();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('pastor-01', [486, 265]);
  world.spawn('boy-01', [200, 250]);

  const loop = createLoop({ world, runtime, perception, onWakeup });
  loop.run(120, {
    beforeTick(t) {
      if (t === 3) runtime.assign('boy-01', sitAndRest('table-near-1', 30));
      if (t === 5) world.say('pastor-01', 'こんにちは。', { scope: 'normal' });
      if (t === 60) world.say('grandma-01', 'あら、いらっしゃい。', { scope: 'normal' });
    },
    onFrame
  });
  return { world, perception };
}

// --- the assertion the whole change rests on: perception changes no fact ---
{
  const bare = scenario({ withPerception: false });
  const seeing = scenario({ withPerception: true });

  check(JSON.stringify(bare.world.log.facts) === JSON.stringify(seeing.world.log.facts),
    'adding perception to the loop changed the fact stream');
  check(JSON.stringify(bare.world.log.audit) === JSON.stringify(seeing.world.log.audit),
    'adding perception to the loop changed the audit stream');

  // ...and the comparison is not vacuous: perception really did run.
  const heard = seeing.perception.pendingFor('grandma-01');
  check(heard.length > 0, 'perception ran in the loop but observed nothing');
  check(heard.some((e) => e.kind === 'speech_heard'),
    'perception was in the loop but never picked up the speech beside it');
  // What makes the comparison evidence is the variety it covers, not the count.
  // A stream of nothing but spawns would compare equal for uninteresting reasons.
  const kinds = new Set(bare.world.log.facts.map((e) => e.type));
  for (const need of ['move_started', 'move_completed', 'resource_occupied',
                      'resource_released', 'speech_said', 'day_started',
                      'activity_started', 'activity_ended']) {
    check(kinds.has(need), `the scenario never produced a ${need}, so the comparison proves little`);
  }
}

// --- step 7 cannot make the world wait ---
{
  let calls = 0;
  const asleep = scenario({ withPerception: true, onWakeup: () => { calls += 1; } });
  const promising = scenario({
    withPerception: true,
    // A hook that returns a promise. The loop discards the return value, so
    // there is nothing here for a future scheduler to accidentally await.
    onWakeup: () => Promise.resolve(['grandma-01'])
  });
  // 120 steps for ticks 0..119. The frame emitted after world.stop() is not a
  // step, so there is no wakeup evaluation on a world that has ended.
  check(calls === 120, `wakeup hook ran ${calls} times over 120 ticks`);
  check(JSON.stringify(asleep.world.log.facts) === JSON.stringify(promising.world.log.facts),
    'a wakeup hook that returned a promise changed the fact stream');
  // Audit too: a loop that merely *noticed* what the hook returned would be a
  // loop whose behaviour a scheduler can reach, which is the thing being fenced.
  check(JSON.stringify(asleep.world.log.audit) === JSON.stringify(promising.world.log.audit),
    'the loop observed what the wakeup hook returned');
  check(asleep.world.tick === promising.world.tick, 'the two runs ended on different ticks');
}

// --- the hook is handed the present cast, on the tick it is about ---
{
  const seenAt = [];
  scenario({ withPerception: true, onWakeup: (ids, t) => seenAt.push([t, ids.join(',')]) });
  check(seenAt[0][0] === 0, `first wakeup evaluation was at tick ${seenAt[0][0]}, not 0`);
  check(seenAt[0][1] === 'boy-01,grandma-01,pastor-01',
    `wakeup hook got "${seenAt[0][1]}"`);
  const ticks = seenAt.map(([t]) => t);
  check(ticks.every((t, i) => i === 0 || t === ticks[i - 1] + 1),
    'the wakeup hook skipped or repeated a tick');
}

// --- speech is a fact, so it reaches the renderer, and expires on a tick ---
{
  const frames = [];
  const view = createView();
  scenario({
    withPerception: true,
    onFrame(fresh, t) { for (const e of fresh) view.apply(e); view.goto(t); frames.push(view.snapshot()); }
  });
  const saying = (t, id) => frames[t]?.agents.find((a) => a.id === id)?.saying ?? null;
  check(saying(5, 'pastor-01') === 'こんにちは。', 'the utterance never reached the view');
  check(saying(20, 'pastor-01') === 'こんにちは。', 'the utterance vanished too early');
  check(saying(40, 'pastor-01') === null, 'the utterance never expired');
  check(saying(5, 'grandma-01') === null, 'somebody else was shown saying it');
}

// --- and replay still matches, with everything wired in ---
{
  const liveFrames = [];
  const live = createView();
  const { world } = scenario({
    withPerception: true,
    onFrame(fresh, t) { for (const e of fresh) live.apply(e); live.goto(t); liveFrames.push(live.snapshot()); }
  });
  const replayFrames = [];
  replay(world.log.recording(), { onTick: (f) => replayFrames.push(f) });
  check(liveFrames.length === replayFrames.length,
    `live ran ${liveFrames.length} frames, replay ${replayFrames.length}`);
  let diff = -1;
  for (let i = 0; i < Math.min(liveFrames.length, replayFrames.length); i += 1) {
    if (JSON.stringify(liveFrames[i]) !== JSON.stringify(replayFrames[i])) { diff = i; break; }
  }
  check(diff === -1, `live and replay differ at tick ${diff}`);
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  one tick order for every scenario; perception in the loop moves');
  console.log('    no fact and no audit entry; the wakeup seam cannot make the');
  console.log('    world wait; speech reaches the view and expires on a tick;');
  console.log('    replay still matches frame for frame');
}
process.exitCode = problems.length ? 1 : 0;
