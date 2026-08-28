/**
 * Phase 3E — the Brain knows its own state, and its memories name their subject.
 *
 *   node src/engine/grounding.test.js
 *
 * Cases 6-9 of phase-3e-brain-grounding-and-interject.md §6.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createMemory, buildContext } from './memory.js';
import { createFloors } from './floors.js';
import { createGrounding } from './grounding.js';
import { createActivityRuntime, sitAndRest } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['grandma-01', 'pastor-01', 'shopkeeper-01'];
const NEAR_TABLE = [[227, 235], [232, 238]];
const COUNTER = [222, 178];

function setup({ seeded = true, ticksPerDay = 0 } = {}) {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
    if (seeded && Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260827, ticksPerDay });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, { entities });
  const ground = createGrounding(world, zones);
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, ground, makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const runtime = createActivityRuntime(world);
  const loop = createLoop({ world, runtime, perception, memory, floors });
  world.start();
  return { world, zones, memory, perception, ground, floors, loop, runtime };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const step = (loop, floors) => { loop.step(); return floors.offers(); };

/** Everything a Brain is actually handed, as one string. */
const flat = (o) => JSON.stringify(o.context.forModel);

// --- 6. the package carries self-location, body state and rough time --------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  let o = null;
  for (let i = 0; i < 6 && !o; i += 1) [o] = step(loop, floors);
  check(o, 'the test premise is wrong: nobody was offered the floor');
  const self = o?.context.forModel.self;
  check(self, 'the package has no self section at all');
  check(self?.where === '近桌', `it says the character is at ${self?.where}`);
  check(self?.posture, 'it does not say what the body is doing');
  check(self?.time, 'it does not say roughly when it is');
  check(self?.askedBecause, 'it does not say why the Floor is asking');

  // No fake precision: the world knows a zone, so the answer is a zone.
  check(!/\d/.test(String(self?.where)), `a coordinate or a seat number: ${self?.where}`);
  // And the raw tick it replaced is gone. An integer tick is arithmetic the
  // Brain can only misread as a clock.
  check(o?.context.forModel.tick === undefined,
    'the raw tick is still in the package');
}

// --- the posture is the one the world actually knows ------------------------
// Not decoration: 「你站著」 is a claim, and if it is wrong the Brain writes
// around it. Watching a whole sit-and-rest gives all three postures in order.
{
  const { world, zones, ground, loop, runtime } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  const seat = world.resourceIds('seat').find((id) => {
    const r = world.resource(id);
    return zones.at(r.at[0], r.at[1]) === 'near-table' && r.at[0] < NEAR_TABLE[0][0] - 20;
  });
  check(seat, 'the test premise is wrong: no near-table seat to walk to');
  runtime.assign('grandma-01', sitAndRest(seat, 40));
  const postures = [];
  for (let i = 0; i < 160; i += 1) {
    loop.step();
    const p = ground.self('grandma-01').posture;
    if (postures[postures.length - 1] !== p) postures.push(p);
  }
  check(postures.includes('正在走過去'),
    `she walked across the room and the package never said so: ${postures}`);
  check(postures.includes('坐著'),
    `she sat down and the package never said so: ${postures}`);
  check(postures.indexOf('正在走過去') < postures.indexOf('坐著'),
    `she sat before she walked: ${postures}`);
  check(postures[postures.length - 1] === '站著',
    `she got up and the package left her sitting: ${postures}`);
}

// --- a daypart, when the world counts days ----------------------------------
{
  const { world, ground } = setup({ ticksPerDay: 100 });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) { world.advance(); seen.add(ground.self('grandma-01').time); }
  check(seen.size > 1, `a whole day passed and it was always ${[...seen]}`);
  check([...seen].every((t) => !/\d/.test(String(t))),
    `a daypart came out as arithmetic: ${[...seen]}`);
}

// --- 7. grounding leaks no id and no unlearned name -------------------------
{
  const { world, floors, loop } = setup({ seeded: false });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', COUNTER);
  const seen = [];
  for (let i = 0; i < 20; i += 1) {
    for (const o of step(loop, floors)) { seen.push(o); floors.decline(o.entityId); }
  }
  check(seen.length > 0, 'the test premise is wrong: nobody was offered the floor');
  // The real character files, not invented strings: a check against made-up
  // names would still pass if the engine started reading character.json.
  const names = CAST.map((id) => read(ROOT, 'characters', id, 'character.json'));
  for (const o of seen) {
    const text = flat(o);
    for (const id of CAST) {
      if (text.includes(id)) problems.push(`${id} reached the package as an id`);
    }
    for (const c of names) {
      for (const k of c.knows ?? []) {
        if (k.as && text.includes(k.as)) {
          problems.push(`a name nobody in this run learned reached the package: ${k.as}`);
        }
      }
    }
    void text;
  }
}

// --- 8. an episode says who it is about, by label or by ref -----------------
{
  // Fallback 1: somebody she has a name for. Seeded knowledge deliberately
  // records no first meeting, so the episode here is one a Brain wrote.
  const { world, memory, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  memory.note('grandma-01', 'pastor-01', '文化教室の話をした');
  let mine = null;
  for (let i = 0; i < 20; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId === 'grandma-01') mine = o.context.forModel;
      floors.decline(o.entityId);
    }
  }
  const shown = mine?.memory ?? [];
  check(shown.length > 0, 'nothing she remembers reached her package');
  check(shown.every((e) => e.who !== undefined),
    `an episode with no subject: ${JSON.stringify(shown)}`);
  check(shown.some((e) => e.who === '牧師さん'),
    `she calls him 牧師さん and the episode says ${JSON.stringify(shown.map((e) => e.who))}`);
}
{
  // Fallback 2: a real first meeting between two people who did not know each
  // other, so there is no label and the subject has to be a current ref.
  const { world, memory, floors, loop } = setup({ seeded: false });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  let mine = null;
  for (let i = 0; i < 20; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId === 'grandma-01') mine = o.context.forModel;
      floors.decline(o.entityId);
    }
  }
  check(memory.episodesFor('grandma-01').some((e) => e.kind === 'first_meeting'),
    'the test premise is wrong: she never met anybody for the first time');
  const shown = mine?.memory ?? [];
  const met = shown.find((e) => e.kind === 'first_meeting');
  check(met, `the meeting never reached her package: ${JSON.stringify(shown)}`);
  check(met?.who?.ref && met?.who?.looks,
    `a stranger she met came out as ${JSON.stringify(met?.who)}`);
  check(!JSON.stringify(shown).includes('pastor-01'),
    'the episode named him by id');
}

// --- an unplaceable episode is dropped, not shown as nobody -----------------
{
  const { world, memory, floors, loop } = setup({ seeded: false });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  for (let i = 0; i < 12; i += 1) {
    for (const o of step(loop, floors)) floors.decline(o.entityId);
  }
  // He walks out of the scene. She still remembers meeting him, and can no
  // longer point at him: no label, no ref.
  world.depart('pastor-01');
  let mine = null;
  for (let i = 0; i < 20 && !mine; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId === 'grandma-01') mine = o.context.forModel;
      floors.decline(o.entityId);
    }
  }
  check(memory.episodesFor('grandma-01').some((e) => e.entityId === 'pastor-01'),
    'the test premise is wrong: she never recorded meeting him');
  const shown = mine?.memory ?? [];
  check(!shown.some((e) => e.who === 'somebody' || e.who === undefined),
    `an episode she cannot place was shown anyway: ${JSON.stringify(shown)}`);
}

// --- 9. a ref never becomes storage -----------------------------------------
// Refs are request-local transport. Memory refuses one at the door, and the
// episode renderer must not be the thing that puts one back.
{
  const { world, memory, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('pastor-01', NEAR_TABLE[1]);
  for (let i = 0; i < 12; i += 1) {
    for (const o of step(loop, floors)) floors.decline(o.entityId);
  }
  for (const observer of ['grandma-01', 'pastor-01']) {
    for (const e of memory.episodesFor(observer)) {
      check(!/^(seen|heard)-\d+$/.test(String(e.entityId)),
        `a ref was stored as an episode subject: ${e.entityId}`);
    }
    for (const other of memory.knownTo(observer)) {
      check(!/^(seen|heard)-\d+$/.test(String(other)),
        `a ref was stored as a known person: ${other}`);
    }
  }
  let threw = false;
  try { memory.note('grandma-01', 'seen-1', 'x'); } catch { threw = true; }
  check(threw, 'memory accepted a ref as a canonical id');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK  the package says where the character is, what its body is');
console.log('    doing and roughly when it is, without a coordinate, a seat');
console.log('    number or a raw tick; grounding leaks no id and no unlearned');
console.log('    name; a remembered meeting says who it was with, or is dropped');
console.log('    rather than shown as nobody; and a ref never becomes storage');
