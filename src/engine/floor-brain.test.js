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

function setup({ budgetFor = null, ...config } = {}) {
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
    minds, config, budgetFor,
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

  // ...but a line that HAS sentences is cut at the end of one, never mid-word.
  // The first real Brain run committed 「…脱いでお」 and told nobody, which is
  // not a shorter sentence - it is a broken one.
  const { world: w4, floors: f4, loop: l4 } = setup({ speechLimit: 20 });
  w4.spawn('grandma-01', PARK[0]);
  w4.spawn('pastor-01', PARK[1]);
  drive(l4, f4, 6, (x) => (x.entityId === 'grandma-01'
    ? { pick: 'address_group', text: 'あら、こんにちは。今日はいいお天気ですねえ。' } : 'decline'));
  const cut = w4.log.facts.find((e) => e.type === 'speech_said');
  check(cut?.text === 'あら、こんにちは。',
    `a line was cut at ${JSON.stringify(cut?.text)} instead of at the full stop`);
  check(w4.log.audit.some((e) => e.type === 'speech_trimmed' && e.sent > e.kept),
    'a line was silently shortened');

  // And the budget is the character's own, not one number for the whole cast:
  // 240 for everybody truncated the most talkative character on her first turn
  // and would never have bound on the least talkative at all.
  const { world: w5, floors: f5, loop: l5 } = setup({
    speechLimit: 480, budgetFor: (id) => (id === 'grandma-01' ? 6 : 480)
  });
  w5.spawn('grandma-01', PARK[0]);
  w5.spawn('pastor-01', PARK[1]);
  drive(l5, f5, 8, (x) => ({ pick: 'address_group', text: 'あ'.repeat(30) }));
  const byWho = new Map();
  for (const e of w5.log.facts) {
    if (e.type === 'speech_said') byWho.set(e.agent, e.text.length);
  }
  check(byWho.get('grandma-01') === 6,
    `her own budget was ignored: ${byWho.get('grandma-01')}`);
  check(byWho.get('pastor-01') === 30,
    `somebody else was cut to her budget: ${byWho.get('pastor-01')}`);
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
  const loud = world.log.facts.find((e) => e.type === 'speech_said' && e.scope === 'broadcast');
  check(!!loud, 'calling across the way did not use a carrying voice');
  check(loud?.to.includes('shopkeeper-01'), `the call was aimed at ${loud?.to}`);
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
  let qAtCommit = 'unchecked';
  // Sampled in the very tick the ask resolves. The periodic guard would clear a
  // wrongly-created debt on the NEXT tick, so only this catches a question that
  // existed long enough to rank its asker up for one round.
  drive(loop, floors, 10, (o) => {
    if (asked) {
      if (qAtCommit === 'unchecked' && world.log.facts.some(
        (e) => e.type === 'speech_said' && e.to.includes('pastor-01'))) {
        qAtCommit = floors.openQuestionIn('park-open');
      }
      return 'decline';
    }
    if (o.entityId !== 'grandma-01') return 'decline';
    const p = pickAt(o, 'ask', 'pastor-01');
    if (!p) return 'decline';
    asked = true;
    return { pick: p, text: '牧師さん、聞こえますか' };
  });
  if (qAtCommit === 'unchecked') qAtCommit = floors.openQuestionIn('park-open');
  check(asked, 'she was never offered a way to ask him');
  const call = world.log.facts.find(
    (e) => e.type === 'speech_said' && e.to.includes('pastor-01'));
  check(call && !call.heardBy.includes('pastor-01'),
    'the test premise is wrong: he heard it after all');
  check(floors.openQuestionIn('park-open') === null,
    'a question shouted across a zone he could not hear became a debt');
  check(qAtCommit === null,
    'the debt existed for the tick it was created in, and ranked her up for it');
  check(floors.pendingAddressFor('pastor-01') === null,
    'an unheard address created a response opportunity');
}

// --- a Brain that has not answered is not silence --------------------------
// The owner correction: a floor waits for the decision it asked for, however
// long the provider takes, and never decides a decline because ticks elapsed.
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', [227, 235]);
  world.spawn('brother-01', [232, 238]);
  world.spawn('shopkeeper-01', [222, 178]);
  world.say('grandma-01', '澄子さん', { to: 'shopkeeper-01' });

  let hers = 0;
  for (let i = 0; i < 60; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.entityId === 'shopkeeper-01') { hers += 1; continue; }   // still thinking
      floors.decline(o.entityId);
    }
  }
  check(hers === 1, `she was asked ${hers} times while she had not answered once`);
  check(floors.floor('cafe-counter')?.state === 'offered',
    'the floor gave up on a Brain that was still thinking');
  check(floors.pendingAddressFor('shopkeeper-01') !== null,
    'an unanswered address stopped being owed after enough ticks');
  check(!world.log.audit.some((e) => e.type === 'floor_declined' && e.agent === 'shopkeeper-01'),
    'waiting was recorded as a decline');

  // But the world changing under a pending request does invalidate it. She walks
  // away, and the counter stops waiting on somebody who is not there.
  world.roster('shopkeeper-01', { at: [222, 178] });
  world.depart('shopkeeper-01');
  for (let i = 0; i < 4; i += 1) for (const o of step(loop, floors)) floors.decline(o.entityId);
  check(floors.floor('cafe-counter') === null,
    'the counter went on waiting for somebody who had gone home');
  check(floors.pendingAddressFor('shopkeeper-01') === null,
    'an address stayed owed by somebody who has gone home');
}

// --- and a table does not freeze because one of its people walked off -------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  world.spawn('man-01', PARK[2]);
  let held = null;
  for (let i = 0; i < 4 && !held; i += 1) {
    for (const o of step(loop, floors)) {
      if (!held) held = o.entityId; else floors.decline(o.entityId);
    }
  }
  check(!!held, 'nobody was offered the floor at all');
  world.roster(held, { at: PARK[0] });
  world.depart(held);                              // never answers, and leaves
  let spoke = 0;
  for (let i = 0; i < 20; i += 1) {
    for (const o of step(loop, floors)) {
      const r = floors.commit(o.entityId, { pick: 'address_group', text: 'まだここにいる' });
      if (!r.refused) spoke += 1;
    }
  }
  check(world.log.audit.some((e) => e.type === 'floor_cancelled' && e.agent === held),
    'the request outlived the person it was waiting for');
  check(spoke > 3, `the zone managed ${spoke} turns after one person walked off mid-request`);
}

// --- the three rules a two-person room cannot exercise ---------------------
// One breath has one volume, one open question, and at most `actLimit` acts.
// Each needs three distinct people to test at all, which is why they live here
// rather than beside the dog.
{
  const { world, memory, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('man-01', [222, 240]);
  world.spawn('shopkeeper-01', COUNTER);      // another zone, reachable by shouting
  let tried = null;
  for (let i = 0; i < 30 && !tried; i += 1) {
    for (const o of step(loop, floors)) {
      const here = pickAt(o, 'greet', o.entityId === 'grandma-01' ? 'brother-01' : 'grandma-01');
      const other = pickAt(o, 'ask', o.entityId === 'man-01' ? 'brother-01' : 'man-01');
      const shout = pickAt(o, 'call_across', 'shopkeeper-01');
      if (!here || !other || !shout) { floors.decline(o.entityId); continue; }
      const hereWho = o.entityId === 'grandma-01' ? 'brother-01' : 'grandma-01';
      const otherWho = o.entityId === 'man-01' ? 'brother-01' : 'man-01';
      tried = {
        speaker: o.entityId,
        targets: [otherWho, hereWho],
        volumes: floors.commit(o.entityId, { picks: [here, shout], text: 'x' }).refused,
        // Three acts that are otherwise entirely legal - same volume, three
        // different targets - so only the limit itself can refuse them.
        three: floors.commit(o.entityId, {
          picks: [here, other, 'address_group'], text: 'x'
        }).refused,
        questions: floors.commit(o.entityId, {
          picks: [pickAt(o, 'ask', o.entityId === 'grandma-01' ? 'brother-01' : 'grandma-01'), other],
          text: 'x'
        }).refused,
        // ...and the pair that IS legal, on the same live offer, so a refusal
        // above cannot be the offer having gone stale.
        // Every pick has to be on the menu, not just the first one: a second
        // act is exactly where an invented choice would try to ride in.
        invented: floors.commit(o.entityId, {
          picks: [here, 'reply:seen-99'], text: 'x'
        }).refused,
        smuggled: floors.commit(o.entityId, {
          picks: [here, 'order:coffee'], text: 'x'
        }).refused,
        // Deliberately naming the second target first, so the assertions below
        // are about e.to[1] rather than e.to[0]: a rule that only ever reads the
        // head of the list would otherwise look correct.
        both: floors.commit(o.entityId, { picks: [other, here], text: 'ねえ、それでね' }).refused
      };
    }
  }
  check(tried, 'the test premise is wrong: nobody was offered all three kinds of act');
  check(tried?.volumes, 'a quiet remark was welded to a shout across the room');
  check(tried?.three, 'three acts came out of one breath');
  check(tried?.questions, 'two questions were asked in one breath');
  // By reason, not merely refused: an invented choice that happens to be caught
  // downstream by the stale-ref or volume check would leave the menu gate itself
  // untested, and the menu gate is the one that says a Brain cannot make things up.
  check(tried?.invented === 'not a choice this offer supplied',
    `an invented ref was refused as "${tried?.invented}" rather than by the menu`);
  check(tried?.smuggled === 'not a choice this offer supplied',
    `an invented act was refused as "${tried?.smuggled}" rather than by the menu`);
  check(tried && !tried.both, `two ordinary acts at two people were refused: ${tried?.both}`);

  // BOTH people were spoken to, so both are owed a turn and both heard it as
  // addressed to them - not just whoever the speaker happened to name first.
  const addressed = new Set();
  const toldSo = new Set();
  for (let i = 0; i < 14; i += 1) {
    for (const o of step(loop, floors)) {
      const fm = o.context.forModel;
      if (o.why === 'addressed') addressed.add(o.entityId);
      if (fm.conversation?.some((u) => u.said === 'ねえ、それでね' && u.to?.includes('you'))) {
        toldSo.add(o.entityId);
      }
      floors.decline(o.entityId);
    }
  }
  for (const who of tried.targets) {
    check(addressed.has(who), `${who} was spoken to and was never offered an answer`);
    check(toldSo.has(who), `${who} read the line as though it were not aimed at them`);
  }
  // Both halves of "we have spoken" landed, for BOTH people named - the
  // speaker's own record and each listener's. This used to be asserted on the
  // perceived events themselves; phase-3f 10.1 stops handing an observer their
  // own conversation twice, so the check moved to what those events feed, which
  // is the stronger property anyway.
  for (const who of tried.targets) {
    check(memory.recall(tried.speaker, who)?.spokenWith > 0,
      `the speaker did not record having spoken to ${who}`);
    check(memory.recall(who, tried.speaker)?.spokenWith > 0,
      `${who} did not record having been spoken to`);
  }
}

// --- two shouts in one breath, into two different rooms --------------------
// 「澄子さん、小野さん！」 is one thing said. Both of them are in rooms of their
// own, so each one's floor exists only because a heard direct address reached
// it - which is the cross-zone handoff, and the only thing that can carry it
// to the SECOND person named.
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);    // so her own floor qualifies
  world.spawn('shopkeeper-01', COUNTER);       // one room away
  world.spawn('pastor-01', [336, 170]);        // another room, still within a shout
  let shouted = false;
  for (let i = 0; i < 30 && !shouted; i += 1) {
    for (const o of step(loop, floors)) {
      const a = pickAt(o, 'call_across', 'shopkeeper-01');
      const b = pickAt(o, 'call_across', 'pastor-01');
      if (o.entityId !== 'grandma-01' || !a || !b) { floors.decline(o.entityId); continue; }
      const r = floors.commit(o.entityId, { picks: [a, b], text: '澄子さん、牧師さん！' });
      check(!r.refused, `two shouts in one breath were refused: ${r.refused}`);
      shouted = !r.refused;
    }
  }
  check(shouted, 'the test premise is wrong: she was never able to shout at both');

  const addressed = new Set();
  for (let i = 0; i < 14; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.why === 'addressed') addressed.add(`${o.entityId}|${o.zone}`);
      floors.decline(o.entityId);
    }
  }
  const said = world.log.facts.filter((e) => e.type === 'speech_said');
  check(said.length === 1, `${said.length} utterances came out of one breath`);
  check(said[0]?.scope === 'broadcast', `two shouts carried at ${said[0]?.scope}`);
  check(said[0]?.to.length === 2, `the shout was aimed at ${JSON.stringify(said[0]?.to)}`);

  check(addressed.has('shopkeeper-01|cafe-counter'),
    'the first person shouted at was never offered a floor of her own');
  check(addressed.has('pastor-01|far-table'),
    'the second person shouted at was never offered a floor of his own');
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
  console.log('    was heard, and it is settled by being answered; a line is as');
  console.log('    long as the person and is cut at a full stop; and one breath');
  console.log('    has one volume, one question, and at most two acts');
}
process.exitCode = problems.length ? 1 : 0;
