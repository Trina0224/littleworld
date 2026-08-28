/**
 * Phase 3E — direct response is causality, interjection happens at a boundary.
 *
 *   node src/engine/interject.test.js
 *
 * Cases 1-5 of phase-3e-brain-grounding-and-interject.md §6. The correction it
 * encodes: a waiting score used to be able to outrank a direct addressee, which
 * turned "somebody spoke to me" into a number other numbers could beat.
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
import { createSocialWeigher, interjectPatience } from './social.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const NEAR_TABLE = [[227, 235], [232, 238], [222, 240], [218, 232]];

/** A, B and C at one table. `patience` overrides let a case name its own C. */
function setup({ cast, patience = null, config = {} } = {}) {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  const traits = new Map();
  for (const id of cast) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
    traits.set(id, c.social);
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260827 });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, { entities });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, config,
    weigh: createSocialWeigher({ traitsFor: traits, memory }),
    patienceFor: (id) => patience?.[id] ?? interjectPatience(traits.get(id)),
    makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors
  });
  world.start();
  cast.forEach((id, i) => world.spawn(id, NEAR_TABLE[i]));
  return { world, floors, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const step = (loop, floors) => { loop.step(); return floors.offers(); };
const at = (o, act, target) => o?.menu.find(
  (m) => m.startsWith(`${act}:`) && o.context.refs.get(m.split(':')[1]) === target) ?? null;

/**
 * Run an A<->B exchange with C present, recording every offer. `stop` decides
 * when to stop. `answer` may override what a character does with its turn.
 */
function exchange({ cast, patience, ticks = 200, answer = () => null }) {
  const { world, floors, loop } = setup({ cast, patience });
  const [A, B] = cast;
  const seen = [];
  for (let i = 0; i < ticks; i += 1) {
    for (const o of step(loop, floors)) {
      seen.push({ who: o.entityId, why: o.why, round: o.round });
      const forced = answer(o, seen);
      if (forced === 'decline') { floors.decline(o.entityId); continue; }
      if (forced) {
        if (floors.commit(o.entityId, forced).refused) floors.decline(o.entityId);
        continue;
      }
      // A and B talk only to each other; anybody else stays quiet.
      const partner = o.entityId === A ? B : o.entityId === B ? A : null;
      const pick = partner && (at(o, 'reply', partner) ?? at(o, 'greet', partner));
      if (!pick || floors.commit(o.entityId, { pick, text: 'そうねえ' }).refused) {
        floors.decline(o.entityId);
      }
    }
  }
  return { world, floors, seen };
}

// --- 1. a huge waiting score does not take an addressee's turn -------------
// C is given patience 1, so it is ready to come in at literally every boundary.
// It still must never be offered while somebody is owed an answer.
{
  const cast = ['grandma-01', 'brother-01', 'pastor-01'];
  const { seen } = exchange({ cast, patience: { 'pastor-01': 1 } });
  check(seen.length > 20, `the test premise is wrong: only ${seen.length} offers`);
  check(seen.some((o) => o.who === 'pastor-01'),
    'the test premise is wrong: the eager third party never came in at all');

  // Walk the record: after an utterance names somebody, that somebody is the
  // next person asked. Nothing may be interleaved in between.
  const owed = [];
  for (const o of seen) {
    if (o.why === 'addressed') owed.push(o.who);
  }
  check(owed.length > 10, `the test premise is wrong: ${owed.length} direct responses`);
  let jumped = 0;
  for (let i = 1; i < seen.length; i += 1) {
    if (seen[i].why === 'interject' && seen[i - 1].why === 'addressed') continue;
    if (seen[i].why === 'interject' && seen[i - 1].why !== 'addressed') jumped += 1;
  }
  check(jumped === 0, `${jumped} interjections happened somewhere other than a boundary`);
}

// --- 2. B declines; C may then come in --------------------------------------
{
  const cast = ['grandma-01', 'brother-01', 'pastor-01'];
  let declined = false;
  const { seen } = exchange({
    cast,
    patience: { 'pastor-01': 1 },
    ticks: 60,
    answer: (o) => {
      // The first time 辰 is offered a turn he was addressed for, he waves it away.
      if (o.entityId === 'brother-01' && o.why === 'addressed' && !declined) {
        declined = true;
        return 'decline';
      }
      return null;
    }
  });
  check(declined, 'the test premise is wrong: he was never addressed');
  const i = seen.findIndex((o) => o.who === 'brother-01' && o.why === 'addressed');
  const after = seen.slice(i + 1);
  check(after[0]?.why === 'interject' && after[0]?.who === 'pastor-01',
    `after a declined answer the next offer was ${after[0]?.who}/${after[0]?.why}`);
}

// --- 3. B answers; only then is C reevaluated -------------------------------
{
  const cast = ['grandma-01', 'brother-01', 'pastor-01'];
  const { seen, world } = exchange({ cast, patience: { 'pastor-01': 1 }, ticks: 60 });
  const first = seen.findIndex((o) => o.who === 'pastor-01' && o.why === 'interject');
  check(first > 0, 'the third party never interjected');
  const before = seen[first - 1];
  check(before.why === 'addressed',
    `the interjection followed a ${before.why} offer rather than a direct response`);
  // ...and it followed a COMMITTED answer, not a turn still outstanding.
  const spoke = world.log.facts.filter((e) => e.type === 'speech_said');
  check(spoke.some((e) => e.agent === before.who),
    'the person who was asked never actually spoke before the interjection');
}

// --- 4. a long exchange does not make an eager C invisible ------------------
{
  const cast = ['grandma-01', 'brother-01', 'pastor-01'];   // 森牧師: patience 14
  const { seen } = exchange({ cast, ticks: 300 });
  const his = seen.filter((o) => o.who === 'pastor-01');
  check(his.length > 0,
    'a third person with real social drive sat through the whole exchange unasked');
  check(his.every((o) => o.why === 'interject' || o.why === 'open_floor'),
    `he was offered as ${[...new Set(his.map((o) => o.why))]}`);
}

// --- 5. a withdrawn C is asked, and is not made to speak --------------------
// 渡辺 waits thirty rounds rather than fourteen. He is still asked - being
// unaskable must not be an accident of two other people talking - and what he
// does with it is his.
{
  const cast = ['grandma-01', 'brother-01', 'man-01'];
  const { seen, world } = exchange({ cast, ticks: 400 });
  const his = seen.filter((o) => o.who === 'man-01');
  check(his.length > 0, '渡辺 was never asked once in four hundred ticks');
  check(!world.log.facts.some((e) => e.type === 'speech_said' && e.agent === 'man-01'),
    '渡辺 was made to speak');

  // ...and he is asked far less often than the pastor would be, because that
  // difference is his character rather than a quota.
  const pastor = exchange({
    cast: ['grandma-01', 'brother-01', 'pastor-01'], ticks: 400
  }).seen.filter((o) => o.who === 'pastor-01');
  check(pastor.length > his.length,
    `渡辺 was asked ${his.length} times and 森牧師 ${pastor.length}: the cast is not asymmetric`);
}

// --- one breath naming two people owes two answers -------------------------
// The boundary is not "an addressee answered", it is "nobody on this floor is
// still owed one". A line naming two people creates two response
// opportunities, and an eager third party must wait out BOTH.
{
  const cast = ['grandma-01', 'brother-01', 'shopkeeper-01', 'pastor-01'];
  const { world, floors, loop } = setup({ cast, patience: { 'pastor-01': 1 } });
  const seen = [];
  let named = false;
  let namedAt = -1;
  for (let i = 0; i < 80; i += 1) {
    for (const o of step(loop, floors)) {
      seen.push({ who: o.entityId, why: o.why });
      if (!named && o.entityId === 'grandma-01') {
        const a = at(o, 'greet', 'brother-01');
        const b = at(o, 'greet', 'shopkeeper-01');
        if (a && b) {
          named = !floors.commit(o.entityId, { picks: [a, b], text: 'ふたりとも、こんにちは' }).refused;
          if (named) { namedAt = seen.length - 1; continue; }
        }
      }
      floors.decline(o.entityId);
    }
  }
  check(named, 'the test premise is wrong: she never named two people at once');
  const said = world.log.facts.find((e) => e.type === 'speech_said' && e.to.length === 2);
  check(said, 'the test premise is wrong: the line did not name two people');

  // From the utterance onward: both people named are asked before the eager
  // third party is offered anything.
  const after = seen.slice(namedAt + 1);
  const owed = new Set(said?.to ?? []);
  let answered = 0;
  let cutIn = -1;
  for (let i = 0; i < after.length; i += 1) {
    if (after[i].why === 'addressed' && owed.has(after[i].who)) {
      answered += 1;
      owed.delete(after[i].who);
    }
    if (after[i].who === 'pastor-01' && cutIn === -1) cutIn = answered;
  }
  check(answered === 2, `only ${answered} of the two people she named were asked`);
  check(cutIn === 2 || cutIn === -1,
    `the third party came in after ${cutIn} of the two people she named had answered`);
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK  a direct addressee is asked before anybody else however long');
console.log('    they have waited; an interjection happens only at an exchange');
console.log('    boundary, after the answer is committed or waved away; a long');
console.log('    exchange does not make a third person invisible; and the most');
console.log('    withdrawn character is asked without being made to speak; and');
console.log('    one breath naming two people owes two answers before anybody');
console.log('    else is asked at all');
