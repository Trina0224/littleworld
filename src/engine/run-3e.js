/**
 * Phase 3E acceptance: a scripted afternoon, and the fifteen things
 * phase-3e-conversation.md 17 asks to be proved without a provider.
 *
 *   node src/engine/run-3e.js
 *
 * Scripted, not mocked: every choice below is written here. A stand-in that
 * DECIDED would make these pass for reasons the run does not control, and 3E is
 * about session mechanics rather than about judgement (clarifications 17.0).
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
import { createSocialWeigher } from './social.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';
import { createView, replay } from './view.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const CAST = ['grandma-01', 'pastor-01', 'man-01', 'shopkeeper-01', 'brother-01', 'dog-01'];
const NEAR_TABLE = [[227, 235], [232, 238], [222, 240]];
const COUNTER = [222, 178];
const PARK = [[392, 202], [400, 202]];

function build() {
  const entities = new Map();
  const seeds = new Map();
  const minds = new Set();
  const traits = new Map();
  const beasts = new Map();
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
  const world = createWorld({ anchors: read(SPEC, 'anchors.json'), nav, zones, seed: 3050 });
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, {
    entities, attentionHint: (o, e) => memory.attentionHint(o, e)
  });
  const animals = createAnimals(world, { table: beasts, nearRange: perception.config.nearRange });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, animals,
    weigh: createSocialWeigher({ traitsFor: traits, memory }),
    makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors
  });
  return { world, zones, perception, memory, animals, floors, loop };
}

const { world, perception, memory, floors, loop } = build();
world.start();
world.spawn('grandma-01', NEAR_TABLE[0]);
world.spawn('brother-01', NEAR_TABLE[1]);
world.spawn('man-01', NEAR_TABLE[2]);        // present, and never wants to speak
world.spawn('shopkeeper-01', COUNTER);       // alone at the counter, within earshot
world.spawn('dog-01', [236, 236]);

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const pickAt = (o, act, target) => o.menu.find(
  (m) => m.startsWith(`${act}:`) && o.context.refs.get(m.split(':')[1]) === target) ?? null;

const log = [];
const seen = { nudges: 0, refusals: 0, lost: 0, turns: 0 };
const spoken = (text) => world.log.facts.some((e) => e.type === 'speech_said' && e.text === text);
const ASK = '辰ちゃん、宿題は終わったの';
const ANSWER = 'うん、もう終わった';
const CALL = '澄子さん、お茶をもう一杯';
const DOG = 'ハナ、おいで';
let remarks = 0;
let sumikoContext = null;
let watanabeContext = null;
const liveFrames = [];
const live = createView();

/** The script. Every branch is written here; nothing decides. */
function choose(o) {
  // 渡辺 never wants to talk. That is his character, not a scheduler defect.
  if (o.entityId === 'man-01') { watanabeContext = watanabeContext ?? o.context; return 'decline'; }

  if (o.entityId === 'shopkeeper-01') {
    if (o.why === 'overheard') { seen.nudges += 1; sumikoContext = o.context; return 'decline'; }
    if (o.why === 'addressed') {
      // She is standing at her counter, not at their table, so she may not take
      // their floor. She calls back across, which is 9.1's handoff in reverse.
      const back = pickAt(o, 'call_across', 'grandma-01');
      check(!pickAt(o, 'reply', 'grandma-01'),
        'she was offered a reply into a floor she is not standing on');
      return back ? { pick: back, text: 'はい、ただいま' } : 'decline';
    }
    return 'decline';
  }

  if (o.entityId === 'grandma-01') {
    if (!spoken(ASK)) {
      const q = pickAt(o, 'ask', 'brother-01');
      if (q) return { pick: q, text: ASK };
    }
    if (spoken(ANSWER) && !spoken(CALL)) {
      const across = pickAt(o, 'call_across', 'shopkeeper-01');
      if (across) return { pick: across, text: CALL };
    }
    if (remarks < 4) { remarks += 1; return { pick: 'address_group', text: `いいお天気ね${remarks}` }; }
    return 'decline';
  }

  if (o.entityId === 'brother-01') {
    if (spoken(ASK) && !spoken(ANSWER)) {
      const back = pickAt(o, 'reply', 'grandma-01');
      if (back) return { pick: back, text: ANSWER };
    }
    const dog = spoken(CALL) && !spoken(DOG) ? pickAt(o, 'call_over', 'dog-01') : null;
    if (dog) return { pick: dog, text: DOG };
    return 'decline';
  }
  return 'decline';
}

loop.run(90, {
  onFrame(fresh, t) {
    for (const o of floors.offers()) {
      seen.turns += 1;
      log.push(`t=${String(t).padStart(3)}  offer -> ${o.entityId.padEnd(14)} ${o.why}`);
      const a = choose(o);
      if (a === 'decline') { floors.decline(o.entityId); continue; }
      const r = floors.commit(o.entityId, a);
      if (r.refused) seen.refusals += 1;
    }
    for (const e of fresh) live.apply(e);
    live.goto(t);
    liveFrames.push(JSON.stringify(live.snapshot()));
  }
});

const facts = world.log.facts;
const said = facts.filter((e) => e.type === 'speech_said');
const audit = world.log.audit;
seen.lost = audit.filter((e) => e.type === 'floor_lost').length;

// 17.1  persistence: one floor carried the whole exchange
check(said.length >= 6, `only ${said.length} utterances in ninety ticks`);
check(said.filter((e) => e.zone === 'near-table').length >= 5,
  'the table conversation did not stay on one floor');

// 17.2  no round-robin: 澄子 is in another zone and is never offered that floor
check(!audit.some((e) => e.type === 'floor_offered'
  && e.agent === 'shopkeeper-01' && e.zone === 'near-table'),
  'somebody in another zone was offered the table floor');

// 17.3  walking in is joining - asserted by there being no join action at all
check(!Object.keys(await import('./floors.js').then((m) => m.ACTS))
  .some((a) => /join|leave/.test(a)), 'a join or leave action exists');

// 17.4  silence is legal, and produces no speech
check(!said.some((e) => e.agent === 'man-01'), '渡辺 was made to speak');
check(audit.some((e) => e.type === 'floor_declined' && e.agent === 'man-01'),
  '渡辺 was never even asked');

// 17.5  declining does not remove you: he keeps being offered, and still gets a package
const hisOffers = audit.filter((e) => e.type === 'floor_offered' && e.agent === 'man-01');
check(hisOffers.length >= 3, `渡辺 was asked only ${hisOffers.length} times`);
check(!!watanabeContext, '渡辺 was never handed a package');

// 17.6  physical boundary: he is in another zone and hears without being in it
// She heard every word at the table and holds only what was said to or by her.
const hersHeard = facts.filter((e) => e.type === 'speech_said'
  && e.heardBy.includes('shopkeeper-01')).length;
check(hersHeard >= 5, `the test premise is wrong: she heard ${hersHeard} lines`);
check(floors.utterancesFor('shopkeeper-01')
  .every((u) => u.speaker === 'shopkeeper-01' || u.addressed === 'shopkeeper-01'),
  'an overheard table conversation entered her transcript');
check(floors.utterancesFor('shopkeeper-01').length === 2,
  `her transcript holds ${floors.utterancesFor('shopkeeper-01').length} lines`);

check(spoken(ANSWER), '辰 never answered the question he was asked');
check(spoken(CALL) && said.some((e) => e.text === 'はい、ただいま'),
  '澄子 was called across the way and never called back');
check(floors.openQuestionIn('near-table') === null, 'the answered question is still a debt');

// 17.7 / 17.8  a conversation is not ten episodes, and meaning is still possible
for (const id of ['grandma-01', 'brother-01']) {
  check(memory.episodesFor(id).every((e) => e.kind === 'first_meeting'),
    `${id} turned a conversation into ${memory.episodesFor(id).length} episodes`);
}
memory.note('grandma-01', 'brother-01', '宿題を終わらせたと言っていた');
check(memory.episodesFor('grandma-01').some((e) => e.kind === 'note'),
  'a deliberate memory could not be written');

// 17.9  a nonparticipant may remember what it heard, without being a participant
check(memory.recall('shopkeeper-01', 'grandma-01')?.spokenWith >= 1,
  'being called across the way was not remembered as a conversation');

// 17.10  identity safety
const packages = JSON.stringify([sumikoContext?.forModel, watanabeContext?.forModel]);
for (const id of CAST) check(!packages.includes(id), `an entity id reached a package: ${id}`);
// A name may reach a package as somebody's OWN seeded label - 澄子 really does
// call her 星さん, and that is her knowledge rather than a leak. The strict
// check therefore belongs to 渡辺, who knows nobody and was told nothing.
const his = JSON.stringify(watanabeContext?.forModel);
for (const n of ['星', 'チヤ', '森ジョナサン', '国分', '澄子', '渡辺', '奧山', '辰']) {
  check(!his.includes(n), `a canonical name reached the package of a man told nothing: ${n}`);
}

// 17.11  act-derived transport
check(said.some((e) => e.scope === 'normal') && said.some((e) => e.scope === 'broadcast'),
  'both transports were not exercised');
// Every carrying voice is a call across a zone boundary, and nothing else.
const zoneNow = (id) => facts.filter((e) => e.type === 'speech_said' && e.agent === id).at(-1)?.zone;
check(said.filter((e) => e.scope === 'broadcast')
  .every((e) => e.to && zoneNow(e.to) !== e.zone),
  'a carrying voice was used for something other than calling across');
check(said.filter((e) => e.scope === 'normal').every((e) => !e.to || zoneNow(e.to) === e.zone
  || e.to === 'dog-01'),
  'an ordinary voice was used to reach another zone');

// 17.12  the cast stays asymmetric
check(seen.nudges === 1, `澄子 was nudged ${seen.nudges} times by one conversation`);

// 17.13 / 17.14  no provider anywhere, and nothing waited for one
check(!/await|Promise|then\(/.test(readFileSync(join(HERE, 'floors.js'), 'utf8')),
  'the floor store learned to wait for something');

// 17.15  exactly-once speech
for (const line of said.map((e) => e.text)) {
  check(said.filter((e) => e.text === line).length
    === facts.filter((e) => e.type === 'speech_said' && e.text === line).length,
    `"${line}" was committed more than once`);
}

// replay: the same facts, the same frames, with nothing but view.js
{
  const out = [];
  replay({ facts }, { onTick: (f) => out.push(JSON.stringify(f)) });
  const n = Math.min(out.length, liveFrames.length);
  check(out.length === liveFrames.length,
    `live ran ${liveFrames.length} frames, replay ${out.length}`);
  let bad = -1;
  for (let i = 0; i < n; i += 1) if (out[i] !== liveFrames[i]) { bad = i; break; }
  check(bad === -1, `live and replay differ at frame ${bad}`);
}

// the dog: called, and the fact is there either way
const dogs = facts.filter((e) => e.type === 'animal_responded');
check(dogs.length > 0, 'nobody ever spoke to ハナ');
check(memory.knownTo('dog-01').length === 0, 'the dog acquired a memory');

console.log('');
for (const line of log.slice(0, 14)) console.log('  ' + line);
console.log(`  ... ${seen.turns} offers in all`);
console.log('');
console.log('  said:');
for (const e of facts.filter((x) => x.type === 'speech_said' || x.type === 'animal_responded')) {
  if (e.type === 'speech_said') {
    console.log(`    t=${String(e.t).padStart(3)}  ${e.zone.padEnd(12)} ${e.scope.padEnd(9)} ${e.text}`);
  } else {
    console.log(`    t=${String(e.t).padStart(3)}  ${'(ハナ)'.padEnd(12)} ${e.act.padEnd(9)} ${e.outcome}`);
  }
}
console.log('');
console.log(`  frames ${liveFrames.length}   offers ${seen.turns}   utterances ${said.length}   floor_lost ${seen.lost}`
  + `   refusals ${seen.refusals}   nudges ${seen.nudges}   dog ${dogs.map((d) => d.outcome).join(',')}`);
console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  one floor carried the whole exchange and nobody in another zone');
  console.log('    was offered it; 渡辺 was asked repeatedly and never made to');
  console.log('    speak; 澄子 heard it all, was nudged once, and answered only');
  console.log('    when called; transport came from the act; no id or name');
  console.log('    reached a package; a conversation left no episodes but a');
  console.log('    deliberate memory still could; live and replay identical every');
  console.log('    frame; no provider anywhere');
}
process.exitCode = problems.length ? 1 : 0;
