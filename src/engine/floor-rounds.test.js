/**
 * Phase 3E offer rounds, quiet, dormancy and re-arm.
 *
 * Owner correction 2026-08-26: conversation offers are sequential (K=1), and
 * provider latency never becomes a simulation-tick timeout.
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

const CAST = ['grandma-01', 'pastor-01', 'man-01', 'shopkeeper-01', 'brother-01'];
const PARK = [[392, 202], [400, 202], [396, 206]];
const NEAR_TABLE = [[227, 235], [232, 238]];
const COUNTER = [222, 178];

function setup({ weigh = null, ...config } = {}) {
  const entities = new Map();
  const minds = new Set();
  const traits = new Map();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
    traits.set(id, c.social);
  }
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, zones, seed: 20260826 });
  const perception = createPerception(world, zones, { entities });
  const floors = createFloors(world, zones, perception, {
    minds, config,
    weigh: weigh === true ? createSocialWeigher({ traitsFor: traits }) : weigh,
    patienceFor: weigh === true ? (id) => interjectPatience(traits.get(id)) : null
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, floors
  });
  world.start();
  return { world, zones, nav, perception, floors, loop, traits };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const step = (loop, floors) => { loop.step(); return floors.offers(); };

/**
 * Step n times, answering every offer with `policy(offer)` - 'decline', or an
 * object to commit. An intentionally unanswered offer blocks only its Floor;
 * world ticks and deterministic runtime continue.
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
  drive(loop, floors, 8);
  world.say('grandma-01', '牧師さん、こちらへ', { to: 'pastor-01' });

  let offers = [];
  for (let i = 0; i < 4 && !offers.length; i += 1) offers = step(loop, floors);
  check(offers.length === 1, `an addressee round offered ${offers.length} people`);
  check(offers[0]?.entityId === 'pastor-01',
    `the floor went to ${offers[0]?.entityId} rather than the person spoken to`);
  check(offers[0]?.why === 'addressed', `why was ${offers[0]?.why}`);
}

// --- open floors ask one Brain at a time, in rank order -----------------
{
  const { world, floors, loop } = setup();
  for (const [i, id] of ['grandma-01', 'pastor-01', 'man-01'].entries()) {
    world.spawn(id, PARK[i]);
  }
  let first = [];
  for (let i = 0; i < 3 && !first.length; i += 1) first = step(loop, floors);
  check(first.length === 1, `an open floor exposed ${first.length} simultaneous offers`);
  const firstId = first[0]?.entityId;
  floors.decline(firstId);
  const second = step(loop, floors);
  check(second.length === 1, `after one decline the floor exposed ${second.length} offers`);
  check(second[0]?.entityId !== firstId,
    'declining the first ranked character did not advance to the next one');
  check(!world.log.audit.some((e) => e.type === 'floor_lost'),
    'sequential conversation still produced a counterfactual floor_lost');
}

// --- unanswered means still thinking, not decline -----------------------
{
  const { world, perception, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  let offers = [];
  for (let i = 0; i < 3 && !offers.length; i += 1) offers = step(loop, floors);
  const o = offers[0];
  check(!!o, 'nothing was offered at all');
  const issuedAt = world.tick;

  for (let i = 0; i < 1200; i += 1) {
    const more = step(loop, floors);
    check(more.length === 0, 'a second Brain was offered while the first was still pending');
  }
  const f = floors.floor('park-open');
  check(world.tick > issuedAt + 1000, 'the world clock did not continue while the Brain was pending');
  check(f?.state === 'offered' && f?.offeredTo?.[0] === o.entityId,
    'elapsed simulation ticks expired or replaced the outstanding Brain offer');
  check(perception.heldCount() === 1,
    `the outstanding Brain context was not retained exactly once: held=${perception.heldCount()}`);
  check(!world.log.audit.some((e) => e.type === 'floor_declined' && e.agent === o.entityId),
    'elapsed simulation ticks were recorded as an implicit decline');

  floors.decline(o.entityId);
  const next = step(loop, floors);
  check(perception.heldCount() === 1,
    'settling the first context and opening the next did not keep one outstanding context');
  check(next.length === 1 && next[0].entityId !== o.entityId,
    'an explicit decline did not advance the sequential offer round');
  floors.decline(next[0].entityId);
  step(loop, floors);
  check(perception.heldCount() === 0,
    'all answered contexts did not settle');
}

// --- everyone declines: the round ends and the floor sleeps -------------
{
  const { world, floors, loop } = setup();
  for (const [i, id] of ['grandma-01', 'pastor-01', 'man-01'].entries()) {
    world.spawn(id, PARK[i]);
  }
  const asked = new Set(drive(loop, floors, 12).map((o) => o.entityId));
  check(asked.size === 3, `only ${asked.size} of the three were ever asked`);
  const f = floors.floor('park-open');
  check(f?.state === 'dormant', `the floor is ${f?.state} after a round with no taker`);
  check(world.log.facts.every((e) => e.type !== 'speech_said'),
    'declining produced a speech fact');
  const after = step(loop, floors);
  check(after.length === 0, `a dormant floor opened ${after.length} offers`);
}

// --- 3E-5: background machinery does not wake a sleeping floor ----------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);
  drive(loop, floors, 8);
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

  world.spawn('man-01', PARK[2]);
  const woke = step(loop, floors);
  const f = floors.floor('park-open');
  check(f?.state !== 'dormant', 'an arrival did not wake the floor');
  check(f?.socialSpell > asleep.socialSpell, 'waking did not start a new social spell');
  check(woke.length === 1, `the woken floor opened ${woke.length} offers instead of one`);
  for (const o of woke) floors.decline(o.entityId);
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
  drive(loop, floors, 8);
  const asleep = floors.floor('cafe-counter');
  check(asleep?.state === 'dormant', 'the test premise is wrong: the counter is not asleep');

  world.reserve('cafe-counter', 'shopkeeper-01');
  world.occupy('cafe-counter', 'shopkeeper-01');
  check(world.log.facts.some((e) => e.type === 'resource_occupied' && e.resource === 'cafe-counter'),
    'the test premise is wrong: the station was never occupied');
  check(step(loop, floors).length === 0, 'the workstation woke the floor');
  check(floors.floor('cafe-counter')?.state === 'dormant', 'the workstation woke the floor');

  world.reserve('counter-stool-1', 'grandma-01');
  world.occupy('counter-stool-1', 'grandma-01');
  const woke = step(loop, floors);
  check(floors.floor('cafe-counter')?.state !== 'dormant', 'a seat did not wake the floor');
  check(woke.length === 1, `the woken floor opened ${woke.length} offers instead of one`);
  for (const o of woke) floors.decline(o.entityId);
}

// --- one overheard nudge per source spell -------------------------------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', COUNTER);          // alone, 57 units away: audible
  let nudges = 0;
  let lines = 0;
  drive(loop, floors, 60, (o) => {
    if (o.entityId === 'shopkeeper-01') {
      check(o.why === 'overheard', `she was offered the floor as ${o.why}`);
      nudges += 1;
      return 'decline';
    }
    lines += 1;
    return { pick: 'address_group', text: `line ${lines}` };
  });
  check(lines >= 10, `the test premise is wrong: only ${lines} lines were spoken`);
  check(floors.floor('near-table')?.state !== 'dormant',
    'the test premise is wrong: the source conversation died');
  check(nudges === 1, `a ${lines}-line conversation nudged her ${nudges} times`);
  check(floors.floor('cafe-counter') === null, 'the temporary counter floor never closed');
}

// --- current geometry can create the nudge before another line ----------
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('shopkeeper-01', PARK[0]);          // initially far from the table

  let claimed = false;
  let firstLine = null;
  let pendingSource = null;
  for (let i = 0; i < 12 && (!firstLine || !pendingSource); i += 1) {
    const offers = step(loop, floors);
    for (const o of offers) {
      if (o.entityId === 'shopkeeper-01') { floors.decline(o.entityId); continue; }
      if (!claimed) {
        floors.commit(o.entityId, { pick: 'address_group', text: 'まだ遠くで話している' });
        claimed = true;
      } else {
        // Deliberately leave the next source Brain unanswered. The active Floor
        // is still a meeting; no second utterance is needed for the observer to
        // notice it after current geometry changes.
        pendingSource = o;
      }
    }
    firstLine = world.log.facts.find((e) => e.type === 'speech_said' && e.text === 'まだ遠くで話している');
  }
  check(!!firstLine, 'the source conversation never produced its first line');
  check(!!pendingSource, 'the source floor did not keep its next Brain decision pending');
  check(!firstLine?.heardBy.includes('shopkeeper-01'),
    'the geometry test premise is wrong: she already heard the first line');

  const speechCount = world.log.facts.filter((e) => e.type === 'speech_said').length;
  // Test-only authoritative reposition through the World API. This isolates the
  // rule from path shape: only current geometry changes, and no new speech does.
  world.spawn('shopkeeper-01', COUNTER);
  let nudge = null;
  for (let i = 0; i < 4 && !nudge; i += 1) {
    const offers = step(loop, floors);
    nudge = offers.find((o) => o.entityId === 'shopkeeper-01') ?? null;
  }
  check(world.log.facts.filter((e) => e.type === 'speech_said').length === speechCount,
    'another utterance happened before the geometry-created nudge could be observed');
  check(nudge?.why === 'overheard',
    `moving into current earshot produced ${nudge?.why ?? 'no'} social opportunity`);
  check(!(nudge?.context.forModel.recentPerceivedEvents ?? [])
    .some((e) => e.said === 'まだ遠くで話している'),
    'moving into earshot retroactively delivered words spoken while she was too far away');
  check(!(nudge?.context.forModel.conversation ?? [])
    .some((e) => e.said === 'まだ遠くで話している'),
    'moving into earshot retroactively inserted the old line into her transcript');
  if (nudge) floors.decline(nudge.entityId);
}

// --- two people sitting quietly together are not "in a conversation" -------
// clarifications 10.3 says never for an actor already on a floor with an ACTIVE
// conversation. Reading that as "never for anyone with company" left the two
// characters the mechanism exists for permanently inert beside a party they
// could hear.
{
  const { world, floors, loop } = setup();
  world.spawn('grandma-01', PARK[0]);
  world.spawn('pastor-01', PARK[1]);          // the party, in the park
  world.spawn('shopkeeper-01', [336, 170]);   // the quiet pair, at the far table
  world.spawn('brother-01', [342, 174]);      // ~65 units off: audible
  const quiet = new Set(['shopkeeper-01', 'brother-01']);

  const nudged = new Map();
  let lines = 0;
  drive(loop, floors, 60, (o) => {
    if (quiet.has(o.entityId)) {
      if (o.why === 'overheard') nudged.set(o.entityId, (nudged.get(o.entityId) ?? 0) + 1);
      return 'decline';                        // they never join in
    }
    lines += 1;
    return { pick: 'address_group', text: `park ${lines}` };
  });

  check(lines >= 10, `the test premise is wrong: the park said ${lines} lines`);
  const heard = world.log.facts.filter((e) => e.type === 'speech_said'
    && e.heardBy.includes('shopkeeper-01')).length;
  check(heard >= 10, `the test premise is wrong: they heard ${heard} of it`);
  check(floors.floor('far-table')?.state === 'dormant',
    'the test premise is wrong: their own table is still awake');

  // Deliberately not pinned to which of them: the far table is 64 units from one
  // park speaker and 71 from the other, and eligibility is judged against
  // whoever spoke last, so naming the winner would be pinning the geometry
  // rather than the rule. The rule is that having company is not being in a
  // conversation - before this it was nought for both, forever.
  const total = [...quiet].reduce((n, id) => n + (nudged.get(id) ?? 0), 0);
  check(total >= 1, 'two people sitting quietly together were never nudged at all');
  for (const id of quiet) {
    check((nudged.get(id) ?? 0) <= 1,
      `${id} was polled ${nudged.get(id)} times by one conversation`);
  }
}

// --- walking into a room is how you join it ---------------------------------
// agent_arrived is only for coming into the SCENE. Between rooms people walk,
// and until this was whitelisted a sleeping table could not be woken by anybody
// coming over to it - which left a measured run 99% silent.
{
  // Walkable cells, found rather than written down: the centroids the other
  // scenarios stand on are furniture, which is fine to stand on and impossible
  // to path from or to.
  const { world, zones, nav, floors, loop } = setup();
  const walkable = (zone, n) => {
    const out = [];
    for (let y = 60; y < 330 && out.length < n; y += 2) {
      for (let x = 20; x < 620 && out.length < n; x += 2) {
        if (zones.at(x, y) === zone && nav.walkableAt(x, y)) out.push([x, y]);
      }
    }
    return out;
  };
  const park = walkable('park-open', 2);
  const table = walkable('near-table', 3);
  check(park.length === 2 && table.length === 3,
    `the test premise is wrong: found ${park.length} park and ${table.length} table cells`);
  world.spawn('grandma-01', park[0]);
  world.spawn('pastor-01', park[1]);
  world.spawn('shopkeeper-01', table[0]);
  world.spawn('brother-01', table[1]);
  drive(loop, floors, 8);
  check(floors.floor('near-table')?.state === 'dormant',
    'the test premise is wrong: the table is still awake');

  check(floors.floor('park-open')?.state === 'dormant',
    'the test premise is wrong: the park is still awake');

  // Somebody sets off from the park. Neither the room they left nor the room
  // they are heading for is woken by the setting off: only by the arrival.
  check(world.moveTo('grandma-01', table[2]), 'the test premise is wrong: she could not set off');
  const onSetOff = step(loop, floors);
  for (const o of onSetOff) floors.decline(o.entityId);
  check(floors.floor('park-open')?.state === 'dormant',
    'the park was woken by somebody merely setting off out of it');
  check(floors.floor('near-table')?.state === 'dormant',
    'a table was woken by somebody merely setting off towards it');

  // She arrives, and now it is a new social situation.
  let woke = [];
  for (let i = 0; i < 200 && !woke.length; i += 1) {
    woke = step(loop, floors).filter((o) => o.zone === 'near-table');
    for (const o of woke) floors.decline(o.entityId);
  }
  check(world.log.facts.some((e) => e.type === 'move_completed' && e.agent === 'grandma-01'),
    'the test premise is wrong: she never got there');
  check(woke.length > 0, 'a table stayed asleep while somebody walked up to it');
}

// The old "two people answering each other own the room forever" scenario moved
// to interject.test.js when the fix moved: waiting is no longer a ranking term
// that can outgrow a direct addressee, it is how long somebody sits before the
// Floor offers them a boundary to come in at.

// --- waiting is counted from the start of THIS conversation ----------------
// A floor that has slept and woken must not treat everybody as having waited
// since round zero: that hands the whole room the maximum bonus at once, and a
// bonus that large makes a direct address ignorable. Which is the failure this
// scenario watches for - it is not a spare assertion about a counter.
{
  const { world, zones, nav, floors, loop } = setup({ weigh: true });
  const walkable = (zone, n) => {
    const out = [];
    for (let y = 60; y < 330 && out.length < n; y += 2) {
      for (let x = 20; x < 620 && out.length < n; x += 2) {
        if (zones.at(x, y) === zone && nav.walkableAt(x, y)) out.push([x, y]);
      }
    }
    return out;
  };
  const table = walkable('near-table', 3);
  const park = walkable('park-open', 1);
  check(table.length === 3 && park.length === 1, 'the test premise is wrong: no walkable cells');
  world.spawn('grandma-01', table[0]);
  world.spawn('brother-01', table[1]);
  world.spawn('man-01', park[0]);            // outside, and the quietest of the cast

  // A long exchange, so the round counter climbs well past the waiting cap.
  for (let i = 0; i < 80; i += 1) {
    for (const o of step(loop, floors)) {
      const pair = o.entityId === 'grandma-01' ? 'brother-01' : 'grandma-01';
      const pick = o.menu.find(
        (m) => m.startsWith('reply:') && o.context.refs.get(m.split(':')[1]) === pair);
      if (!pick || floors.commit(o.entityId, { pick, text: 'そうねえ' }).refused) {
        floors.decline(o.entityId);
      }
    }
  }
  check(floors.floor('near-table')?.round > 20,
    `the test premise is wrong: only ${floors.floor('near-table')?.round} rounds ran`);

  // They fall silent; the table goes to sleep.
  drive(loop, floors, 12);
  check(floors.floor('near-table')?.state === 'dormant',
    'the test premise is wrong: the table never went quiet');

  // Somebody walks over, which wakes it into a NEW conversation.
  check(world.moveTo('man-01', table[2]), 'the test premise is wrong: he could not set off');
  let woke = null;
  for (let i = 0; i < 300 && !woke; i += 1) {
    for (const o of step(loop, floors)) {
      if (o.zone === 'near-table' && !woke) woke = o; else floors.decline(o.entityId);
    }
  }
  check(woke, 'the test premise is wrong: the table never woke');

  // Whoever got the first word says it to the newcomer. He must be next.
  const to = woke.menu.find(
    (m) => m.startsWith('greet:') && woke.context.refs.get(m.split(':')[1]) === 'man-01');
  check(to, 'the test premise is wrong: the newcomer was not addressable');
  check(!floors.commit(woke.entityId, { pick: to, text: 'あら' }).refused, 'the greeting was refused');
  let next = [];
  for (let i = 0; i < 10 && !next.length; i += 1) next = step(loop, floors);
  check(next[0]?.entityId === 'man-01' && next[0]?.why === 'addressed',
    `the man who had just been spoken to was passed over for ${next[0]?.entityId}`);
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  one Brain is offered the floor at a time; explicit decline');
  console.log('    advances to the next ranked character; elapsed simulation ticks');
  console.log('    never fabricate a decline; a full declined round sleeps; background');
  console.log('    machinery stays quiet; social events re-arm; one overheard nudge');
  console.log('    is allowed per source spell, including when current movement/geometry');
  console.log('    newly brings an observer into earshot without retroactive transcript');
}
process.exitCode = problems.length ? 1 : 0;