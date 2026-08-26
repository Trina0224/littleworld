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

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');
const ids = ['grandma-01', 'shopkeeper-01'];

const entities = new Map();
const minds = new Set();
for (const id of ids) {
  const c = read(ROOT, 'characters', id, 'character.json');
  entities.set(id, { appearance: c.appearance, kind: 'person' });
  minds.add(id);
}

const nav = createNav(grid);
const zones = createZones(zoneSpec, nav);
const world = createWorld({ anchors, nav, zones, seed: 20260826 });
const perception = createPerception(world, zones, { entities });
const floors = createFloors(world, zones, perception, { minds });
const runtime = createActivityRuntime(world);
const loop = createLoop({ world, runtime, perception, floors });
world.start();

const NEAR_TABLE = [227, 235];
const COUNTER = [222, 178]; // within normal hearing range
world.spawn('grandma-01', NEAR_TABLE);
world.spawn('shopkeeper-01', COUNTER);
loop.run(2, {});

if (floors.floor('cafe-counter') !== null) {
  throw new Error('test premise: one shopkeeper alone should not have a floor yet');
}

world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });
loop.run(4, {});

const pending = floors.pendingAddressFor('shopkeeper-01');
if (!pending || pending.from !== 'grandma-01') {
  throw new Error('heard cross-zone address did not create pending address');
}

const offer = floors.offers().find((o) => o.entityId === 'shopkeeper-01');
if (!offer || offer.why !== 'addressed') {
  throw new Error(`shopkeeper did not receive addressed offer: ${offer?.why ?? 'none'}`);
}

if (!floors.decline('shopkeeper-01')) {
  throw new Error('addressed decline was rejected');
}
if (floors.pendingAddressFor('shopkeeper-01') !== null) {
  throw new Error('explicitly declining an addressed offer left pendingAddress alive');
}

// The live offer is allowed to finish; once resolved, the one-person temporary
// floor has no remaining qualification and must disappear on requalification.
loop.run(8, {});
if (floors.floor('cafe-counter') !== null) {
  throw new Error('temporary counter floor survived after addressed decline resolved');
}

console.log('floors addressed-decline regression: PASS');
