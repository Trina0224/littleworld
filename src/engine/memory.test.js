/**
 * Phase 3D: every property the memory spec asks to be proved.
 *
 *     node src/engine/memory.test.js
 *
 * The one that matters most is the label test. A character's memory of someone
 * is the observer's, not the target's, and the fastest way to get that wrong is
 * to reach for the target's file when a name is wanted. So the test takes the
 * real names out of the real bibles and asserts none of them can appear in
 * anyone's memory who was not seeded with them.
 *
 * Four of these tests exist because of a review, and each one names a real bug
 * that was passing before it was written: memory ran only where a scenario
 * remembered to call it, a queued utterance could be remembered again on every
 * tick, the dog was only proved to start empty rather than to stay empty, and
 * "encounters" counted cooldowns rather than meetings.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createMemory, buildContext } from './memory.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

const CAST = ['grandma-01', 'woman-01', 'pastor-01', 'shopkeeper-01',
              'brother-01', 'brother-02', 'dog-01',
              'man-01'];      // knows nobody, and nobody knows him

function fixtures() {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    const deterministic = c.brain === 'deterministic';
    entities.set(id, {
      appearance: c.appearance,
      kind: deterministic ? 'animal' : 'person'
    });
    // Who has a memory at all is declared from the character files, not guessed
    // at from who happens to have been seeded: man-01 knows nobody and still has
    // a mind, dog-01 has bonds and does not.
    if (!deterministic) minds.add(id);
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  return { entities, seeds, minds };
}

function setup() {
  const { entities, seeds, minds } = fixtures();
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, seed: 20260827 });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, {
    entities,
    attentionHint: (o, e) => memory.attentionHint(o, e)     // 3C's empty hook, filled
  });
  const runtime = createActivityRuntime(world);
  // Memory is a stage of the tick, not something a scenario adds. Every scenario
  // below builds its loop from here, so none of them can accidentally prove a
  // property that only holds when somebody remembers to call memory by hand.
  const loop = createLoop({ world, runtime, perception, memory });
  world.start();
  return { world, zones, perception, memory, runtime, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

// --- 11.1  seeded knowledge is memory that was already there ---
{
  const { memory } = setup();
  const p = memory.recall('grandma-01', 'woman-01');
  check(!!p, 'a seeded knows entry produced no person model');
  check(p.label === '孫女', `seeded label is "${p?.label}"`);
  check(p.seeded === true, 'the seeded model is not marked seeded');
  check(p.firstMetTick === null, 'seeded knowledge was given a first-met tick');
  check(p.encounters === 0, 'seeded knowledge started with encounters');
  check(memory.recall('grandma-01', 'gentleman-01') === null,
    'a model appeared for someone never known or met');
}

// --- 11.9  a deterministic actor has no memory store, and never acquires one ---
{
  const { world, memory, loop } = setup();
  const c = read(ROOT, 'characters', 'dog-01', 'character.json');
  check(!('knows' in c) && Array.isArray(c.bonds),
    'dog-01 carries knows rather than bonds');
  check(!memory.minds().includes('dog-01'), 'the dog was declared to have a mind');

  // Starting empty proves nothing. Put the dog in the middle of the people it
  // would most plausibly grow a past around, let it be seen, spoken near and
  // spoken to, and run long enough for several encounters to open and close.
  world.spawn('dog-01', [474, 263]);
  world.spawn('grandma-01', [470, 262]);
  world.spawn('brother-01', [478, 264]);
  loop.run(400, {
    beforeTick: (t) => {
      if (t % 50 === 10) world.say('brother-01', 'ハナ、こっち', { to: 'dog-01' });
      if (t % 50 === 30) world.say('grandma-01', 'いい子ね');
    }
  });

  check(memory.knownTo('dog-01').length === 0,
    `the dog acquired ${memory.knownTo('dog-01').length} person models`);
  check(memory.episodesFor('dog-01').length === 0,
    'the dog acquired episodes');
  const dogWrites = world.log.audit.filter(
    (e) => (e.type === 'memory_written' || e.type === 'label_learned') && e.agent === 'dog-01');
  check(dogWrites.length === 0, `${dogWrites.length} memory writes were made for the dog`);

  // A Brain proposal for something with no mind is a scheduler bug, so it fails
  // loudly rather than quietly writing nowhere.
  let threw = false;
  try { memory.note('dog-01', 'grandma-01', 'she gave me something'); } catch (e) { threw = true; }
  check(threw, 'a note was accepted for an actor with no memory');

  // And the gate is on the observer only. The dog is a character in everyone
  // else's memory, which is the whole reason it is in the cast.
  check(memory.recall('grandma-01', 'dog-01')?.encounters >= 1,
    'nobody remembers the dog, which makes it scenery');
  check(memory.recall('brother-01', 'dog-01')?.label === 'ハナ',
    'the boy whose dog it is does not know it');
}

// --- seeding something with no mind is an authoring error, not a silent no-op ---
{
  const { entities, seeds } = fixtures();
  const nav = createNav(grid);
  const world = createWorld({ anchors, nav, seed: 1 });
  let threw = false;
  try {
    createMemory(world, { seeds: new Map([['dog-01', [{ who: 'brother-01', as: 'ご主人' }]]]) ,
                          minds: new Set(['brother-01']) });
  } catch (e) { threw = true; }
  check(threw, 'a deterministic actor was quietly seeded with knowledge');

  threw = false;
  try { createMemory(world, { seeds }); } catch (e) { threw = true; }
  check(threw, 'createMemory guessed at who has a memory instead of being told');
  void entities;
}

// --- 11.3  two observers, two labels, nothing reconciles them ---
{
  const { memory } = setup();
  const hers = memory.recall('grandma-01', 'woman-01');
  const his = memory.recall('woman-01', 'grandma-01');
  check(hers.label === '孫女' && his.label === 'おばあちゃん',
    `asymmetric labels came out as ${hers?.label} / ${his?.label}`);
  memory.learnLabel('grandma-01', 'woman-01', 'ユキちゃん');
  check(memory.recall('woman-01', 'grandma-01').label === 'おばあちゃん',
    'relabelling one direction changed the other');
}

// --- 11.2  a label is the observer's; it is never read from the target ---
{
  const { world, memory, loop } = setup();
  world.spawn('brother-01', [176, 200]);
  world.spawn('shopkeeper-01', [176, 197]);
  loop.run(30, {});

  const p = memory.recall('brother-01', 'shopkeeper-01');
  check(!!p, 'the boy stood beside her for thirty ticks and remembers nobody');
  check(p !== null && p.label === null,
    `the boy acquired the label "${p?.label}" without ever being told it`);

  // Real names, from the real files, must be absent from any label the world
  // produced. A SEEDED label may of course contain one - the grandmother really
  // does call the retired stationmaster 小野さん, and that is her knowledge, not
  // a leak. The property is that nothing acquires a name it was never told.
  const names = ['国分', '澄子', '森ジョナサン', '星チヤ', '熊田', '小野', '渡辺'];
  for (const observer of CAST) {
    for (const other of memory.knownTo(observer)) {
      const p2 = memory.recall(observer, other);
      if (p2.seeded) continue;
      const hit = names.find((n) => (p2.label ?? '').includes(n));
      check(!hit, `${observer} acquired the name ${hit} for ${other} at runtime`);
    }
  }
}

// --- 11.4  encounters accumulate with no Brain anywhere, and from the loop alone ---
{
  const { world, memory, loop } = setup();
  // A pair with no seeded knowledge in either direction, so what is measured is
  // the meeting itself rather than what they arrived already knowing.
  world.spawn('grandma-01', [470, 262]);
  world.spawn('man-01', [478, 264]);
  // Note what is NOT here: no memory.tick(). If accumulation were not a stage of
  // the canonical tick this scenario would record nothing at all.
  loop.run(200, {});

  const p = memory.recall('grandma-01', 'man-01');
  check(!!p, 'two hundred ticks side by side produced no memory');
  check(p?.firstMetTick != null, 'a met-in-the-world model has no first-met tick');
  check(p?.seeded === false, 'a runtime meeting was marked as seeded');
  // One afternoon at one table is ONE meeting. Counting it again every cooldown
  // would make timesMet a stopwatch wearing a counter's name.
  check(p?.encounters === 1, `one continuous meeting counted ${p?.encounters} times`);

  // And a loop cannot be given memory without the source it accumulates from.
  let threw = false;
  try {
    createLoop({ world, runtime: createActivityRuntime(world), memory });
  } catch (e) { threw = true; }
  check(threw, 'a loop accepted memory with no perception to accumulate from');
}

// --- encounters are meetings: leave, stay away, come back = two ---
{
  const { world, memory, loop } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.roster('man-01', { at: [478, 264] });
  world.arrive('man-01');
  loop.run(20, {});
  check(memory.recall('grandma-01', 'man-01')?.encounters === 1,
    `arriving counted ${memory.recall('grandma-01', 'man-01')?.encounters} meetings`);

  world.depart('man-01');
  loop.run(20 + 120, {});                       // well past separationTicks
  check(memory.recall('grandma-01', 'man-01')?.encounters === 1,
    'an encounter was counted again while the two were nowhere near each other');

  world.arrive('man-01');
  loop.run(20 + 120 + 20, {});
  check(memory.recall('grandma-01', 'man-01')?.encounters === 2,
    `leaving and coming back counted ${memory.recall('grandma-01', 'man-01')?.encounters}`);

  // And a brief absence is not a new meeting - somebody standing up and sitting
  // down again did not meet you twice.
  world.depart('man-01');
  loop.run(20 + 120 + 20 + 10, {});
  world.arrive('man-01');
  loop.run(20 + 120 + 20 + 10 + 20, {});
  check(memory.recall('grandma-01', 'man-01')?.encounters === 2,
    'stepping away for ten ticks counted as a whole new meeting');
}

// --- a Brain writing about someone is not the two of them meeting ---
{
  const { world, memory, loop } = setup();
  // Nowhere near each other, and neither one seeded with the other, so what is
  // measured is the note rather than what he arrived already knowing.
  world.spawn('man-01', [470, 262]);
  world.spawn('shopkeeper-01', [176, 197]);
  loop.run(120, {});
  check(memory.recall('man-01', 'shopkeeper-01') === null,
    'two people at opposite ends of the scene were recorded as having met');

  memory.note('man-01', 'shopkeeper-01', 'I should not have to talk to anyone here');
  memory.learnLabel('man-01', 'shopkeeper-01', '店の人');
  const p = memory.recall('man-01', 'shopkeeper-01');
  check(!!p, 'a note produced no model of the person it was about');
  check(p.encounters === 0,
    `thinking about someone across the park counted ${p.encounters} meetings`);
  check(p.lastSeenTick === null, 'a note claimed the two had just been together');
}

// --- a queued utterance is remembered exactly once, and is still delivered ---
{
  const { world, memory, perception, loop } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('man-01', [478, 264]);
  loop.run(5, {});
  world.say('man-01', 'こんにちは', { to: 'grandma-01' });
  // Long enough that a per-tick re-read of the queue would remember it 200 times.
  loop.run(205, {});

  const heard = memory.episodesFor('grandma-01')
    .filter((e) => e.gist === 'こんにちは');
  check(heard.length === 1, `one utterance was remembered ${heard.length} times`);

  // The same event re-read every tick used to drag lastSeenTick backwards to the
  // tick it was spoken on, so the next tick's proximity looked like a fresh
  // meeting after a long gap - and encounters climbed by one a tick for as long
  // as the words sat in the queue. One meeting, one count.
  check(memory.recall('grandma-01', 'man-01')?.encounters === 1,
    `an utterance in the queue inflated encounters to `
    + `${memory.recall('grandma-01', 'man-01')?.encounters}`);

  // Memory read the queue; it did not take it. The Brain has not been woken yet
  // and the words must still be waiting for it.
  const ctx = buildContext(perception, memory, 'grandma-01');
  const said = ctx.forModel.recentPerceivedEvents.filter((e) => e.said === 'こんにちは');
  check(said.length === 1,
    `memory ate the utterance before the Brain saw it (${said.length} delivered)`);

  // Delivery drained the queue. Memory must not now forget it happened, or
  // re-remember it if anything is queued afterwards.
  world.say('man-01', 'いい天気ですね');
  loop.run(215, {});
  check(memory.episodesFor('grandma-01').filter((e) => e.gist === 'こんにちは').length === 1,
    'the utterance was remembered again after the queue was drained');
  check(memory.episodesFor('grandma-01').some((e) => e.gist === 'いい天気ですね'),
    'nothing queued after a delivery was ever remembered');
}

// --- 11.5  no ref may reach storage ---
{
  const { memory } = setup();
  let threw = false;
  try { memory.note('grandma-01', 'seen-2', 'they greeted me'); } catch (e) { threw = true; }
  check(threw, 'an uncanonicalized ref was accepted into memory');
  threw = false;
  try { memory.learnLabel('grandma-01', 'heard-1', '森牧師'); } catch (e) { threw = true; }
  check(threw, 'an uncanonicalized ref was accepted as a label subject');
}

// --- 11.7  a note survives every epoch being evicted ---
{
  const { world, perception, memory } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('pastor-01', [478, 264]);
  perception.tick();
  const ctx = perception.contextFor('grandma-01');
  const ref = ctx.forModel.sensoryState.visible[0].ref;
  const committed = perception.canonicalize(ctx.epochId, { about: ref });
  memory.note('grandma-01', committed.value.about, 'said it was fine weather');

  perception.releaseEpoch(ctx.epochId);
  for (let i = 0; i < 30; i += 1) { perception.tick(); perception.contextFor('grandma-01'); }
  check(perception.resolve(ctx.epochId, ref) === null, 'the epoch was not really released');
  check(memory.recall('grandma-01', committed.value.about) !== null,
    'the note did not survive its epoch');
  check(memory.episodesFor('grandma-01').some(
    (e) => e.gist === 'said it was fine weather' && e.entityId === 'pastor-01'),
    'the remembered note is gone, or no longer names the right person');
}

// --- 11.6  memory never appears in the fact stream ---
{
  const { world, memory, loop } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('pastor-01', [478, 264]);
  loop.run(40, {});
  memory.note('grandma-01', 'pastor-01', 'a private thought');
  memory.learnLabel('grandma-01', 'pastor-01', '森牧師');

  const facts = JSON.stringify(world.log.facts);
  check(!facts.includes('memory_written'), 'a memory write reached the fact stream');
  check(!facts.includes('label_learned'), 'a learned label reached the fact stream');
  check(!facts.includes('a private thought'), 'private prose reached the fact stream');
  check(!facts.includes('森牧師'), 'a learned name reached the fact stream');
  const audit = JSON.stringify(world.log.audit);
  check(audit.includes('memory_written') && audit.includes('label_learned'),
    'memory writes did not reach the audit stream either');
}

// --- 11.8  episode eviction is deterministic ---
{
  const run = () => {
    const { world, memory } = setup();
    world.spawn('grandma-01', [470, 262]);
    for (let i = 0; i < 80; i += 1) {
      memory.note('grandma-01', 'pastor-01', `thought ${i}`);
      world.advance();
    }
    return memory.episodesFor('grandma-01').map((e) => e.gist).join('|');
  };
  const a = run();
  const b = run();
  check(a === b, 'the same run kept different episodes');

  // Deterministic is not the same as correct: dropping the oldest is also
  // deterministic and would throw away the thing worth keeping. What survives a
  // flood of ordinary notes must be the meeting and the words.
  {
    const { world, memory } = setup();
    world.spawn('grandma-01', [470, 262]);
    memory.note('grandma-01', 'man-01', 'the important thing he said');
    for (let i = 0; i < 80; i += 1) {
      world.log.note(world.tick, 'x', {});
      memory.note('grandma-01', 'pastor-01', `filler ${i}`);
      world.advance();
    }
    const kept = memory.episodesFor('grandma-01');
    check(kept.some((e) => e.kind === 'first_meeting'),
      'the first meeting was evicted by ordinary chatter');
    check(kept.length <= 24, `episodes grew to ${kept.length}`);
  }
  check(memoryLength(a) <= 24, `episodes grew past the limit: ${memoryLength(a)}`);
  function memoryLength(s) { return s.split('|').length; }
}

// --- 11.10 / 11.11  recognition reaches the context, only for who has it ---
{
  const { world, perception, memory } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('woman-01', [476, 264]);          // her granddaughter, seeded
  world.spawn('pastor-01', [482, 262]);         // seeded too
  world.spawn('brother-01', [488, 262]);        // a child she knows
  perception.tick();

  const hers = buildContext(perception, memory, 'grandma-01');
  const text = JSON.stringify(hers.forModel);
  const seenBy = (label) => hers.forModel.sensoryState.visible.find((v) => v.youCallThem === label);
  check(!!seenBy('孫女'), 'the grandmother did not recognise her own granddaughter');
  check(!!seenBy('辰ちゃん'), 'the grandmother did not recognise the boy she feeds');
  check(!text.includes('woman-01') && !text.includes('grandma-01'),
    'recognition leaked an entity id into the model-visible package');
  check(!text.includes('星') && !text.includes('チヤ'),
    'recognition leaked a canonical name');

  // The stranger's side: he was seeded knowing only her, so the children are
  // still just children to him.
  const his = buildContext(perception, memory, 'pastor-01');
  const known = his.forModel.sensoryState.visible.filter((v) => v.recognised);
  check(known.length === 1 && known[0].youCallThem === '星さん',
    `the pastor recognised ${known.length} people: ${known.map((k) => k.youCallThem)}`);

  // 11.11 the hint is a number
  const hint = memory.attentionHint('grandma-01', 'woman-01');
  check(typeof hint === 'number', `attentionHint returned a ${typeof hint}`);
  check(memory.attentionHint('pastor-01', 'brother-01') === 0,
    'a stranger scored an attention boost');
}

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  knows seeds memory rather than sitting beside it; a label is the');
  console.log('    observer\'s and never the target\'s; two stores stay asymmetric;');
  console.log('    memory accumulates from the loop itself with no Brain and no');
  console.log('    scenario help; an utterance is remembered once and still');
  console.log('    delivered; an encounter is a meeting, not a cooldown; refs');
  console.log('    cannot reach storage; memory lives in audit and never in facts;');
  console.log('    eviction is deterministic; the dog has parameters, not a past');
}
process.exitCode = problems.length ? 1 : 0;
