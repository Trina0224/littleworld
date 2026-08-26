/**
 * Phase 3E-4 and 3E-5: offer rounds, quiet, dormancy and re-arm.
 *
 *   node src/engine/floor-rounds.test.js
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

const CAST = ['grandma-01', 'pastor-01', 'man-01', 'shopkeeper-01', 'brother-01'];
const PARK = [[392, 202], [400, 202], [396, 206]];
const NEAR_TABLE = [[227, 235], [232, 238]];
const COUNTER = [222, 178];

function setup(config = {}) {
  const entities = new Map();
  const minds = new Set();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260826 });
  const perception = createPerception(world, zones, { entities });
  const floors = createFloors(world, zones, perception, { minds, config });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, floors
  });
  world.start();
  return { world, zones, perception, floors, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
/** Step once and return the offers that opened. */
const step = (loop, floors) => { loop.step(); return floors.offers(); };

/**
 * Step n times, answering every offer with `policy(offer)` - 'decline', or an
 * object to commit. Returns every offer seen. A round that is never answered
 * blocks the floor until offerExpiry, so a scenario has to answer.
 */
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

// --- an addressee is offered first, alone -------------------------------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  world.spawn('man-01', PARK[2]);
  drive(loop, floors, 4);                       // settle whatever is outstanding
  world.say('grandma-01', '牧師さん、こちらへ', { to: 'pastor-01' });

  let offers = [];
  for (let i = 0; i < 4 && !offers.length; i += 1) offers = step(loop, floors);
  check(offers.length === 1, `an addressee round offered ${offers.length} people`);
  check(offers[0]?.entityId === 'pastor-01',
    `the floor went to ${offers[0]?.entityId} rather than the person spoken to`);
  check(offers[0]?.why === 'addressed', `why was ${offers[0]?.why}`);
}

// --- rank decides the taker, never who answered first -------------------
{
  const { world, floors, loop } = setup();
  for (const [i, id] of ['grandma-01', 'pastor-01', 'man-01'].entries()) {
    world.spawn(id, PARK[i]);
  }
  let offers = [];
  for (let i = 0; i < 3 && offers.length < 2; i += 1) offers = step(loop, floors);
  check(offers.length === 3, `an open floor offered ${offers.length}, expected the batch of 3`);

  // Everyone wants to speak, and the lowest-ranked answers first.
  const order = offers.map((o) => o.entityId);
  for (const id of [...order].reverse()) floors.commit(id, { speak: `${id} speaks` });
  const heldBefore = offers.map((o) => o.epochId);
  step(loop, floors);

  const said = world.log.facts.filter((e) => e.type === 'speech_said');
  check(said.length === 1, `${said.length} people spoke out of one floor`);
  check(said[0]?.agent === order[0],
    `the floor went to ${said[0]?.agent}; rank said ${order[0]}`);
  const lost = world.log.audit.filter((e) => e.type === 'floor_lost').map((e) => e.agent);
  check(lost.length === 2 && !lost.includes(order[0]),
    `floor_lost recorded ${lost}`);
  void heldBefore;
}

// --- a loser commits nothing and loses nothing --------------------------
{
  const { world, perception, floors, loop } = setup();
  for (const [i, id] of ['grandma-01', 'pastor-01', 'man-01'].entries()) {
    world.spawn(id, PARK[i]);
  }
  drive(loop, floors, 4);
  world.say('grandma-01', 'みなさん、こんばんは');     // heard by both others
  let offers = [];
  for (let i = 0; i < 4 && offers.length < 2; i += 1) offers = step(loop, floors);
  const contenders = offers.filter((o) => o.entityId !== 'grandma-01');
  check(contenders.length >= 2, 'the test premise is wrong: not enough contenders');

  const queued = new Map(contenders.map((o) => [o.entityId, o.context.forModel
    .recentPerceivedEvents.filter((e) => e.said === 'みなさん、こんばんは').length]));
  check([...queued.values()].every((n) => n === 1),
    'the test premise is wrong: the utterance was not in both packages');

  for (const o of offers) {
    if (o.entityId === 'grandma-01') floors.decline(o.entityId);
    else floors.commit(o.entityId, { speak: `${o.entityId} replies` });
  }
  const next = step(loop, floors);

  const winner = world.log.facts.filter((e) => e.type === 'speech_said').at(-1).agent;
  const loser = contenders.map((o) => o.entityId).find((id) => id !== winner);
  check(!world.log.facts.some((e) => e.type === 'speech_said' && e.text.includes(loser)),
    'a losing claim reached the world as speech');

  // The loser's queue was restored and then immediately taken into the next
  // offer, which is the whole round trip: still owed, and offered again.
  const owed = (id) => [
    ...perception.pendingFor(id).map((e) => e.text),
    ...(next.find((o) => o.entityId === id)?.context.forModel
      .recentPerceivedEvents.map((e) => e.said) ?? [])
  ];
  check(owed(loser).includes('みなさん、こんばんは'),
    'the loser lost the utterance it was woken for');
  check(!owed(winner).includes('みなさん、こんばんは'),
    'the winner was not charged for the context it used');
}

// --- everyone declines: the round ends and the floor sleeps -------------
{
  const { world, floors, loop } = setup();
  for (const [i, id] of ['grandma-01', 'pastor-01', 'man-01'].entries()) {
    world.spawn(id, PARK[i]);
  }
  const asked = new Set(drive(loop, floors, 8).map((o) => o.entityId));
  check(asked.size === 3, `only ${asked.size} of the three were ever asked`);
  const f = floors.floor('park-open');
  check(f?.state === 'dormant', `the floor is ${f?.state} after a round with no taker`);
  check(world.log.facts.every((e) => e.type !== 'speech_said'),
    'declining produced a speech fact');
  const after = step(loop, floors);
  check(after.length === 0, `a dormant floor opened ${after.length} offers`);
}

// --- an offer nobody answers becomes a decline --------------------------
{
  const { world, floors, loop } = setup({ offerExpiry: 5 });
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  let offers = [];
  for (let i = 0; i < 3 && !offers.length; i += 1) offers = step(loop, floors);
  check(offers.length > 0, 'nothing was offered at all');
  for (let i = 0; i < 12; i += 1) step(loop, floors);
  check(floors.floor('park-open')?.state === 'dormant',
    'an offer nobody ever answered kept the floor awake forever');
}

// --- 3E-5: background machinery does not wake a sleeping floor ----------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  drive(loop, floors, 6);
  const asleep = floors.floor('park-open');
  check(asleep?.state === 'dormant', 'the test premise is wrong: not asleep');

  for (let i = 0; i < 20; i += 1) {
    world.log.fact(world.tick, 'move_started', {
      agent: 'pastor-01', from: PARK[1], path: [PARK[1], PARK[0]], arriveTick: world.tick + 1
    });
    world.log.fact(world.tick, 'activity_started', { agent: 'pastor-01', activity: 'prepare' });
    world.log.fact(world.tick, 'resource_occupied', {
      resource: 'counter-station-1', kind: 'station', by: 'pastor-01'
    });
    const more = step(loop, floors);
    check(more.length === 0, 'background machinery opened an offer in a dormant zone');
    for (const o of more) floors.decline(o.entityId);
  }
  check(floors.floor('park-open')?.socialSpell === asleep.socialSpell,
    'background machinery started a new social spell');

  // Somebody arriving is a new social situation, and it is a new spell.
  world.spawn('man-01', PARK[2]);
  const woke = step(loop, floors);
  const f = floors.floor('park-open');
  check(f?.state !== 'dormant', 'an arrival did not wake the floor');
  check(f?.socialSpell > asleep.socialSpell, 'waking did not start a new social spell');
  check(woke.length > 0, 'the woken floor opened no offer');
}

// --- a seat wakes a floor; the shopkeeper's workstation does not --------
{
  const { world, zones, floors, loop } = setup();
  const A = [222, 178];
  const B = [228, 178];
  check(zones.at(A[0], A[1]) === 'cafe-counter' && zones.at(B[0], B[1]) === 'cafe-counter',
    'the test premise is wrong: those positions are not both at the counter');
  world.spawn('shopkeeper-01', A);
  world.spawn('grandma-01', B);
  drive(loop, floors, 6);
  const asleep = floors.floor('cafe-counter');
  check(asleep?.state === 'dormant', 'the test premise is wrong: the counter is not asleep');

  // Seats and stations are one thing to a reservation, on purpose, so the
  // difference has to be made here: her claiming her workstation is the
  // machinery the whitelist exists to exclude.
  world.reserve('cafe-counter', 'shopkeeper-01');
  world.occupy('cafe-counter', 'shopkeeper-01');
  check(world.log.facts.some((e) => e.type === 'resource_occupied' && e.resource === 'cafe-counter'),
    'the test premise is wrong: the station was never occupied');
  check(step(loop, floors).length === 0, 'the workstation woke the floor');
  check(floors.floor('cafe-counter')?.state === 'dormant', 'the workstation woke the floor');

  // A stool is somebody sitting down with you.
  world.reserve('counter-stool-1', 'grandma-01');
  world.occupy('counter-stool-1', 'grandma-01');
  const woke = step(loop, floors);
  check(floors.floor('cafe-counter')?.state !== 'dormant', 'a seat did not wake the floor');
  check(woke.length > 0, 'the woken floor opened no offer');
  for (const o of woke) floors.decline(o.entityId);
}

// --- clarifications §10: one overheard nudge per source spell -----------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', COUNTER);          // alone, 57 units away: audible
  let nudges = 0;
  let lines = 0;
  // A LIVE conversation: the two at the table keep taking the floor, so their
  // floor never sleeps and the spell never turns over.
  const seen = drive(loop, floors, 40, (o) => {
    if (o.entityId === 'shopkeeper-01') {
      check(o.why === 'overheard', `she was offered the floor as ${o.why}`);
      nudges += 1;
      return 'decline';
    }
    lines += 1;
    return { speak: `line ${lines}` };
  });
  check(lines >= 10, `the test premise is wrong: only ${lines} lines were spoken`);
  check(floors.floor('near-table')?.state !== 'dormant',
    'the test premise is wrong: the source conversation died');
  check(nudges === 1, `a ${lines}-line conversation nudged her ${nudges} times`);
  void seen;
  check(floors.floor('cafe-counter') === null, 'the temporary counter floor never closed');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  the person spoken to is offered the floor alone; rank decides');
  console.log('    the taker and a loser commits nothing and loses nothing; a');
  console.log('    round with no taker puts the floor to sleep and an unanswered');
  console.log('    offer counts as a decline; background machinery never wakes it');
  console.log('    and an arrival does, with a new social spell; one overheard');
  console.log('    nudge for a whole conversation');
}
process.exitCode = problems.length ? 1 : 0;
