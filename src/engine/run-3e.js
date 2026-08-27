/**
 * Phase 3E acceptance: a scripted afternoon, covering the conversation contract
 * without a provider. The original numbered list has 18 items; the 2026-08-26
 * owner correction supersedes its parallel-offer / simulation-tick-timeout
 * mechanics with one sequential Brain offer at a time.
 *
 *   node src/engine/run-3e.js
 *
 * Scripted, not mocked: every choice below is written here. A stand-in that
 * DECIDED would make these pass for reasons the run does not control, and 3E is
 * about session mechanics rather than about judgement.
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

const { world, memory, floors, loop } = build();
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
const seen = { nudges: 0, refusals: 0, turns: 0 };
const spoken = (text) => world.log.facts.some((e) => e.type === 'speech_said' && e.text === text);
const ASK = '辰ちゃん、宿題は終わったの';
const ANSWER = 'うん、もう終わった';
const CALL = '澄子さん、お茶をもう一杯';
const DOG = 'ハナ、おいで';
const SUMIKO_REPLY = 'はい、ただいま';
let remarks = 0;
let sumikoContext = null;
let watanabeContext = null;
const liveFrames = [];
const live = createView();

/** The script. Every branch is written here; nothing decides. */
function choose(o) {
  if (o.entityId === 'man-01') { watanabeContext = watanabeContext ?? o.context; return 'decline'; }

  if (o.entityId === 'shopkeeper-01') {
    if (o.why === 'overheard') { seen.nudges += 1; sumikoContext = o.context; return 'decline'; }
    if (o.why === 'addressed') {
      const back = pickAt(o, 'call_across', 'grandma-01');
      check(!pickAt(o, 'reply', 'grandma-01'),
        'she was offered a reply into a floor she is not standing on');
      return back ? { pick: back, text: SUMIKO_REPLY } : 'decline';
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

loop.run(120, {
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

// Persistence: one floor carried the whole exchange.
check(said.length >= 6, `only ${said.length} utterances in the scripted run`);
check(said.filter((e) => e.zone === 'near-table').length >= 5,
  'the table conversation did not stay on one floor');

// No round-robin across zones: 澄子 is never offered the table's floor.
check(!audit.some((e) => e.type === 'floor_offered'
  && e.agent === 'shopkeeper-01' && e.zone === 'near-table'),
  'somebody in another zone was offered the table floor');

// Walking in is joining: there is no join/leave conversation action.
check(!Object.keys(await import('./floors.js').then((m) => m.ACTS))
  .some((a) => /join|leave/.test(a)), 'a join or leave action exists');

// Silence is legal; 渡辺 remains himself.
check(!said.some((e) => e.agent === 'man-01'), '渡辺 was made to speak');
check(audit.some((e) => e.type === 'floor_declined' && e.agent === 'man-01'),
  '渡辺 was never even asked once after the stronger speakers were exhausted');
check(!!watanabeContext, '渡辺 was never handed a private package');

// Physical boundary / cross-zone transcript.
const hersHeard = facts.filter((e) => e.type === 'speech_said'
  && e.heardBy.includes('shopkeeper-01')).length;
check(hersHeard >= 5, `the test premise is wrong: she heard ${hersHeard} lines`);
check(floors.utterancesFor('shopkeeper-01')
  .every((u) => u.speaker === 'shopkeeper-01' || u.addressed === 'shopkeeper-01'),
  'an overheard table conversation entered her transcript');
check(floors.utterancesFor('shopkeeper-01').length === 2,
  `her transcript holds ${floors.utterancesFor('shopkeeper-01').length} lines`);

check(spoken(ANSWER), '辰 never answered the question he was asked');
check(spoken(CALL) && said.some((e) => e.text === SUMIKO_REPLY),
  '澄子 was called across the way and never called back');
check(floors.openQuestionIn('near-table') === null, 'the answered question is still a debt');

// Transcript is not long-term memory; deliberate meaning still can be.
for (const id of ['grandma-01', 'brother-01']) {
  check(memory.episodesFor(id).every((e) => e.kind === 'first_meeting'),
    `${id} turned a conversation into ${memory.episodesFor(id).length} episodes`);
}
memory.note('grandma-01', 'brother-01', '宿題を終わらせたと言っていた');
check(memory.episodesFor('grandma-01').some((e) => e.kind === 'note'),
  'a deliberate memory could not be written');

// A cross-zone direct exchange can be remembered without making the observer a
// participant in the other zone's Floor.
check(memory.recall('shopkeeper-01', 'grandma-01')?.spokenWith >= 1,
  'being called across the way was not remembered as a conversation');

// Identity safety.
const packages = JSON.stringify([sumikoContext?.forModel, watanabeContext?.forModel]);
for (const id of CAST) check(!packages.includes(id), `an entity id reached a package: ${id}`);
const his = JSON.stringify(watanabeContext?.forModel);
for (const n of ['星', 'チヤ', '森ジョナサン', '国分', '澄子', '渡辺', '奧山', '辰']) {
  check(!his.includes(n), `a canonical name reached the package of a man told nothing: ${n}`);
}

// Act-derived transport.
check(said.some((e) => e.scope === 'normal') && said.some((e) => e.scope === 'broadcast'),
  'both transports were not exercised');
const zoneNow = (id) => facts.filter((e) => e.type === 'speech_said' && e.agent === id).at(-1)?.zone;
check(said.filter((e) => e.scope === 'broadcast')
  .every((e) => e.to && zoneNow(e.to) !== e.zone),
  'a carrying voice was used for something other than calling across');
check(said.filter((e) => e.scope === 'normal').every((e) => !e.to || zoneNow(e.to) === e.zone
  || e.to === 'dog-01'),
  'an ordinary voice was used to reach another zone');

// One bounded overheard nudge for the source social spell.
check(seen.nudges === 1, `澄子 was nudged ${seen.nudges} times by one conversation`);

// No provider implementation belongs in 3E. The floor store is synchronous
// engine state: waiting for a Brain means retaining an outstanding offer, not
// awaiting a Promise inside the tick loop.
check(!/await|Promise|then\(/.test(readFileSync(join(HERE, 'floors.js'), 'utf8')),
  'the floor store learned to block a tick on provider machinery');

// Exactly once: the authored unique lines each commit once. The deeper
// perception/memory regression lives in exactly-once-3e.test.js.
for (const line of [ASK, ANSWER, CALL, DOG, SUMIKO_REPLY]) {
  check(said.filter((e) => e.text === line).length === 1,
    `"${line}" was committed ${said.filter((e) => e.text === line).length} times`);
}

// Low-level fact replay remains exact. Final audience presentation is a later
// timeline/script pass and is not required to preserve these tick intervals.
{
  const out = [];
  replay({ facts }, { onTick: (f) => out.push(JSON.stringify(f)) });
  const n = Math.min(out.length, liveFrames.length);
  check(out.length === liveFrames.length,
    `live ran ${liveFrames.length} frames, replay ${out.length}`);
  let bad = -1;
  for (let i = 0; i < n; i += 1) if (out[i] !== liveFrames[i]) { bad = i; break; }
  check(bad === -1, `low-level fact replay differs at frame ${bad}`);
}

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
console.log(`  frames ${liveFrames.length}   offers ${seen.turns}   utterances ${said.length}`
  + `   refusals ${seen.refusals}   nudges ${seen.nudges}   dog ${dogs.map((d) => d.outcome).join(',')}`);
console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
} else {
  console.log('OK  one sequential floor carried the exchange; 渡辺 was allowed to');
  console.log('    decline; 澄子 heard without joining, was nudged once, and');
  console.log('    answered only when called; transport came from the act; no id');
  console.log('    or unknown name reached a package; ordinary conversation made');
  console.log('    no long-term episodes; exact fact replay still matches');
}
process.exitCode = problems.length ? 1 : 0;