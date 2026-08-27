/**
 * Owner correction regression: current movement into earshot of an already-live
 * neighboring conversation creates one optional overheard opportunity without
 * retroactively delivering the old line.
 *
 *   node src/engine/overheard-movement.test.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createFloors } from './floors.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const ids = ['grandma-01', 'brother-01', 'shopkeeper-01'];
const entities = new Map();
const minds = new Set(ids);
for (const id of ids) {
  const c = read(ROOT, 'characters', id, 'character.json');
  entities.set(id, { appearance: c.appearance, kind: 'person' });
}

const nav = createNav(read(SPEC, 'navgrid.json'));
const zones = createZones(read(SPEC, 'zones.json'), nav);
const world = createWorld({ anchors: read(SPEC, 'anchors.json'), nav, zones, seed: 20260826 });
const perception = createPerception(world, zones, { entities });
const floors = createFloors(world, zones, perception, { minds });
const loop = createLoop({ world, runtime: createActivityRuntime(world), perception, floors });
world.start();

const TABLE_A = [227, 235];
const TABLE_B = [232, 238];
const FAR = [500, 270];
const COUNTER_EDGE = [235, 190];
const LINE = 'まだ遠くで話している';
const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

world.spawn('grandma-01', TABLE_A);
world.spawn('brother-01', TABLE_B);
world.spawn('shopkeeper-01', FAR);

// Create exactly one source utterance while she is too far away.
let sourceOffer = null;
for (let i = 0; i < 10 && !sourceOffer; i += 1) {
  loop.step();
  const offers = floors.offers();
  sourceOffer = offers.find((o) => o.entityId !== 'shopkeeper-01') ?? null;
  for (const o of offers) if (o !== sourceOffer) floors.decline(o.entityId);
}
check(!!sourceOffer, 'the source floor never offered anyone');
if (sourceOffer) floors.commit(sourceOffer.entityId, { pick: 'address_group', text: LINE });

// Resolve that speech and then leave the next source Brain pending. No more
// source utterance will occur while the observer walks closer.
let pendingSource = null;
for (let i = 0; i < 10 && !pendingSource; i += 1) {
  loop.step();
  const offers = floors.offers();
  pendingSource = offers.find((o) => o.entityId !== 'shopkeeper-01') ?? null;
  for (const o of offers) if (o.entityId === 'shopkeeper-01') floors.decline(o.entityId);
}
const said = world.log.facts.find((e) => e.type === 'speech_said' && e.text === LINE);
check(!!said, 'the source utterance never committed');
check(!said?.heardBy.includes('shopkeeper-01'), 'the observer already heard the source line while far away');
check(!!pendingSource, 'the source floor did not hold its next Brain decision open');

const speechCount = world.log.facts.filter((e) => e.type === 'speech_said').length;
check(world.moveTo('shopkeeper-01', COUNTER_EDGE), 'the observer could not start walking toward the conversation');

let nudge = null;
for (let i = 0; i < 250 && !nudge; i += 1) {
  loop.step();
  const offers = floors.offers();
  nudge = offers.find((o) => o.entityId === 'shopkeeper-01' && o.why === 'overheard') ?? null;
  // Do not answer pendingSource: this is the latency contract under test.
}

check(!!nudge, 'walking into current earshot produced no overheard opportunity');
check(world.log.facts.filter((e) => e.type === 'speech_said').length === speechCount,
  'a new source utterance was required before the movement-created nudge appeared');
check(world.log.facts.some((e) => e.type === 'move_started' && e.agent === 'shopkeeper-01'),
  'the observer never actually moved');
check(world.tick > said?.t, 'world time did not advance while the source Brain remained pending');
check(!(nudge?.context.forModel.recentPerceivedEvents ?? []).some((e) => e.said === LINE),
  'the movement-created nudge retroactively delivered the old line');
check(!(nudge?.context.forModel.conversation ?? []).some((e) => e.said === LINE),
  'the movement-created nudge retroactively inserted the old line into transcript');

if (nudge) floors.decline(nudge.entityId);

console.log('');
if (problems.length) console.log(`FAILED\n  ${problems.join('\n  ')}`);
else console.log('OK  moving into earshot creates one optional nudge; old unheard words stay unheard');
process.exitCode = problems.length ? 1 : 0;