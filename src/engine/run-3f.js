/**
 * Phase 3F acceptance: the integrated path, not the helper functions.
 *
 *   node src/engine/run-3f.js
 *
 * docs/specs/engine/phase-3f.md §12, cases 1-14. Case 15 is a real-Brain run and
 * lives in docs/notes/.
 *
 * Scripted, not mocked: every customer choice below is written here. What is
 * under test is the world's half - that a fixed-menu order needs nobody's
 * judgement, that preparation takes the time the menu says, that the person who
 * ordered is the person served, and that none of it invents anything.
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
import { createSocialWeigher, speechBudget, interjectPatience } from './social.js';
import { createGrounding } from './grounding.js';
import { createAmbient } from './ambient.js';
import { createCafe } from './cafe.js';
import { createBrainRuntime } from './brain-runtime.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';
import { buildPrefix } from './prompt.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const CAST = ['grandma-01', 'shopkeeper-01', 'man-01', 'brother-01', 'dog-01'];
const NEAR_TABLE = [[227, 235], [232, 238], [222, 240]];
const COUNTER = [222, 178];
const PARK = [[392, 202], [400, 202]];

function build({ ticksPerDay = 0, config = {} } = {}) {
  const entities = new Map(), seeds = new Map(), minds = new Set();
  const traits = new Map(), beasts = new Map(), prefixes = new Map();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    const deterministic = c.brain === 'deterministic';
    entities.set(id, { appearance: c.appearance, kind: deterministic ? 'animal' : 'person' });
    if (deterministic) beasts.set(id, { bonds: c.bonds ?? [] });
    else { minds.add(id); traits.set(id, c.social); }
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(read(SPEC, 'navgrid.json'));
  const zones = createZones(read(SPEC, 'zones.json'), nav);
  const world = createWorld({
    anchors: read(SPEC, 'anchors.json'), nav, zones, seed: 3060, ticksPerDay
  });
  const ambient = createAmbient(world);
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, {
    entities, attentionHint: (o, e) => memory.attentionHint(o, e)
  });
  const animals = createAnimals(world, { table: beasts, nearRange: perception.config.nearRange });
  const menu = read(SPEC, 'cafe-menu.json');
  const cafe = createCafe(world, zones, {
    menu, attendant: 'shopkeeper-01', config
  });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, animals, cafe,
    weigh: createSocialWeigher({ traitsFor: traits, memory }),
    budgetFor: (id) => speechBudget(traits.get(id)),
    patienceFor: (id) => interjectPatience(traits.get(id)),
    ground: createGrounding(world, zones, { ambient: ambient.state, cafe }),
    makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const brains = createBrainRuntime(world, floors);
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors, venue: cafe
  });
  world.start();
  ambient.record();
  return { world, zones, ambient, memory, perception, cafe, floors, brains, loop,
           menu, traits, prefixes, seeds };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const pick = (o, prefix) => o.menu.find((m) => m.startsWith(prefix)) ?? null;

// --- 1, 2. daylight is authored, and stays ---------------------------------
{
  const { world, ambient, loop, floors, cafe } = build({ ticksPerDay: 120 });
  const set = world.log.facts.find((e) => e.type === 'ambient_set');
  check(set, 'the run recorded no ambient state at all');
  check(set?.daylight === true, 'the run did not start in daylight');
  check(typeof set?.weatherType === 'string' && typeof set?.ambientTempC === 'number',
    `the ambient state is incomplete: ${JSON.stringify(set)}`);

  const ground = createGrounding(world, null, { ambient: ambient.state, cafe });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  const dayparts = new Set();
  for (let i = 0; i < 1200; i += 1) {
    loop.step();
    for (const o of floors.offers()) floors.decline(o.entityId);
    dayparts.add(ambient.state.daypart);
  }
  check(world.day >= 9, `the test premise is wrong: only ${world.day} days ran`);
  check(dayparts.size === 1 && [...dayparts][0] === '午後',
    `ten simulation days moved the daypart: ${[...dayparts]}`);
  check(ambient.state.daylight === true, 'ten simulation days brought on the night');
  void ground;
}

// --- one seed is one afternoon --------------------------------------------
// The weather is in the fact stream, so a redrawn one is a different history.
// Asserted directly rather than left to the determinism run to notice, because
// four weathers means a coin flip agrees a quarter of the time.
{
  const a = createAmbient({ seed: 3060, tick: 0, log: { fact() {} } }).state;
  const b = createAmbient({ seed: 3060, tick: 0, log: { fact() {} } }).state;
  check(JSON.stringify(a) === JSON.stringify(b),
    `one seed gave two afternoons: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  const others = [7, 19, 101, 404, 808, 1234, 55, 900]
    .map((seed) => createAmbient({ seed, tick: 0, log: { fact() {} } }).state.weatherType);
  check(new Set(others).size > 1, `every seed is ${others[0]}`);
  // A director may simply say what kind of day it is.
  const told = createAmbient({ seed: 1, tick: 0, log: { fact() {} } }, {
    config: { weather: { weatherType: '小雨', ambientTempC: 15, feltCondition: '肌寒い' } }
  }).state;
  check(told.weatherType === '小雨' && told.ambientTempC === 15,
    'an authored day was overruled by the seed');
  check(told.daylight === true, 'an authored day turned the lights off');
}

// --- the obligation becomes due, in words, into a room that wakes for it ----
// Etiquette rather than a game mechanic: it must fire, it must reach the
// character as something they notice, and it must not fire on somebody who has
// only just sat down. The grace is long enough here that the table has gone
// quiet first, so the only thing that can wake it is the obligation itself.
{
  const { world, zones, ambient, cafe, floors, loop } = build({ config: { graceTicks: 200 } });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  world.spawn('brother-01', NEAR_TABLE[2]);     // a child, and not a customer
  loop.step();
  check(cafe.visitOf('grandma-01')?.state === 'settling',
    'somebody who had just sat down already owed an order');
  check(!cafe.obligationFor('grandma-01'), 'she was told to order on arrival');

  // Everybody declines until the table is asleep, and nothing is owed yet.
  let asleep = false;
  for (let i = 0; i < 120 && !asleep; i += 1) {
    loop.step();
    for (const o of floors.offers()) floors.decline(o.entityId);
    asleep = floors.floor('near-table')?.state === 'dormant';
  }
  check(asleep, 'the test premise is wrong: the table never went quiet');
  check(!world.log.facts.some((e) => e.type === 'venue_obligation'),
    'the test premise is wrong: the obligation came due before the table slept');

  // Now the only social fact left in this room is the obligation.
  let due = null;
  const after = [];
  for (let i = 0; i < 400; i += 1) {
    loop.step();
    for (const o of floors.offers()) {
      if (due) after.push(o);
      floors.decline(o.entityId);
    }
    due = due ?? world.log.facts.find((e) => e.type === 'venue_obligation'
      && e.state === 'order_due' && e.customer === 'grandma-01');
  }
  check(due, 'the obligation never came due');
  check(after.length > 0, 'the obligation came due into a sleeping room and woke nobody');
  check(after.some((o) => o.zone === 'near-table'),
    `it woke ${[...new Set(after.map((o) => o.zone))]} instead of the table it came due at`);

  const ground = createGrounding(world, zones, { ambient: ambient.state, cafe });
  check(ground.self('grandma-01').noticing,
    'she was never told, in words, that she had been sitting a while');
  check(!ground.self('shopkeeper-01').noticing,
    'the woman running the shop was told to buy something from herself');
  check(world.log.facts.some((e) => e.type === 'venue_obligation'
    && e.customer === 'man-01'), 'the test premise is wrong: the other adult was exempt too');
  check(!world.log.facts.some((e) => e.type === 'venue_obligation'
    && cafe.config.exempt.includes(e.customer)), 'a child was asked to buy something');
  check(!ground.self('brother-01').noticing, 'a child was told to order or leave');
}

// --- while her hands are full, nobody's grace runs out ---------------------
// Workload shaping rather than scripted behaviour (venue-interactions 7): she
// is one person, and pressing a second customer to order while she is already
// making something would be the world nagging on a timer.
{
  const { world, cafe, loop } = build({ config: { graceTicks: 30 } });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  loop.step();
  cafe.order('grandma-01', 'tea_assam');       // 210 ticks of steeping
  for (let i = 0; i < 120; i += 1) loop.step();
  check(cafe.orderOf('order-1')?.startedAt !== null,
    'the test premise is wrong: she never started it');
  check(cafe.visitOf('man-01')?.state === 'settling',
    `the other customer was pressed to order while she was busy: ${cafe.visitOf('man-01')?.state}`);
  for (let i = 0; i < 400; i += 1) loop.step();
  check(cafe.visitOf('man-01')?.state === 'order_due',
    'and once she was free again he was never asked at all');
}

// --- 3, 4. the bootstrap is session-level; the turn carries grounding ------
{
  const { world, ambient, cafe, floors, loop, memory } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  const card = read(ROOT, 'characters', 'grandma-01', 'character.json');
  const prefix = buildPrefix(card, read2('grandma-01'), {
    ambient: ambient.state, catalogue: cafe.catalogue(), venueName: cafe.menu.venueName
  });
  check(prefix.includes(ambient.state.weatherType),
    'the session bootstrap does not say what the weather is');
  check(prefix.includes('珈琲（ハウスブレンド）'),
    'the session bootstrap does not say what the cafe sells');
  check(prefix.includes('沒列出來的東西就是沒有'),
    'the session bootstrap does not say the menu is all there is');

  let o = null;
  for (let i = 0; i < 8 && !o; i += 1) { loop.step(); [o] = floors.offers(); }
  check(o, 'the test premise is wrong: nobody was offered the floor');
  const fm = o?.context.forModel ?? {};
  check(fm.self?.where && fm.self?.posture && fm.self?.time,
    `the turn carries no grounding: ${JSON.stringify(fm.self)}`);
  // ...and the bootstrap is NOT repeated in it. Say it once (4).
  check(!JSON.stringify(fm).includes(ambient.state.weatherType),
    'the whole ambient bootstrap is being resent on every turn');
  check(!JSON.stringify(fm).includes('珈琲（ハウスブレンド）'),
    'the whole menu is being resent on every turn');
  // Nor is it a memory (2.2).
  check(!JSON.stringify(memory.episodesFor('grandma-01')).includes(ambient.state.weatherType),
    'the weather was written into private memory');
  void world;
}

function read2(id) {
  return readFileSync(join(ROOT, 'characters', id, 'self.md'), 'utf8');
}

// --- 5, 6, 7, 8, 9. one ordinary order, start to finish --------------------
{
  const { world, cafe, floors, loop, brains } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);

  // 5. She can order what the cafe sells, and nothing else exists to order.
  let mine = null;
  for (let i = 0; i < 40 && !mine; i += 1) {
    loop.step();
    for (const o of brains.admit(floors.offers())) {
      if (o.entityId === 'grandma-01') mine = o; else { floors.decline(o.entityId); brains.answered(o.entityId); }
    }
  }
  check(mine, 'the test premise is wrong: she was never offered the floor');
  const orders = (mine?.menu ?? []).filter((m) => m.startsWith('order:'));
  check(orders.length > 20, `only ${orders.length} things are orderable`);
  check(!orders.some((m) => /curry|カレー/i.test(m)), 'the cafe sells curry');
  check(orders.every((m) => cafe.item(m.split(':')[1])),
    'a choice was offered for something the menu does not have');
  // By reason, not merely refused: an invented item that happens to be caught by
  // the "not somewhere you can order" gate would leave the menu itself untested,
  // and the menu is the thing that says a curry does not exist here.
  check(cafe.order('grandma-01', 'curry').refused === 'not on the menu today',
    `an invented item was refused as "${cafe.order('grandma-01', 'curry').refused}"`);
  check(!world.log.facts.some((e) => e.type === 'order_placed' && e.item === 'curry'),
    'an invented item reached the fact stream');

  // 6. A fixed-menu order goes through without waking her Brain to approve it.
  const tea = 'order:tea_sencha';
  check(mine.menu.includes(tea), 'the test premise is wrong: 煎茶 was not offered');
  const r = floors.commit('grandma-01', { pick: tea, text: '煎茶をひとつ、お願いします' });
  check(!r.refused, `an ordinary order was refused: ${r.refused}`);
  brains.answered('grandma-01');

  const offersToKeeper = [];
  let served = null;
  for (let i = 0; i < 600 && !served; i += 1) {
    loop.step();
    for (const o of brains.admit(floors.offers())) {
      if (o.entityId === 'shopkeeper-01') offersToKeeper.push(o);
      floors.decline(o.entityId);
      brains.answered(o.entityId);
    }
    served = world.log.facts.find((e) => e.type === 'order_served');
  }
  const facts = world.log.facts;
  const placed = facts.find((e) => e.type === 'order_placed');
  const started = facts.find((e) => e.type === 'preparation_started');
  const ready = facts.find((e) => e.type === 'order_ready');
  check(placed?.item === 'tea_sencha', 'the order was not the item she picked');
  check(started, 'nothing was ever prepared');
  check(ready, 'the order never became ready');

  // 7. The time the menu says, not a number the runtime made up.
  const item = cafe.item('tea_sencha');
  check(ready.t - started.t === item.prepTicks + cafe.config.handlingTicks,
    `煎茶 took ${ready.t - started.t} ticks and the menu says ${item.prepTicks}`);

  // 8. The person who ordered is the person served, and the obligation clears.
  check(served?.customer === 'grandma-01',
    `it was served to ${served?.customer}`);
  check(facts.some((e) => e.type === 'venue_obligation' && e.state === 'satisfied'
    && e.customer === 'grandma-01'), 'the obligation was never satisfied');
  check(cafe.visitOf('grandma-01')?.state === 'served',
    `she is left in state ${cafe.visitOf('grandma-01')?.state}`);

  // 6 again, the strong half: her Brain was not woken to accept it. She may be
  // offered the floor for the ordinary social reasons - being spoken to is one -
  // but no offer exists whose reason is the order.
  const audit = world.log.audit;
  check(audit.some((e) => e.type === 'venue_routed' && e.route === 'deterministic'),
    'the order was not recorded as having gone the deterministic way');
  const routedToBrain = audit.filter((e) => e.type === 'venue_routed' && e.route === 'brain');
  check(routedToBrain.length === 0,
    'an ordinary fixed-menu order was escalated to the shopkeeper');
  void offersToKeeper;

  // 9. An open-ended question is the other branch: routed, never executed.
  cafe.routeSocial('grandma-01', 'ask_shopkeeper:recommendation');
  check(world.log.audit.some((e) => e.type === 'venue_routed' && e.route === 'brain'),
    'an open-ended question was not routed to a Brain');
  check(!world.log.facts.some((e) => e.type === 'order_placed' && e.customer === 'grandma-01'
    && e.item !== 'tea_sencha'), 'an open-ended question was guessed into an order');
}

// --- 7 again: nerikiri is finished by hand, in steps -----------------------
{
  const { world, cafe, floors, loop } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  let mine = null;
  for (let i = 0; i < 40 && !mine; i += 1) {
    loop.step();
    for (const o of floors.offers()) {
      if (o.entityId === 'grandma-01') mine = o; else floors.decline(o.entityId);
    }
  }
  check(floors.commit('grandma-01',
    { pick: 'order:nerikiri_ajisai', text: '紫陽花をひとつ' }).refused === undefined,
    'a nerikiri order was refused');
  for (let i = 0; i < 500; i += 1) {
    loop.step();
    for (const o of floors.offers()) floors.decline(o.entityId);
  }
  const steps = world.log.facts.filter((e) => e.type === 'preparation_step');
  const item = cafe.item('nerikiri_ajisai');
  check(steps.length === item.steps.length,
    `a complex nerikiri took ${steps.length} steps and the menu says ${item.steps.length}`);
  check(steps.map((e) => e.step).join('|') === item.steps.join('|'),
    'the shaping steps came out in the wrong order');
  const started = world.log.facts.find((e) => e.type === 'preparation_started');
  const ready = world.log.facts.find((e) => e.type === 'order_ready');
  check(ready.t - started.t >= 240, 'a complex nerikiri was collapsed into a quick plating');
}

// --- work that can overlap does overlap ------------------------------------
{
  const { world, cafe, floors, loop } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  for (let i = 0; i < 40; i += 1) {
    loop.step();
    for (const o of floors.offers()) {
      if (o.entityId === 'grandma-01' && !cafe.orders().length) {
        floors.commit(o.entityId, { pick: 'order:tea_assam', text: 'アッサムを' });
      } else floors.decline(o.entityId);
    }
  }
  cafe.order('man-01', 'nerikiri_ume');
  let both = false;
  for (let i = 0; i < 600; i += 1) {
    loop.step();
    for (const o of floors.offers()) floors.decline(o.entityId);
    const running = cafe.orders().filter((o) => o.startedAt !== null && !o.servedAt);
    if (running.length === 2) both = true;
  }
  check(both, 'the sweet waited for the tea instead of being shaped while it steeped');
  const tea = cafe.item('tea_assam').prepTicks;
  const sweet = cafe.item('nerikiri_ume').prepTicks;
  const readies = world.log.facts.filter((e) => e.type === 'order_ready');
  check(readies.length === 2, `${readies.length} of two orders became ready`);
  const span = Math.max(...readies.map((e) => e.t))
    - world.log.facts.find((e) => e.type === 'preparation_started').t;
  check(span < tea + sweet,
    `two orders took ${span} ticks, which is the sum rather than the critical path`);
}

// --- what is off the menu today is off the choices too ---------------------
// Seasonal availability is the reason the menu carries a flag rather than a
// fixed list: 雪 in summer is not a rejection to learn from, it is an item that
// is not there. It has to vanish from the choices AND be refused if asked for
// directly, because those are two different callers.
{
  const { world, cafe, floors, loop, menu } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  menu.items.find((i) => i.id === 'nerikiri_yuki').available = false;

  let mine = null;
  for (let i = 0; i < 40 && !mine; i += 1) {
    loop.step();
    for (const o of floors.offers()) {
      if (o.entityId === 'grandma-01') mine = o; else floors.decline(o.entityId);
    }
  }
  check(mine, 'the test premise is wrong: she was never offered the floor');
  check(!mine.menu.includes('order:nerikiri_yuki'),
    'something the shop is not serving today was still offered');
  check(mine.menu.includes('order:nerikiri_ume'),
    'the test premise is wrong: nothing at all was orderable');
  check(!cafe.catalogue().some((i) => i.id === 'nerikiri_yuki'),
    'the session bootstrap still lists it');
  check(cafe.order('grandma-01', 'nerikiri_yuki').refused === 'not on the menu today',
    'it was accepted anyway when asked for directly');
  check(!world.log.facts.some((e) => e.type === 'order_placed' && e.item === 'nerikiri_yuki'),
    'an unavailable item reached the fact stream');
}

// --- 12, 13. latency is not fictional time --------------------------------
{
  const { world, floors, loop, brains } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  let held = null;
  for (let i = 0; i < 20 && !held; i += 1) {
    loop.step();
    [held] = brains.admit(floors.offers());
  }
  check(held, 'the test premise is wrong: nothing was ever dispatched');
  // 12. Nobody answers, for a long time. The request is still outstanding.
  for (let i = 0; i < 500; i += 1) {
    loop.step();
    brains.admit(floors.offers());
  }
  check(brains.inFlight().some((o) => o.entityId === held.entityId),
    'five hundred ticks turned a pending request into a decline');
  check(!world.log.audit.some((e) => e.type === 'floor_declined' && e.agent === held.entityId),
    'the floor declined on behalf of a Brain that had not answered');

  // 13. Infrastructure gives up. That is auditable, and it says who did it.
  brains.drop(held.entityId, 'provider timeout');
  const dropped = world.log.audit.find((e) => e.type === 'brain_dropped');
  check(dropped?.agent === held.entityId && dropped?.reason === 'provider timeout',
    'a dropped request left no audit line naming the reason');
  const decline = world.log.audit.find(
    (e) => e.type === 'floor_declined' && e.agent === held.entityId);
  check(decline?.by === 'infrastructure',
    `a dropped request was recorded as ${decline?.by} silence`);
  check(!world.log.facts.some((e) => e.type === 'brain_dropped'),
    'infrastructure policy reached the fact stream');
}

// --- bounded concurrency, and a queue that does not lose anybody -----------
{
  // Two rooms, so two floors can hand out an opportunity in the same tick and a
  // global limit of one has something to bind on.
  const { world, floors, loop } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('man-01', NEAR_TABLE[1]);
  world.spawn('brother-01', PARK[0]);
  world.spawn('shopkeeper-01', PARK[1]);
  const runtime = createBrainRuntime(world, floors, { config: { maxInFlight: 1 } });
  let queued = 0;
  for (let i = 0; i < 60; i += 1) {
    loop.step();
    const offers = floors.offers();
    const admitted = runtime.admit(offers);
    queued += offers.length - admitted.length;
    for (const o of admitted) {
      floors.decline(o.entityId);
      for (const next of runtime.answered(o.entityId)) floors.decline(next.entityId);
    }
  }
  check(runtime.inFlight().length <= 1,
    `${runtime.inFlight().length} Brains were thinking at once against a limit of one`);
  check(queued > 0, 'the test premise is wrong: the limit never bound');
  check(world.log.audit.some((e) => e.type === 'brain_queued'),
    'a queued opportunity left no audit line');
  // Queued is not dropped. Somebody passed over because the scene was busy has to
  // come back when a slot frees, or bounded concurrency is a way of silently
  // losing turns - and a lost turn looks exactly like a character with nothing
  // to say. Drain the queue and account for every one of them.
  const held = runtime.waiting().length;
  check(held > 0, 'the test premise is wrong: nothing was left waiting to drain');
  for (let i = 0; i < 40 && runtime.waiting().length; i += 1) {
    for (const id of runtime.inFlight().map((o) => o.entityId)) {
      floors.decline(id);
      for (const next of runtime.answered(id)) floors.decline(next.entityId);
    }
    loop.step();
    runtime.admit(floors.offers());
  }
  check(runtime.waiting().length === 0,
    `${runtime.waiting().length} opportunities never left the queue`);
  const accounted = new Set([
    ...world.log.audit.filter((e) => e.type === 'brain_dispatched').map((e) => e.agent),
    ...world.log.audit.filter((e) => e.type === 'brain_stale').map((e) => e.agent)
  ]);
  for (const e of world.log.audit.filter((e2) => e2.type === 'brain_queued')) {
    check(accounted.has(e.agent),
      `${e.agent} was queued and neither sent nor recorded as stale`);
  }
}

// --- and one that waited until it stopped being a question -----------------
// A queued opportunity can go stale while it waits: the person walks out, the
// Floor cancels, and by the time a slot frees there is nothing to ask. Sending
// it anyway costs a provider call to be told 'no offer outstanding', which is
// the exact waste a bounded scheduler exists to avoid.
{
  const { world, floors, loop } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('man-01', NEAR_TABLE[1]);
  world.spawn('brother-01', PARK[0]);
  world.spawn('shopkeeper-01', PARK[1]);
  const runtime = createBrainRuntime(world, floors, { config: { maxInFlight: 1 } });
  let waiting = null;
  for (let i = 0; i < 60 && !waiting; i += 1) {
    loop.step();
    runtime.admit(floors.offers());
    [waiting] = runtime.waiting();
  }
  check(waiting, 'the test premise is wrong: nothing was ever queued');
  // The person it was queued for walks out of the scene entirely.
  world.depart(waiting.entityId);
  for (let i = 0; i < 4; i += 1) loop.step();
  check(!world.present(waiting.entityId), 'the test premise is wrong: he is still here');
  // Now free the slot. What comes back must not include a question nobody is
  // there to answer.
  const freed = runtime.inFlight()[0];
  const next = freed ? runtime.answered(freed.entityId) : [];
  check(!next.some((o) => o.entityId === waiting.entityId),
    'a queued request was sent to somebody who had already left');
  check(world.log.audit.some((e) => e.type === 'brain_stale' && e.agent === waiting.entityId),
    'it was dropped from the queue without a word about why');
}

// --- 10, 11. the 3E contracts are unchanged, and speech is not duplicated ---
{
  const { world, floors, loop } = build();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('brother-01', NEAR_TABLE[1]);
  world.spawn('man-01', NEAR_TABLE[2]);
  world.spawn('shopkeeper-01', COUNTER);
  const reasons = new Set();
  let dup = null;
  for (let i = 0; i < 200 && !dup; i += 1) {
    loop.step();
    for (const o of floors.offers()) {
      reasons.add(o.why);
      const fm = o.context.forModel;
      const mine = new Set((fm.conversation ?? []).map((u) => u.said));
      const echo = (fm.recentPerceivedEvents ?? [])
        .filter((e) => e.said !== undefined && mine.has(e.said));
      if (echo.length) dup = { who: o.entityId, echo };
      const partner = o.entityId === 'grandma-01' ? 'brother-01'
        : o.entityId === 'brother-01' ? 'grandma-01' : null;
      const p = partner && pick(o, 'reply:');
      if (p) floors.commit(o.entityId, { pick: p, text: 'そうねえ' });
      else floors.decline(o.entityId);
    }
  }
  check(!dup, `${dup?.who} was handed their own conversation twice: ${JSON.stringify(dup?.echo)}`);
  check(reasons.has('addressed'), 'nobody was ever offered a turn for being spoken to');
  check(world.log.facts.some((e) => e.type === 'speech_said'), 'nobody spoke at all');
  // Cross-zone overhearing still arrives through perception, because that is not
  // the observer's conversation.
  const hers = world.log.audit.filter(
    (e) => e.type === 'floor_offered' && e.agent === 'shopkeeper-01' && e.why === 'overheard');
  check(hers.length > 0, 'the woman at the counter never heard the table at all');
}

// --- 14. the same seed is the same afternoon -------------------------------
{
  const twice = [0, 1].map(() => {
    const { world, floors, loop, cafe, perception } = build();
    world.spawn('grandma-01', NEAR_TABLE[0]);
    world.spawn('shopkeeper-01', COUNTER);
    world.spawn('man-01', NEAR_TABLE[1]);
    world.spawn('brother-01', NEAR_TABLE[2]);
    let ordered = false;
    for (let i = 0; i < 800; i += 1) {
      loop.step();
      for (const o of floors.offers()) {
        if (!ordered && o.entityId === 'grandma-01' && pick(o, 'order:tea_matcha')) {
          ordered = !floors.commit(o.entityId,
            { pick: 'order:tea_matcha', text: '抹茶を' }).refused;
        } else floors.decline(o.entityId);
      }
    }
    return {
      stream: JSON.stringify(world.log.facts),
      held: perception.heldCount(),
      orders: cafe.orders().length
    };
  });
  check(twice[0].stream === twice[1].stream, 'two runs of one seed diverged');
  check(twice[0].held === 0, `${twice[0].held} perception contexts were left held`);
  check(twice[0].stream.includes('order_served'), 'the test premise is wrong: nothing was served');
  check(twice[0].orders === 0,
    `${twice[0].orders} finished orders were still on the books at the end`);
}

// --- the cup is collected even from somebody who stays all afternoon -------
// Found by a soak rather than by reading: clearing only when the customer left
// meant an order placed by somebody who stays never cleared at all, which is
// unbounded growth wearing the clothes of a plausible rule.
{
  const { world, cafe, loop } = build({ config: { clearTicks: 60 } });
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  loop.step();
  cafe.order('grandma-01', 'tea_hojicha');
  for (let i = 0; i < 400; i += 1) loop.step();
  check(world.log.facts.some((e) => e.type === 'order_served'),
    'the test premise is wrong: it was never served');
  check(world.present('grandma-01'), 'the test premise is wrong: she left');
  const cleared = world.log.facts.find((e) => e.type === 'order_cleared');
  check(cleared, 'the cup was never collected from somebody who stayed');
  check(cleared?.reason === undefined,
    'it was recorded as having been cleared because she left');
  check(cafe.orders().length === 0, 'the order is still on the books');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('OK  the run starts in recorded daylight and ten simulation days do');
console.log('    not bring on the night; the bootstrap is said once and the turn');
console.log('    carries grounding; a fixed-menu order needs nobody\'s judgement,');
console.log('    takes the time the menu says, is shaped by hand where the menu');
console.log('    says so, overlaps work that can overlap, and reaches the person');
console.log('    who ordered it; an invented item has nowhere to enter; an');
console.log('    open-ended question routes to a Brain; five hundred ticks never');
console.log('    fabricate a decline and a dropped request says who dropped it;');
console.log('    same-floor speech is not handed over twice; and one seed is one');
console.log('    afternoon with nothing left held');
