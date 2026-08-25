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
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, {
      appearance: c.appearance,
      kind: c.brain === 'deterministic' ? 'animal' : 'person'
    });
    // Only `knows` seeds memory. A deterministic actor has `bonds` and no store.
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  return { entities, seeds };
}

function setup() {
  const { entities, seeds } = fixtures();
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, seed: 20260827 });
  const memory = createMemory(world, { seeds });
  const perception = createPerception(world, zones, {
    entities,
    attentionHint: (o, e) => memory.attentionHint(o, e)     // 3C's empty hook, filled
  });
  world.start();
  return { world, zones, perception, memory };
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

// --- 11.9  a deterministic actor has no memory store ---
{
  const { memory } = setup();
  check(memory.knownTo('dog-01').length === 0, 'the dog was given a memory');
  const c = read(ROOT, 'characters', 'dog-01', 'character.json');
  check(!('knows' in c) && Array.isArray(c.bonds),
    'dog-01 carries knows rather than bonds');
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
  const { world, perception, memory } = setup();
  world.spawn('brother-01', [176, 200]);
  world.spawn('shopkeeper-01', [176, 197]);
  const runtime = createActivityRuntime(world);
  createLoop({ world, runtime, perception }).run(30, {});
  memory.tick(perception);

  const p = memory.recall('brother-01', 'shopkeeper-01');
  check(!!p, 'the boy stood beside her for thirty ticks and remembers nobody');
  check(p.label === null,
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

// --- 11.4  encounters accumulate with no Brain anywhere ---
{
  const { world, perception, memory } = setup();
  // A pair with no seeded knowledge in either direction, so what is measured is
  // the meeting itself rather than what they arrived already knowing.
  world.spawn('grandma-01', [470, 262]);
  world.spawn('man-01', [478, 264]);
  const runtime = createActivityRuntime(world);
  const loop = createLoop({ world, runtime, perception });
  for (let i = 0; i < 200; i += 1) { loop.step(); memory.tick(perception); }

  const p = memory.recall('grandma-01', 'man-01');
  check(!!p, 'two hundred ticks side by side produced no memory');
  check(p.encounters >= 1, 'the meeting was never counted');
  check(p.firstMetTick !== null, 'a met-in-the-world model has no first-met tick');
  check(p.seeded === false, 'a runtime meeting was marked as seeded');
  // The cooldown stops one continuous meeting counting two hundred times.
  check(p.encounters <= 5, `one continuous meeting counted ${p.encounters} times`);
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
  check(memory.recall('grandma-01', 'pastor-01')?.encounters >= 1,
    'the note did not survive its epoch');
  check(memory.episodesFor('grandma-01').some((e) => e.gist === 'said it was fine weather'),
    'the remembered note is gone');
}

// --- 11.6  memory never appears in the fact stream ---
{
  const { world, perception, memory } = setup();
  world.spawn('grandma-01', [470, 262]);
  world.spawn('pastor-01', [478, 264]);
  const runtime = createActivityRuntime(world);
  const loop = createLoop({ world, runtime, perception });
  for (let i = 0; i < 40; i += 1) { loop.step(); memory.tick(perception); }
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
  console.log('    encounters accumulate with no Brain; refs cannot reach storage;');
  console.log('    memory lives in audit and never in facts; eviction is');
  console.log('    deterministic; the dog has parameters, not a past');
}
process.exitCode = problems.length ? 1 : 0;
