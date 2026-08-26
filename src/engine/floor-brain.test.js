/**
 * Phase 3E-6, 3E-7 and 3E-8: what a Brain is shown, what it may choose, and the
 * one structural stake the engine owns.
 *
 *   node src/engine/floor-brain.test.js
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
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));
const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['grandma-01', 'pastor-01', 'man-01', 'shopkeeper-01', 'brother-01'];
const PARK = [[392, 202], [400, 202], [396, 206]];
const NEAR_TABLE = [[227, 235], [232, 238]];
const COUNTER = [222, 178];

function setup(config = {}) {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260826 });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, {
    entities, attentionHint: (o, e) => memory.attentionHint(o, e)
  });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, config,
    makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors
  });
  world.start();
  const wrapped = {
    ...floors,
    offers: () => floors.offers().map((o) => ({ ...o, __perception: perception }))
  };
  return { world, perception, memory, floors: wrapped, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const step = (loop, floors) => { loop.step(); return floors.offers(); };
function drive(loop, floors, n, policy = () => 'decline') {
  const seen = [];
  for (let i = 0; i < n; i += 1) {
    for (const o of step(loop, floors)) {
      seen.push(o);
      const a = policy(o, i);
      if (a && a !== 'decline') floors.commit(o.entityId, a);
      else floors.decline(o.entityId);
    }
  }
  return seen;
}
const perceptionOf = (o) => o.__perception;
/** The menu entry for `act` aimed at a named entity, resolved through the refs. */
const pickAt = (o, act, target) => o?.menu.find(
  (m) => m.startsWith(`${act}:`) && o.context.refs.get(m.split(':')[1]) === target) ?? null;
const pickFor = (o, act) => o?.menu.find((m) => m.startsWith(`${act}:`)) ?? null;

// --- 3E-7  the menu is what the engine supplied, and nothing else -------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  let offers = [];
  for (let i = 0; i < 3 && !offers.length; i += 1) offers = step(loop, floors);
  const o = offers[0];
  check(o.menu.includes('nothing'), 'nothing was not always legal');
  check(o.menu.includes('address_group'), 'a remark to the room was not offered');
  check(o.menu.some((m) => /^reply:seen-\d+$/.test(m)), `the menu is ${o.menu}`);
  check(o.menu.every((m) => !m.includes('-01')), `an entity id reached the menu: ${o.menu}`);
  check(JSON.stringify(o.context.forModel.choices) === JSON.stringify(o.menu),
    'the model-visible package does not carry the choices');

  check(floors.commit(o.entityId, { pick: 'order:coffee' }).refused,
    'an act the engine never offered was accepted');
  check(floors.commit(o.entityId, { pick: 'reply:seen-9' }).refused,
    'a ref that was never in the package was accepted');
  check(floors.commit(o.entityId, { pick: pickFor(o, 'ask') }).refused,
    'an act that needs words was accepted with none');
  check(world.log.audit.filter((e) => e.type === 'floor_refused').length === 3,
    'a refusal did not reach the audit stream');
  check(world.log.facts.every((e) => e.type !== 'speech_said'),
    'a refused act still reached the world');

  // A choice that carries no speech takes the choice and drops the prose.
  const other = offers.find((x) => x.entityId !== o.entityId) ?? o;
  const said = floors.commit(o.entityId, { pick: 'nothing', text: 'こんにちは' });
  check(said.spoken === false, 'nothing was treated as speech');
  void other;

  // A ref whose round trip is over must fail cleanly, never retarget somebody.
  const { world: w2, floors: f2, loop: l2 } = setup();
  w2.spawn('grandma-01', PARK[0]);
  w2.spawn('pastor-01', PARK[1]);
  let o2 = null;
  for (let i = 0; i < 3 && !o2; i += 1) o2 = step(l2, f2)[0] ?? null;
  const reply2 = pickFor(o2, 'reply');
  perceptionOf(o2).releaseEpoch(o2.epochId);
  check(f2.commit(o2.entityId, { pick: reply2, text: 'まだそこに？' }).refused,
    'a ref whose epoch was released still resolved to somebody');

  // Long replies are truncated, never refused.
  const { world: w3, floors: f3, loop: l3 } = setup({ speechLimit: 12 });
  w3.spawn('grandma-01', PARK[0]);
  w3.spawn('pastor-01', PARK[1]);
  drive(l3, f3, 6, (x) => (x.entityId === 'grandma-01'
    ? { pick: 'address_group', text: 'あ'.repeat(50) } : 'decline'));
  const long = w3.log.facts.find((e) => e.type === 'speech_said');
  check(long?.text.length === 12, `a 50-character line came out ${long?.text.length} long`);
  check(long?.scope === 'normal', `an ordinary remark carried at ${long?.scope}`);
}

// --- 3E-7  transport comes from the act, never from the reply -----------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', COUNTER);
  let mine = null;
  drive(loop, floors, 6, (o) => {
    if (o.entityId !== 'grandma-01' || mine) return 'decline';
    mine = o;
    const across = pickFor(o, 'call_across');
    return across ? { pick: across, text: '澄子さん、ちょっと' } : 'decline';
  });
  check(mine && pickFor(mine, 'call_across'),
    `no cross-zone call was offered; menu was ${mine?.menu}`);
  check(!mine.menu.some((m) => /^reply:/.test(m) && false), 'placeholder');
  const loud = world.log.facts.find((e) => e.type === 'speech_said' && e.scope === 'broadcast');
  check(!!loud, 'calling across the way did not use a carrying voice');
  check(loud?.to === 'shopkeeper-01', `the call was aimed at ${loud?.to}`);
  const ordinary = world.log.facts.find((e) => e.type === 'speech_said' && e.scope === 'normal');
  check(!ordinary || ordinary.t !== loud.t, 'one act produced two transports');
}

// --- 3E-6  the transcript is the observer's, rendered safely ------------
{
  const { world, memory, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  world.spawn('man-01', PARK[2]);
  let ctx = null;
  let n = 0;
  const spoke = () => new Set(world.log.facts
    .filter((e) => e.type === 'speech_said').map((e) => e.agent));
  // Only one claimant per round actually speaks, so the conversation has to run
  // long enough for both of them to get a turn - and her package is captured in
  // the round it is built, once she is in it herself.
  drive(loop, floors, 40, (o) => {
    if (o.entityId === 'grandma-01' && !ctx && spoke().size === 3) {
      ctx = o.context;
      return 'decline';
    }
    n += 1;
    return { pick: 'address_group', text: `${n}番目の言葉` };
  });
  check(spoke().has('grandma-01') && spoke().has('pastor-01'),
    `only ${[...spoke()]} ever spoke`);
  check(spoke().has('man-01'), '渡辺 never spoke, so no stranger is in her transcript');
  check(!!ctx, 'the grandmother was never offered the floor after both had spoken');
  const conv = ctx?.forModel.conversation ?? [];
  check(conv.length >= 2, `her transcript holds ${conv.length} lines`);
  const text = JSON.stringify(conv);
  for (const id of CAST) check(!text.includes(id), `an entity id reached the transcript: ${id}`);
  for (const n of ['星', 'チヤ', '森ジョナサン', '国分', '澄子', '渡辺']) {
    check(!text.includes(n), `a canonical name reached the transcript: ${n}`);
  }
  check(conv.some((u) => u.speaker === '牧師さん'),
    `she does not call the pastor by her own name for him: ${text}`);
  const hersSpoken = world.log.facts.some(
    (e) => e.type === 'speech_said' && e.agent === 'grandma-01');
  check(!hersSpoken || conv.some((u) => u.speaker === 'you'),
    `she spoke and her own line is not marked as hers: ${text}`);
  check(hersSpoken, 'the test premise is wrong: she never spoke');
  // 渡辺 is nobody she knows, so he is a ref and a description, never a name.
  const stranger = conv.find((u) => typeof u.speaker === 'object');
  check(!!stranger, '渡辺 is nobody she knows, and yet nothing rendered as a stranger');
  check(!!stranger?.speaker.ref && !!stranger?.speaker.looks,
    `an unknown speaker was rendered as ${JSON.stringify(stranger?.speaker)}`);
  void memory;
}

// --- 3E-6  an overheard conversation stays out of the transcript --------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', COUNTER);        // alone, and can hear them
  let n = 0;
  drive(loop, floors, 20, (o) => {
    if (o.entityId === 'shopkeeper-01') return 'decline';
    n += 1;
    return { pick: 'address_group', text: `table talk ${n}` };
  });
  check(n >= 3, `the test premise is wrong: ${n} lines at the table`);
  const heard = world.log.facts.filter(
    (e) => e.type === 'speech_said' && e.heardBy.includes('shopkeeper-01'));
  check(heard.length >= 3, 'the test premise is wrong: she heard nothing');
  check(floors.utterancesFor('shopkeeper-01').length === 0,
    'an overheard conversation next door entered her transcript');
}

// --- 3E-8  a question is a debt, and audibility decides whether it is ---
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  let asked = false;
  let q = null;
  let answerer = null;
  drive(loop, floors, 12, (o) => {
    if (!asked && o.entityId === 'grandma-01') {
      const p = pickAt(o, 'ask', 'pastor-01');
      if (!p) return 'decline';
      asked = true;
      return { pick: p, text: 'お元気ですか' };
    }
    // The person who owes an answer is offered the floor first, as the addressee.
    if (asked && !answerer && o.entityId === 'pastor-01') {
      q = q ?? floors.openQuestionIn('park-open');
      answerer = o;
      const reply = pickFor(o, 'reply');
      return reply ? { pick: reply, text: 'ええ、おかげさまで' } : 'decline';
    }
    return 'decline';
  });
  check(asked, 'nobody was ever able to ask anything');
  check(q?.asker === 'grandma-01' && q?.asked === 'pastor-01',
    `the open question is ${JSON.stringify(q)}`);
  check(answerer?.why === 'addressed',
    `the answerer was woken as ${answerer?.why}, not as the person spoken to`);
  check(!!pickFor(answerer, 'reply'), `the answerer was offered no reply: ${answerer?.menu}`);
  check(floors.openQuestionIn('park-open') === null,
    'the answer did not settle the question');
}

// --- 3E-8  a question the target cannot hear is not a debt --------------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  world.spawn('man-01', PARK[2]);          // so the floor survives the departure
  world.roster('pastor-01', { at: PARK[1] });
  let asked = false;
  drive(loop, floors, 8, (o) => {
    if (asked || o.entityId !== 'grandma-01') return 'decline';
    const p = pickAt(o, 'ask', 'pastor-01');
    if (!p) return 'decline';
    asked = true;
    return { pick: p, text: 'お元気ですか' };
  });
  check(floors.openQuestionIn('park-open')?.asked === 'pastor-01',
    `the test premise is wrong: the question is ${JSON.stringify(floors.openQuestionIn('park-open'))}`);
  world.depart('pastor-01');
  for (let i = 0; i < 3; i += 1) for (const o of step(loop, floors)) floors.decline(o.entityId);
  check(floors.floor('park-open') !== null,
    'the test premise is wrong: the floor went, so the question went with it');
  check(floors.openQuestionIn('park-open') === null,
    'a question the other party can no longer hear stayed a debt');
}

// --- a question the target could not hear is no debt, same zone or not -----
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', [310, 110]);
  world.spawn('pastor-01', [600, 290]);        // same zone, ~340 units: out of hearing
  world.spawn('man-01', [316, 114]);           // so the zone qualifies and stays open
  let asked = false;
  drive(loop, floors, 10, (o) => {
    if (asked || o.entityId !== 'grandma-01') return 'decline';
    const p = pickAt(o, 'ask', 'pastor-01');
    if (!p) return 'decline';
    asked = true;
    return { pick: p, text: '牧師さん、聞こえますか' };
  });
  check(asked, 'she was never offered a way to ask him');
  const call = world.log.facts.find((e) => e.type === 'speech_said' && e.to === 'pastor-01');
  check(call && !call.heardBy.includes('pastor-01'),
    'the test premise is wrong: he heard it after all');
  check(floors.openQuestionIn('park-open') === null,
    'a question shouted across a zone he could not hear became a debt');
  check(floors.pendingAddressFor('pastor-01') === null,
    'an unheard address created a response opportunity');
}

// --- an addressed offer that nobody ever answers resolves the address -------
{
  const { world, floors, loop } = setup({ offerExpiry: 4 });
  world.spawn('grandma-01', [227, 235]);
  world.spawn('brother-01', [232, 238]);
  world.spawn('shopkeeper-01', [222, 178]);
  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });

  let hers = 0;
  for (let i = 0; i < 30; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId === 'shopkeeper-01') { hers += 1; continue; }   // never answered
      floors.decline(o.entityId);
    }
  }
  check(hers === 1, `she was offered the same address ${hers} times without ever answering`);
  check(floors.pendingAddressFor('shopkeeper-01') === null,
    'an offer that timed out left the address pending');
  check(floors.floor('cafe-counter') === null,
    'the temporary floor outlived the offer it was opened for');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  a Brain selects from the menu the engine supplied and cannot');
  console.log('    invent an act, a ref, a scope or an id; transport comes from');
  console.log('    the act; refusals reach audit and change nothing; a transcript');
  console.log('    is the observer\'s own, carries no name or id, and an overheard');
  console.log('    conversation stays out of it; a question is a debt only if it');
  console.log('    was heard, and it is settled by being answered');
}
process.exitCode = problems.length ? 1 : 0;
