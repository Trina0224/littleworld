/**
 * Phase 3C, shown rather than asserted.
 *
 *     node src/engine/run-3c.js
 *
 * perception.test.js proves the properties. This prints what a Brain would
 * actually be handed, because the thing worth looking at with your own eyes is
 * that the package contains no names - only what a person standing there could
 * have seen for themselves.
 *
 * No LLM is called and none is mocked.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createPlacement } from './placement.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

// Who is on stage, and where. Positions are the scenario; appearances come from
// each character.json and nothing else in those folders is opened.
const STAGE = [
  { id: 'grandma-01', at: [470, 262] },
  { id: 'pastor-01', at: [488, 266] },
  { id: 'dog-01', at: [455, 258] },
  { id: 'shopkeeper-01', at: [180, 240] },
  { id: 'boy-01', at: [310, 180] }
];
const ABSENT = { id: 'gentleman-01', at: [200, 250], every: 6 };

const entities = new Map();
for (const { id } of [...STAGE, ABSENT]) {
  const c = read(ROOT, 'characters', id, 'character.json');
  entities.set(id, {
    appearance: c.appearance,
    kind: c.brain === 'deterministic' ? 'animal' : 'person'
  });
}

const nav = createNav(grid);
const zones = createZones(zoneSpec, nav);
const world = createWorld({ anchors, nav, seed: 20260825 });
const perception = createPerception(world, zones, { entities });
const placement = createPlacement(world, zones, nav);

world.start();
for (const s of STAGE) world.spawn(s.id, s.at);
world.roster(ABSENT.id, { at: ABSENT.at, every: ABSENT.every });   // rostered, not here

console.log('\n  on stage');
for (const s of STAGE) {
  console.log(`    ${s.id.padEnd(15)} ${String(s.at).padEnd(12)} ${zones.at(s.at[0], s.at[1])}`);
}
console.log(`    ${ABSENT.id.padEnd(15)} rostered, not here today`);

world.say('pastor-01', 'こんにちは、いいお天気ですね。', { scope: 'normal' });
perception.tick();

function show(observerId, note) {
  const ctx = perception.contextFor(observerId);
  console.log(`\n  ${observerId} ${note}`);
  console.log(`  what the model receives (${ctx.epochId}):`);
  for (const v of ctx.forModel.sensoryState.visible) {
    console.log(`    ${v.ref}  ${v.distance.padEnd(14)} ${v.location.padEnd(5)} ${v.appearance.slice(0, 34)}…`);
  }
  for (const e of ctx.forModel.recentPerceivedEvents) {
    const what = e.said ? `「${e.said}」` : (e.detail ?? '');
    console.log(`    ${(e.ref ?? '-').padEnd(7)} ${e.kind.padEnd(20)} ${what}`);
  }
  console.log(`  what the server keeps to itself: ${[...ctx.refs].map(([r, id]) => `${r}=${id}`).join(' ')}`);
  return ctx;
}

show('grandma-01', 'is standing beside the speaker');
show('shopkeeper-01', 'is at the counter, three hundred units away');

// Same cast, different position, different subjective package.
world.agents.get('shopkeeper-01').at = [478, 264];
perception.tick();
show('shopkeeper-01', 'has walked over to the bench');

// A semantic destination: the far table is full, and joining it is still legal.
for (const id of world.resourceIds().filter((r) => r.startsWith('table-far-'))) {
  const who = `sitter-${id.slice(-1)}`;
  world.spawn(who, world.resource(id).at);
  world.reserve(id, who);
  world.occupy(id, who);
}
const spot = placement.goToArea('grandma-01', 'far-table');
console.log('\n  semantic destination');
console.log('    every seat at the far table is taken');
console.log(`    "go to the far table" resolves to ${JSON.stringify(spot.at)} in ${spot.zone}`);
console.log('    nobody was seated, and no seat was disturbed');
console.log('');
