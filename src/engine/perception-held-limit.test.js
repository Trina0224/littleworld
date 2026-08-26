import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const ids = ['grandma-01', 'pastor-01', 'shopkeeper-01'];
const entities = new Map(ids.map((id) => {
  const c = read(ROOT, 'characters', id, 'character.json');
  return [id, { appearance: c.appearance, kind: 'person' }];
}));

const nav = createNav(grid);
const zones = createZones(zoneSpec, nav);
const world = createWorld({ anchors, nav, seed: 20260825 });
const perception = createPerception(world, zones, {
  entities,
  config: { heldLimit: 2 }
});
world.start();

// Keep all three in normal hearing range so the distinctive event is guaranteed
// to be queued for the third observer.
world.spawn('grandma-01', [470, 262]);
world.spawn('pastor-01', [480, 262]);
world.spawn('shopkeeper-01', [490, 262]);

const first = perception.contextFor('grandma-01');
const second = perception.contextFor('pastor-01');
if (perception.heldCount() !== 2) throw new Error('test premise: heldLimit was not filled');

world.say('grandma-01', 'これは消えてはいけない', { to: 'shopkeeper-01' });
perception.tick();
const before = perception.pendingFor('shopkeeper-01');
const distinctive = before.find((e) => e.text === 'これは消えてはいけない');
if (!distinctive) throw new Error('test premise: distinctive event was not queued');

let threw = false;
try {
  perception.contextFor('shopkeeper-01');
} catch {
  threw = true;
}
if (!threw) throw new Error('contextFor exceeded heldLimit without throwing');

// The rejected call must be a true no-op. In particular, it cannot drain the
// queue or create an unreachable held epoch that nobody can settle.
if (perception.heldCount() !== 2) {
  throw new Error(`heldLimit overflow changed heldCount to ${perception.heldCount()}`);
}
const after = perception.pendingFor('shopkeeper-01');
if (after.length !== before.length || !after.some((e) => e.seq === distinctive.seq)) {
  throw new Error('heldLimit overflow consumed or changed the pending event queue');
}

// Once capacity exists again, the same event must be deliverable exactly once.
perception.settle(first.epochId, { delivered: true });
const third = perception.contextFor('shopkeeper-01');
const delivered = third.forModel.recentPerceivedEvents
  .filter((e) => e.said === 'これは消えてはいけない');
if (delivered.length !== 1) {
  throw new Error(`distinctive event delivered ${delivered.length} times after recovery`);
}

perception.settle(second.epochId, { delivered: true });
perception.settle(third.epochId, { delivered: true });
if (perception.heldCount() !== 0) throw new Error('test leaked held contexts');

console.log('perception heldLimit regression: PASS');
