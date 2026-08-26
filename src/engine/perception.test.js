/**
 * Phase 3C: every leak test the spec asks for, and the acceptance scenario.
 *
 *     node src/engine/perception.test.js
 *
 * phase-3c-perception.md section 14 and phase-3c-implementation-clarifications.md
 * section 6 between them list twenty-odd properties. Most of them are one line to
 * assert and would be one line to lose, which is exactly why they are here rather
 * than in a paragraph promising the code is careful.
 *
 * The leak tests are written against real character files, not fixtures. A test
 * that invents its own appearance strings would still pass if the engine started
 * reading bible.md, so the check that matters - that no private prose reaches a
 * model-visible field - takes a real sentence out of a real bible and asserts it
 * appears nowhere.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createPlacement } from './placement.js';
import { createActivityRuntime, sitAndRest } from './activity.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');

const anchors = JSON.parse(readFileSync(join(SPEC, 'anchors.json'), 'utf8'));
const grid = JSON.parse(readFileSync(join(SPEC, 'navgrid.json'), 'utf8'));
const zoneSpec = JSON.parse(readFileSync(join(SPEC, 'zones.json'), 'utf8'));

const CAST = ['grandma-01', 'pastor-01', 'shopkeeper-01', 'gentleman-01', 'boy-01', 'dog-01'];

function entityTable() {
  const m = new Map();
  for (const id of CAST) {
    const c = JSON.parse(readFileSync(join(ROOT, 'characters', id, 'character.json'), 'utf8'));
    // Exactly two fields cross the boundary. Everything else in the file -
    // knows, sprite, brain, the folder name itself - stays behind it.
    m.set(id, { appearance: c.appearance, kind: c.brain === 'deterministic' ? 'animal' : 'person' });
  }
  return m;
}

function setup({ ticksPerDay = 0 } = {}) {
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, seed: 20260825, ticksPerDay });
  const perception = createPerception(world, zones, { entities: entityTable() });
  const placement = createPlacement(world, zones, nav);
  world.start();
  return { world, zones, nav, perception, placement };
}

/** Every string a model would see, flattened, so one scan covers the lot. */
function modelText(ctx) {
  return JSON.stringify(ctx.forModel);
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

// ---------------------------------------------------------------- zones ----
{
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  let wrong = 0;
  for (const [x, y, want] of zoneSpec.selfCheck.samples) {
    if (zones.at(x, y) !== want) wrong += 1;
  }
  check(wrong === 0, `zone lookup disagrees with zones-derive.py on ${wrong} sampled positions`);

  // 6.10 boundary assignment is deterministic: ask the same point many times.
  const edge = zoneSpec.zones.find((z) => z.shape === 'polygon').points[0];
  const first = zones.at(edge[0], edge[1]);
  let stable = true;
  for (let i = 0; i < 50; i += 1) if (zones.at(edge[0], edge[1]) !== first) stable = false;
  check(stable, 'zone assignment on a polygon vertex is not stable');

  // 6.9 membership comes from the world spec, not from constants in the engine.
  const src = readFileSync(join(HERE, 'zones.js'), 'utf8');
  check(!/\[\s*\d{2,3}\s*,\s*\d{2,3}\s*\]/.test(src),
    'zones.js contains hard-coded coordinates; geometry must come from zones.json');
}

// ------------------------------------------------- the 3C acceptance run ----
// A and B stand near each other in the park; C is at the cafe; D is rostered but
// absent today. B speaks at ordinary volume.
const { world, zones, perception, placement } = setup();
world.spawn('grandma-01', [470, 262]);          // A, park-open
world.spawn('pastor-01', [488, 266]);           // B, park-open, ~19 units from A
world.spawn('shopkeeper-01', [180, 240]);       // C, near-table, ~310 units from B
world.spawn('dog-01', [455, 258]);              // an animal, near A
world.roster('gentleman-01', { at: [200, 250], every: 6 });   // D: rostered, never arrives

world.say('pastor-01', 'こんにちは、いいお天気ですね。', { scope: 'normal' });
perception.tick();

const ctxA = perception.contextFor('grandma-01');
const ctxC = perception.contextFor('shopkeeper-01');
const textA = modelText(ctxA);
const textC = modelText(ctxC);

// 14.1 / 14.2  no canonical name, no id, no sprite key, no file path
for (const [ctx, who] of [[ctxA, 'A'], [ctxC, 'C']]) {
  const t = modelText(ctx);
  for (const id of CAST) {
    check(!t.includes(id), `${who}'s model context contains the entity id ${id}`);
  }
  for (const name of ['星', 'チヤ', '森', 'ジョナサン', '国分', '澄子', '熊田', '菅野']) {
    check(!t.includes(name), `${who}'s model context contains the canonical name ${name}`);
  }
  check(!t.includes('sprite') && !t.includes('character.json') && !t.includes('/characters/'),
    `${who}'s model context leaks a machine field`);
  check(!('entityId' in JSON.parse(t).sensoryState.visible[0] ?? {}),
    `${who}'s visible entries carry entityId`);
}

// 14.3  no private prose, checked against the real files
{
  const bible = readFileSync(join(ROOT, 'characters', 'pastor-01', 'bible.md'), 'utf8');
  const self = readFileSync(join(ROOT, 'characters', 'pastor-01', 'self.md'), 'utf8');
  const phrases = [...bible.matchAll(/[^\n。]{12,24}。/g)].slice(0, 40).map((m) => m[0])
    .concat([...self.matchAll(/[^\n。]{12,24}。/g)].slice(0, 40).map((m) => m[0]));
  const hit = phrases.find((p) => textA.includes(p) || textC.includes(p));
  check(!hit, `private prose reached a model-visible field: ${hit}`);
}

// 14.4  an absent rostered character is in nobody's perception
check(!world.present('gentleman-01'), 'the rostered absentee is somehow present');
check(!textA.includes('羽織') && !textC.includes('羽織'),
  'the absent character was described to someone');
check(perception.pendingFor('gentleman-01').length === 0,
  'an absent character accumulated perceived events');

// 14.5 / 14.6  the words reach A; C gets neither the words nor a garbled version
{
  const heardA = ctxA.forModel.recentPerceivedEvents.find((e) => e.kind === 'speech_heard');
  check(!!heardA, 'A stood beside the speaker and heard nothing');
  check(heardA?.said === 'こんにちは、いいお天気ですね。', 'A heard the wrong words');
  check(!textC.includes('いいお天気'), 'C is 310 units away and received the speech text');
}

// 14.7  same world, different positions, different packages
check(textA !== textC, 'two observers in different places received identical observations');
check(ctxA.forModel.sensoryState.visible.length !== ctxC.forModel.sensoryState.visible.length
   || textA !== textC, 'the two packages are not actually distinguishable');

// 14.8  the global log is not an observation package
check(!textA.includes('world_started') && !textA.includes('agent_spawned'),
  'raw fact types reached the model-visible package');

// 14.9  no raw coordinates
check(!/"(at|x|y)"\s*:/.test(textA), 'model-visible package contains raw coordinates');
check(/near|nearby|across/.test(textA), 'no human-scale distance language in the package');

// 14.10  perception is synchronous; nothing is dispatched or awaited
{
  check(!(perception.tick() instanceof Promise), 'perception.tick() returned a promise');
  const src = readFileSync(join(HERE, 'perception.js'), 'utf8');
  check(!/\bawait\b|\bfetch\(|XMLHttpRequest/.test(src),
    'perception.js contains an await or a network call');
}

// 14.10a / 12.1  own_action_failed reaches the actor and nobody else
{
  const { world: w2, perception: p2 } = setup();
  w2.spawn('boy-01', [470, 262]);
  w2.spawn('grandma-01', [474, 264]);          // right beside the failure
  const runtime = createActivityRuntime(w2);
  runtime.assign('boy-01', sitAndRest('no-such-seat', 5));
  runtime.tick();
  p2.tick();
  const mine = p2.pendingFor('boy-01').filter((e) => e.kind === 'own_action_failed');
  const theirs = p2.pendingFor('grandma-01').filter((e) => e.kind === 'own_action_failed');
  check(mine.length === 1, 'the acting agent was not told its own attempt failed');
  check(theirs.length === 0, 'a bystander was told about someone else\'s failed attempt');
  const ctx = p2.contextFor('grandma-01');
  check(!modelText(ctx).includes('own_action_failed'),
    'own_action_failed reached another observer\'s package');
}

// 15  move one character and ask again: the same objective cast, a different
// subjective package. This is the property the whole phase exists to produce.
{
  const before = JSON.stringify(ctxC.forModel.sensoryState.visible.map((v) => v.distance));
  world.agents.get('shopkeeper-01').at = [478, 264];   // C walks over to the bench
  perception.tick();
  const after = perception.contextFor('shopkeeper-01');
  const nowDistances = JSON.stringify(after.forModel.sensoryState.visible.map((v) => v.distance));
  check(before !== nowDistances,
    'moving an observer did not change what it perceives');
  check(after.forModel.sensoryState.visible.some((v) => v.distance === 'near'),
    'C walked to the bench and still had nobody near');
  check(!modelText(after).includes('shopkeeper'), 'the moved observer leaked its own id');
}

// ------------------------------------------------- refs (clarifications) ----
// 6.1 / 6.4  two similar entities, distinct stable refs inside one snapshot
{
  const { world: w3, perception: p3 } = setup();
  w3.spawn('grandma-01', [470, 262]);
  w3.spawn('pastor-01', [480, 262]);
  w3.spawn('shopkeeper-01', [490, 262]);
  p3.tick();
  const ctx = p3.contextFor('grandma-01');
  const refs = ctx.forModel.sensoryState.visible.map((v) => v.ref);
  check(new Set(refs).size === refs.length, 'two entities shared one ref in a single snapshot');
  check(refs.length === 2, `expected 2 visible, got ${refs.length}`);
  const resolved = refs.map((r) => p3.resolve(ctx.epochId, r));
  check(new Set(resolved).size === resolved.length, 'two refs resolved to the same entity');

  // 6.2  a ref carries no hint of who it points at
  for (const r of refs) check(/^seen-\d+$/.test(r), `ref ${r} is not opaque`);

  // 6.3  a stale ref fails rather than being rebound
  const later = p3.contextFor('grandma-01');
  check(later.epochId !== ctx.epochId, 'a second context reused the first epoch id');
  check(p3.resolve('e-nonexistent', 'seen-1') === null, 'an unknown epoch resolved to something');
  check(p3.resolve(ctx.epochId, 'seen-99') === null, 'an out-of-range ref resolved to something');

}

// -------------------------- 1.1a  refs are transport; memory holds entities ---
// The earlier draft of this contract said the ref mapping must be retained for
// as long as any memory derived from it. That coupled how long an agent can
// remember something to how big a cache is. Canonicalising at commit removes the
// coupling: the ref is resolved when the reply is processed, the entity is what
// gets stored, and the epoch becomes disposable that instant.
{
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const w8 = createWorld({ anchors, nav, seed: 20260825 });
  // One epoch of history. If anything committed depended on retention, a cache
  // this small would destroy it immediately.
  const p8 = createPerception(w8, zones, {
    entities: entityTable(), config: { epochHistory: 1 }
  });
  w8.start();
  w8.spawn('grandma-01', [470, 262]);
  w8.spawn('pastor-01', [480, 262]);
  w8.spawn('shopkeeper-01', [490, 262]);
  p8.tick();

  const ctx = p8.contextFor('grandma-01');
  const target = ctx.forModel.sensoryState.visible[0].ref;
  const expected = p8.resolve(ctx.epochId, target);

  // A Brain replies in refs, as it must - it has never been told an id.
  const reply = {
    activity: 'approach',
    target,
    remember: { about: target, note: 'this person greeted me' }
  };
  const committed = p8.canonicalize(ctx.epochId, reply);

  check(committed.unresolved.length === 0, 'a live ref failed to canonicalize');
  check(committed.value.target === expected, 'canonicalize did not resolve the action target');
  check(committed.value.remember.about === expected, 'canonicalize missed a nested ref');
  check(!/\b(seen|heard)-\d+\b/.test(JSON.stringify(committed.value)),
    'a ref survived canonicalization into something that would be stored');

  // Now destroy every trace of the epoch, several times over.
  p8.releaseEpoch(ctx.epochId);
  for (let i = 0; i < 20; i += 1) { p8.tick(); p8.contextFor('grandma-01'); }

  check(p8.resolve(ctx.epochId, target) === null,
    'a released epoch still resolves; the transport window is not actually bounded');
  check(committed.value.remember.about === expected,
    'the committed record changed when its epoch was evicted');
  check(committed.value.remember.about === 'pastor-01' || committed.value.remember.about === 'dog-01'
     || committed.value.remember.about === 'shopkeeper-01',
    'the committed record does not name a real entity');

  // And the failure mode: a stale ref is reported, never guessed at.
  const late = p8.canonicalize(ctx.epochId, { target });
  check(late.unresolved.includes(target), 'a stale ref was not reported as unresolved');
  check(late.value.target === null, 'a stale ref was silently retargeted');
}

// -------------------------------------------------- the pending queue -------
{
  const { world: w4, perception: p4 } = setup();
  w4.spawn('grandma-01', [470, 262]);
  w4.spawn('pastor-01', [480, 262]);
  w4.spawn('shopkeeper-01', [180, 240]);

  // 6.5  spoken at tick N, still there at a much later wakeup
  w4.say('pastor-01', '大事な一言。', { scope: 'normal' });
  p4.tick();
  for (let i = 0; i < 200; i += 1) { w4.advance(); p4.tick(); }
  const ctx = p4.contextFor('grandma-01');
  check(modelText(ctx).includes('大事な一言'),
    'a sentence spoken 200 ticks before the wakeup was lost');

  // 6.8  delivered once. A second context does not resend it.
  const again = p4.contextFor('grandma-01');
  check(!modelText(again).includes('大事な一言'),
    'the same utterance was delivered twice');

  // 6.6  an unperceived fact never enters the queue
  check(p4.pendingFor('shopkeeper-01').every((e) => !(e.text ?? '').includes('大事な一言')),
    'a fact nobody could hear entered a distant observer\'s queue');
}

// 6.7  a direct address is not pushed out by ordinary visual noise
{
  const { world: w5, perception: p5 } = setup();
  w5.spawn('grandma-01', [470, 262]);
  w5.spawn('pastor-01', [480, 262]);
  w5.say('pastor-01', 'おばあさん、こちらへ。', { scope: 'normal', to: 'grandma-01' });
  p5.tick();
  for (let i = 0; i < 120; i += 1) {         // flood with low-value movement
    w5.advance();
    w5.log.fact(w5.tick, 'move_started', {
      agent: 'pastor-01', from: [480, 262], path: [[480, 262], [481, 262]], arriveTick: w5.tick + 1
    });
    p5.tick();
  }
  const ctx = p5.contextFor('grandma-01');
  const addressed = ctx.forModel.recentPerceivedEvents.find((e) => e.kind === 'direct_address');
  check(!!addressed, 'a direct address was flushed out by ordinary visual noise');
  check(ctx.forModel.recentPerceivedEvents[0].kind === 'direct_address',
    'the direct address was not ranked first');
}

// ----------------------------------------- semantic destinations (6.11/12) --
{
  const { world: w6, placement: pl6 } = setup();
  w6.spawn('boy-01', [200, 250]);

  // Fill every seat at the far table, then try to join the people there.
  const far = w6.resourceIds().filter((id) => id.startsWith('table-far-'));
  check(far.length > 0, 'no far-table seats in anchors.json');
  far.forEach((id, i) => {
    const who = `filler-${i}`;
    w6.spawn(who, w6.resource(id).at);
    w6.reserve(id, who);
    w6.occupy(id, who);
  });
  check(far.every((id) => w6.resource(id).state === 'occupied'), 'the table is not actually full');

  const spot = pl6.goToArea('boy-01', 'far-table');
  check(!!spot, 'a full table admitted nobody, not even standing');
  check(w6.resource(far[0]).state === 'occupied',
    'go_to_area disturbed a seat');
  check(spot && !far.some((id) => {
    const a = w6.resource(id).at;
    return Math.hypot(a[0] - spot.at[0], a[1] - spot.at[1]) < 1;
  }), 'the standing spot landed on an occupied seat');

  // go_to_area must not imply sit
  check(w6.agents.get('boy-01').holding === null, 'go_to_area seated the agent');

  // 6.12  same state, same destination
  const { world: w7, placement: pl7 } = setup();
  w7.spawn('boy-01', [200, 250]);
  far.forEach((id, i) => {
    const who = `filler-${i}`;
    w7.spawn(who, w7.resource(id).at);
    w7.reserve(id, who); w7.occupy(id, who);
  });
  const again = pl7.goToArea('boy-01', 'far-table');
  check(JSON.stringify(spot) === JSON.stringify(again),
    `same state gave different destinations: ${JSON.stringify(spot)} vs ${JSON.stringify(again)}`);

  // approaching a person resolves beside them, not on them
  const beside = pl6.approachPerson('boy-01', 'filler-0');
  const targetAt = w6.agents.get('filler-0').at;
  check(!!beside, 'approaching a seated person found nowhere legal to stand');
  check(beside && Math.hypot(beside.at[0] - targetAt[0], beside.at[1] - targetAt[1]) > 1,
    'approachPerson placed the agent on top of the target');
}

// ------------------------------------------------------- the roll-up --------
// ------------------------------------- 3E-1: the audience is committed ------
// How far a voice carries is world physics, decided once by `world.hearing` and
// stamped onto the fact. Nothing downstream may work it out again: it depends on
// where everybody stood at that tick, and recovering that means replaying
// movement, which is re-simulation.
{
  const { world: w6, perception: p6 } = setup();
  w6.spawn('grandma-01', [470, 262]);
  w6.spawn('pastor-01', [480, 262]);            // ~10 units, well inside hearing
  w6.spawn('brother-01', [524, 262]);           // ~54 units, still inside 70
  w6.spawn('shopkeeper-01', [180, 240]);        // ~300 units, far outside

  w6.say('pastor-01', '普通の声。', { scope: 'normal' });
  const said = w6.log.facts.filter((e) => e.type === 'speech_said').at(-1);

  check(Array.isArray(said.heardBy), 'a speech fact carries no heardBy at all');
  check(!said.heardBy.includes('pastor-01'), 'the speaker was listed as their own audience');
  check(said.heardBy.includes('grandma-01') && said.heardBy.includes('brother-01'),
    `the audience is ${said.heardBy}`);
  check(!said.heardBy.includes('shopkeeper-01'),
    'somebody 300 units away was recorded as having heard an ordinary voice');
  check(JSON.stringify(said.heardBy) === JSON.stringify([...said.heardBy].sort()),
    'heardBy is not sorted, so iteration order could change a result');

  // One implementation, asked twice, agreeing.
  for (const id of w6.presentIds()) {
    check(said.heardBy.includes(id) === w6.hearing.canHear(id, 'pastor-01', 'normal'),
      `heardBy and canHear disagree about ${id}`);
  }

  // A carrying voice reaches the scene, and that is the same query answering
  // differently rather than a second rule.
  w6.say('pastor-01', '大きな声。', { scope: 'broadcast' });
  const loud = w6.log.facts.filter((e) => e.type === 'speech_said').at(-1);
  check(loud.heardBy.includes('shopkeeper-01'),
    'a carrying voice did not reach across the scene');
  check(loud.heardBy.length === w6.presentIds().length - 1,
    'a broadcast reached the wrong number of people');

  // Perception READS the field rather than asking again. Deliberately artificial:
  // a hand-made fact whose audience disagrees with the geometry. If perception
  // recomputed, the distant one would be dropped and the near one delivered -
  // which is exactly the divergence the committed answer exists to prevent.
  const { world: w7, perception: p7 } = setup();
  w7.spawn('grandma-01', [470, 262]);
  w7.spawn('pastor-01', [480, 262]);
  w7.spawn('shopkeeper-01', [180, 240]);
  w7.log.fact(w7.tick, 'speech_said', {
    agent: 'pastor-01', text: '記録が真実。', scope: 'normal', to: null,
    heardBy: ['shopkeeper-01']                  // the far one, and not the near one
  });
  p7.tick();
  check(p7.pendingFor('shopkeeper-01').some((e) => e.kind === 'speech_heard'),
    'perception ignored the committed audience and recomputed it');
  check(!p7.pendingFor('grandma-01').some((e) => e.kind === 'speech_heard'),
    'perception delivered words to somebody the record says did not hear them');
  // The near one still SAW a speaker, which is a different question (9).
  check(p7.pendingFor('grandma-01').some((e) => e.kind === 'sound_heard'),
    'seeing somebody speak stopped being noticeable');

  // A speech fact with no audience at all is a recording from before the field
  // existed, and is a bug rather than silence. Fail loudly.
  const { world: w8, perception: p8 } = setup();
  w8.spawn('grandma-01', [470, 262]);
  w8.spawn('pastor-01', [480, 262]);
  w8.log.fact(w8.tick, 'speech_said', { agent: 'pastor-01', text: 'x', scope: 'normal', to: null });
  let threw = false;
  try { p8.tick(); } catch (e) { threw = true; }
  check(threw, 'a speech fact with no heardBy was accepted');
}

console.log('  acceptance scenario');
console.log(`    A sees      ${ctxA.forModel.sensoryState.visible.length} others, `
  + `hears ${ctxA.forModel.recentPerceivedEvents.filter((e) => e.kind === 'speech_heard').length}`);
console.log(`    C sees      ${ctxC.forModel.sensoryState.visible.length} others, `
  + `hears ${ctxC.forModel.recentPerceivedEvents.filter((e) => e.kind === 'speech_heard').length}`);
console.log(`    D (absent)  in nobody's package`);
console.log('    A\'s package, as the model would receive it:');
console.log('      ' + JSON.stringify(ctxA.forModel.sensoryState.visible[0]));

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  no name, id, sprite, file path, private prose or raw coordinate');
  console.log('    reaches a model-visible field; refs are opaque, stable within a');
  console.log('    snapshot and resolvable after it; speech carries by distance,');
  console.log('    settled once by the world and read from the fact, never recomputed;');
  console.log('    own failure reaches only the agent that failed; a full table');
  console.log('    still admits standing, deterministically');
}
process.exitCode = problems.length ? 1 : 0;
