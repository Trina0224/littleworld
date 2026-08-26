/**
 * Phase 3E-3: the floor store.
 *
 *   node src/engine/floors.test.js
 *
 * Covers phase-3e-implementation-structure.md §2/§5, floor-clarifications §2
 * and §9, and the pre-floor-corrections §2.1 gate on where nudge suppression
 * lives.
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

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['grandma-01', 'pastor-01', 'shopkeeper-01', 'man-01', 'brother-01', 'dog-01'];

function setup() {
  const entities = new Map();
  const minds = new Set();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    const deterministic = c.brain === 'deterministic';
    entities.set(id, { appearance: c.appearance, kind: deterministic ? 'animal' : 'person' });
    if (!deterministic) minds.add(id);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260826 });
  const perception = createPerception(world, zones, { entities });
  const floors = createFloors(world, zones, { minds });
  const runtime = createActivityRuntime(world);
  const loop = createLoop({ world, runtime, perception, floors });
  world.start();
  return { world, zones, perception, floors, loop };
}

// Positions, checked against zones.json.
const PARK_A = [392, 202];
const PARK_B = [400, 202];
const NEAR_TABLE = [227, 235];
const NEAR_TABLE_2 = [232, 238];
const COUNTER = [222, 178];       // 57 units from the near table: inside hearing

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

// --- the world stamps the zone on every utterance -----------------------
{
  const { world, zones } = setup();
  world.spawn('grandma-01', PARK_A);
  world.say('grandma-01', 'ここは公園。');
  const said = world.log.facts.filter((e) => e.type === 'speech_said').at(-1);
  check(said.zone === zones.at(PARK_A[0], PARK_A[1]),
    `the utterance was stamped ${said.zone}`);
  check(said.zone === 'park-open', `park position resolved to ${said.zone}`);
}

// --- §5 qualification ----------------------------------------------------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK_A);
  loop.run(2, {});
  check(floors.floor('park-open') === null, 'one person alone opened a floor');

  world.spawn('pastor-01', PARK_B);
  loop.run(4, {});
  check(floors.floor('park-open') !== null, 'two people in a zone opened no floor');
  check(floors.floorFor('grandma-01')?.zone === 'park-open',
    'an occupant is not on their own zone floor');

  const spellA = floors.floor('park-open').socialSpell;
  world.roster('pastor-01', { at: PARK_B });
  world.depart('pastor-01');
  loop.run(6, {});
  check(floors.floor('park-open') === null, 'the floor outlived its second occupant');

  // One person and the dog is a scene, not an empty room.
  world.spawn('dog-01', [396, 204]);
  loop.run(8, {});
  const withDog = floors.floor('park-open');
  check(withDog !== null, 'a person and their dog opened no floor');
  check(withDog.socialSpell > spellA, 'reopening reused the old social spell');
}

// --- §9 a heard cross-zone address qualifies the target's own zone -------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE);
  world.spawn('shopkeeper-01', COUNTER);        // the only LLM at the counter
  loop.run(2, {});
  check(floors.floor('cafe-counter') === null,
    'the counter qualified before anyone spoke to her');

  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });
  loop.run(4, {});
  const said = world.log.facts.filter((e) => e.type === 'speech_said').at(-1);
  check(said.heardBy.includes('shopkeeper-01'), 'the test premise is wrong: she did not hear it');
  check(said.zone === 'near-table', `the call was stamped ${said.zone}`);
  check(floors.floor('cafe-counter') !== null,
    'a heard address left the target with nowhere to answer');
  check(floors.pendingAddressFor('shopkeeper-01')?.from === 'grandma-01',
    'the pending address does not name who called');

  // One utterance, one owner. The counter got an opportunity, not a copy.
  check(world.log.facts.filter((e) => e.type === 'speech_said').length === 1,
    'the utterance was committed more than once');
  check(floors.transcript('cafe-counter').length === 0,
    'the utterance was copied into the target zone transcript');
  check(floors.transcript('near-table').length === 1,
    'the utterance is not in the zone it was spoken in');

  // Self-clearing: the opportunity expires and the temporary floor goes.
  floors.clearAddress('shopkeeper-01');
  loop.run(6, {});
  check(floors.floor('cafe-counter') === null,
    'the temporary floor outlived the address that created it');
}

// --- an unheard address creates nothing anywhere -------------------------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK_A);
  world.spawn('shopkeeper-01', COUNTER);        // ~300 units away
  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });
  loop.run(4, {});
  const said = world.log.facts.filter((e) => e.type === 'speech_said').at(-1);
  check(!said.heardBy.includes('shopkeeper-01'), 'the test premise is wrong: she heard it');
  check(floors.pendingAddressFor('shopkeeper-01') === null,
    'an address nobody heard created a response opportunity');
  check(floors.floor('cafe-counter') === null,
    'an address nobody heard qualified a zone');
}

// --- §2 the transcript is derived, not a cache that can go stale ---------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK_A);
  world.spawn('pastor-01', PARK_B);
  let i = 0;
  loop.run(60, { beforeTick: (t) => {
    if (t % 6 === 1 && i < 5) { world.say('grandma-01', `line ${i}`); i += 1; }
  } });
  const live = JSON.stringify(floors.transcript('park-open'));
  check(floors.transcript('park-open').length === 5, `kept ${i} lines`);

  // Destroy the floor by emptying the zone, then bring it back.
  world.roster('pastor-01', { at: PARK_B });
  world.depart('pastor-01');
  loop.run(70, {});
  check(floors.floor('park-open') === null, 'the test premise is wrong: floor still open');
  world.arrive('pastor-01');
  loop.run(76, {});
  check(floors.floor('park-open') !== null, 'the floor did not come back');
  check(JSON.stringify(floors.transcript('park-open')) === live,
    'the transcript was lost when its floor was destroyed');

  // And a full rebuild from the facts alone reproduces it.
  floors.rebuild();
  check(JSON.stringify(floors.transcript('park-open')) === live,
    'rebuilding from committed facts produced a different transcript');
  check(floors.floor('park-open') !== null, 'rebuilding lost the floor itself');
}

// --- pre-floor-corrections §2.1: nudge suppression is source-spell state --
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE);
  world.spawn('brother-01', NEAR_TABLE_2);        // the source conversation
  world.spawn('shopkeeper-01', COUNTER);
  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });   // qualifies the counter
  loop.run(4, {});
  check(floors.floor('near-table') !== null && floors.floor('cafe-counter') !== null,
    'the test premise is wrong: both floors are not open');

  floors.spendNudge('shopkeeper-01', 'near-table');
  check(floors.nudgeSpent('shopkeeper-01', 'near-table'), 'the nudge was not recorded');

  // Her temporary floor is created and destroyed; the record must not care.
  floors.clearAddress('shopkeeper-01');
  loop.run(8, {});
  check(floors.floor('cafe-counter') === null, 'the temporary floor did not close');
  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });
  loop.run(12, {});
  check(floors.floor('cafe-counter') !== null, 'the temporary floor did not reopen');
  check(floors.nudgeSpent('shopkeeper-01', 'near-table'),
    'destroying the temporary floor erased the spent nudge');

  // Two observers, two source zones: independent keys.
  check(!floors.nudgeSpent('man-01', 'near-table'), 'one observer spent another observer\'s nudge');
  check(!floors.nudgeSpent('shopkeeper-01', 'park-open'), 'one source zone spent another\'s');

  // A NEW social spell in the source zone makes it eligible again.
  world.roster('brother-01', { at: NEAR_TABLE_2 });
  world.depart('brother-01');
  loop.run(16, {});
  check(floors.floor('near-table') === null, 'the source floor did not close');
  world.arrive('brother-01');
  loop.run(20, {});
  check(floors.floor('near-table') !== null, 'the source floor did not reopen');
  check(!floors.nudgeSpent('shopkeeper-01', 'near-table'),
    'a new social spell did not make the nudge eligible again');
}

// --- the store is a stage of the tick, not a call a scenario remembers ----
{
  const { world, floors } = setup();
  world.spawn('grandma-01', PARK_A);
  world.spawn('pastor-01', PARK_B);
  check(floors.floor('park-open') === null, 'a floor appeared without the loop running');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  a zone qualifies for a floor and stops qualifying; a heard');
  console.log('    cross-zone address gives its target somewhere to answer and');
  console.log('    an unheard one gives nothing; one utterance stays one fact in');
  console.log('    one zone; the transcript is derived from facts and survives');
  console.log('    its floor; nudge suppression outlives a temporary floor and');
  console.log('    ends with its source spell');
}
process.exitCode = problems.length ? 1 : 0;
