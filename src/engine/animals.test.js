/**
 * Phase 3E-9: speaking to a deterministic actor.
 *
 *   node src/engine/animals.test.js
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
import { createAnimals } from './animals.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['brother-01', 'grandma-01', 'dog-01'];
const PARK = [[392, 202], [400, 202], [396, 206]];

function setup() {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  const table = new Map();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    const deterministic = c.brain === 'deterministic';
    entities.set(id, { appearance: c.appearance, kind: deterministic ? 'animal' : 'person' });
    if (deterministic) table.set(id, { bonds: c.bonds ?? [] });
    else minds.add(id);
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260826 });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, { entities });
  const animals = createAnimals(world, { table, nearRange: perception.config.nearRange });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, animals, makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors
  });
  world.start();
  return { world, perception, memory, animals, floors, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const step = (loop, floors) => { loop.step(); return floors.offers(); };
const pickAt = (o, act, target) => o?.menu.find(
  (m) => m.startsWith(`${act}:`) && o.context.refs.get(m.split(':')[1]) === target) ?? null;

/** Ask `who` to call the dog, every round, and count what happened. */
function callFor(who, acts = 'call_over') {
  const { world, memory, animals, floors, loop } = setup();
  world.spawn('brother-01', PARK[0]);
  world.spawn('grandma-01', PARK[1]);
  world.spawn('dog-01', PARK[2]);
  const menus = [];
  for (let i = 0; i < 40; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId !== who) { floors.decline(o.entityId); continue; }
      menus.push(o.menu);
      const p = pickAt(o, acts, 'dog-01');
      if (p) floors.commit(o.entityId, { pick: p, text: 'ハナ、おいで' });
      else floors.decline(o.entityId);
    }
  }
  const responses = world.log.facts.filter((e) => e.type === 'animal_responded');
  return { world, memory, animals, floors, menus, responses };
}

// --- the menu offers the dog, and the engine never reads the prose ------
{
  const { world, menus, responses } = callFor('brother-01');
  check(menus.length > 0, '辰 was never offered the floor');
  check(menus[0].some((m) => /^call_over:seen-\d+$/.test(m)),
    `the dog was not in the menu: ${menus[0]}`);
  check(menus.every((m) => m.every((x) => !x.includes('dog-01'))),
    'an entity id reached the menu');
  check(menus[0].some((m) => m.startsWith('praise:')) && menus[0].some((m) => m.startsWith('shoo:')),
    'the animal repertoire is incomplete');
  check(responses.length > 0, 'calling the dog produced no response at all');
  const spoken = world.log.facts.filter((e) => e.type === 'speech_said');
  check(spoken.length === responses.length,
    'the words and the act did not come in pairs');
  check(spoken.every((e) => e.to === 'dog-01'), 'the call was not aimed at the dog');
}

// --- 辰's dog comes when he calls; she mostly does not for a stranger ----
{
  const his = callFor('brother-01').responses;
  const hers = callFor('grandma-01').responses;
  check(his.length > 5 && hers.length > 5, 'not enough calls to compare');
  const rate = (r) => r.filter((e) => e.outcome === 'complied').length / r.length;
  check(rate(his) > 0.8, `辰 called ${his.length} times and she came ${Math.round(rate(his) * 100)}%`);
  check(rate(hers) < 0.35,
    `星さん called ${hers.length} times and she came ${Math.round(rate(hers) * 100)}%`);
  check(rate(his) > rate(hers) + 0.4, 'familiarity made no difference');
  // Nobody wrote that rule. It is bonds.familiarity in the character file.
  const bonds = read(ROOT, 'characters', 'dog-01', 'character.json').bonds;
  check(bonds.some((b) => b.who === 'brother-01' && b.familiarity === 1)
    && !bonds.some((b) => b.who === 'grandma-01'),
    'the character file no longer says what this test is measuring');
}

// --- an ignored call is a fact too -------------------------------------
{
  const { world } = callFor('grandma-01');
  const ignored = world.log.facts.filter(
    (e) => e.type === 'animal_responded' && e.outcome === 'ignored');
  check(ignored.length > 0, 'a dog that did not come left no trace');
  check(ignored.every((e) => e.animal === 'dog-01' && e.to === 'grandma-01'),
    'the ignored response does not say who was ignored');
}

// --- deterministic, and stable under what anyone else draws -------------
{
  const a = callFor('grandma-01').responses.map((e) => `${e.t}:${e.outcome}`).join('|');
  const b = callFor('grandma-01').responses.map((e) => `${e.t}:${e.outcome}`).join('|');
  check(a === b && a.length > 0, 'the same run produced different compliance');

  // The load-bearing half, and the same one attendance.js has: a stream's
  // values depend on how many times anyone else has drawn from it, so deciding
  // this from the world rng would make an unrelated change reshuffle the dog.
  const { world, animals } = setup();
  world.spawn('brother-01', PARK[0]);
  world.spawn('dog-01', PARK[2]);
  const plain = [];
  for (let i = 0; i < 20; i += 1) { plain.push(animals.respond('brother-01', 'dog-01', 'call_over')); world.advance(); }

  const two = setup();
  two.world.spawn('brother-01', PARK[0]);
  two.world.spawn('dog-01', PARK[2]);
  for (let i = 0; i < 7; i += 1) two.world.rng.next();      // somebody else drew
  const after = [];
  for (let i = 0; i < 20; i += 1) { after.push(two.animals.respond('brother-01', 'dog-01', 'call_over')); two.world.advance(); }
  check(plain.join('|') === after.join('|'),
    'somebody else drawing from the world rng changed what the dog did');
}

// --- a call the dog cannot hear is ignored for a physical reason --------
{
  const { world, animals, floors, loop } = setup();
  world.spawn('brother-01', [310, 110]);
  world.spawn('grandma-01', [316, 114]);
  world.spawn('dog-01', [600, 290]);            // ~340 units: out of hearing
  check(animals.chance('dog-01', 'brother-01', 'call_over') > 0.5,
    'the test premise is wrong: she would rarely have come anyway');
  const out = [];
  for (let i = 0; i < 30; i += 1) { out.push(animals.respond('brother-01', 'dog-01', 'call_over')); world.advance(); }
  check(out.every((o) => o === 'ignored'),
    `she came from 340 units away ${out.filter((o) => o === 'complied').length} times`);
  void floors; void loop;
}

// --- and she still has no mind ------------------------------------------
{
  const { world, memory, floors } = callFor('brother-01');
  check(memory.knownTo('dog-01').length === 0, 'the dog acquired a person model');
  check(memory.episodesFor('dog-01').length === 0, 'the dog acquired episodes');
  check(floors.menuFor('dog-01') === null, 'the dog was given a menu');
  check(!world.log.audit.some((e) => e.type === 'floor_offered' && e.agent === 'dog-01'),
    'the dog was offered the floor');
  check(floors.utterancesFor('dog-01').length === 0, 'the dog was given a transcript');
  // But the boy remembers talking to her, which is exactly right.
  check(memory.recall('brother-01', 'dog-01')?.spokenWith >= 1,
    'the boy does not remember talking to his own dog');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  the dog is in the menu as a ref and never as an id; the words');
  console.log('    are heard and the act is executed, with no prose read; 辰\'s dog');
  console.log('    comes when he calls and mostly not for anyone else, from the');
  console.log('    character file alone; being ignored is a fact; compliance is');
  console.log('    deterministic and inaudible calls fail physically; she still');
  console.log('    has no memory, no menu, no offer and no transcript');
}
process.exitCode = problems.length ? 1 : 0;
