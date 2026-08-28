/**
 * Manual real-Brain demo, per docs/notes/pre-3f-manual-llm-demo.md.
 *
 *   node src/engine/demo-brain.js --dir <run directory> [--ticks 600]
 *                                 [--seed 3050] [--calls 20]
 *
 * This is NOT 3F-B and NOT 3G. There is no provider, no scheduler, no retry, no
 * budget. Transport is a pair of directories: the harness writes a self-contained
 * request into <dir>/pending and blocks until <dir>/answer holds its reply. An
 * operator - or an operator's model - supplies the judgement.
 *
 * The whole point is the isolation rule: whoever answers request N sees that
 * character's self.md, its derived guidance and that one package. Nothing else.
 * Not bible.md, not another character's sheet, not the world's own state, and
 * not the previous requests. A Brain that has read the author's notes cannot
 * tell us whether the package is sufficient, which is the only question this
 * demo exists to answer.
 *
 * World time does not wait, and it does not expire the request either: the loop
 * stops at the offer and resumes when the answer lands, which is the owner
 * latency correction taken literally.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createMemory, buildContext } from './memory.js';
import { createFloors, trimSpeech } from './floors.js';
import { createAnimals } from './animals.js';
import { createSocialWeigher, speechBudget, interjectPatience } from './social.js';
import { createGrounding } from './grounding.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';
import { buildPrefix } from './prompt.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const DIR = args.get('dir');
if (!DIR) { console.error('need --dir'); process.exit(1); }
const TICKS = Number(args.get('ticks') ?? 600);
const SEED = Number(args.get('seed') ?? 3050);
const MAX_CALLS = Number(args.get('calls') ?? 20);

// The note's first-demo cast: enough for a real conversation, small enough to read.
const CAST = (args.get('cast') ?? 'grandma-01,man-01,shopkeeper-01,brother-01,dog-01').split(',');
const SPOTS = { 'grandma-01': [227, 235], 'brother-01': [232, 238], 'man-01': [222, 240],
                'shopkeeper-01': [222, 178], 'dog-01': [236, 236] };

for (const sub of ['pending', 'answer', 'done']) mkdirSync(join(DIR, sub), { recursive: true });
const TRANSCRIPT = join(DIR, 'transcript.md');
const say = (line) => { appendFileSync(TRANSCRIPT, line + '\n'); console.log(line); };

// --- the world, built exactly as run-3e.js builds it -------------------------
const entities = new Map(), seeds = new Map(), minds = new Set(), traits = new Map(), beasts = new Map();
const prefixes = new Map();
for (const id of CAST) {
  const c = read(ROOT, 'characters', id, 'character.json');
  const deterministic = c.brain === 'deterministic';
  entities.set(id, { appearance: c.appearance, kind: deterministic ? 'animal' : 'person' });
  if (deterministic) beasts.set(id, { bonds: c.bonds ?? [] });
  else {
    minds.add(id);
    traits.set(id, c.social);
    // self.md by name, never bible.md, and read once so the loop cannot drift.
    prefixes.set(id, buildPrefix(c, readFileSync(join(ROOT, 'characters', id, 'self.md'), 'utf8')));
  }
  if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
}

const nav = createNav(read(SPEC, 'navgrid.json'));
const zones = createZones(read(SPEC, 'zones.json'), nav);
const world = createWorld({ anchors: read(SPEC, 'anchors.json'), nav, zones, seed: SEED });
const memory = createMemory(world, { seeds, minds });
const perception = createPerception(world, zones, {
  entities, attentionHint: (o, e) => memory.attentionHint(o, e)
});
const animals = createAnimals(world, { table: beasts, nearRange: perception.config.nearRange });
let floors;
floors = createFloors(world, zones, perception, {
  minds, animals,
  weigh: createSocialWeigher({ traitsFor: traits, memory }),
  budgetFor: (id) => speechBudget(traits.get(id)),
  patienceFor: (id) => interjectPatience(traits.get(id)),
  ground: createGrounding(world, zones),
  makeContext: (id) => buildContext(perception, memory, id, floors)
});
const loop = createLoop({ world, runtime: createActivityRuntime(world), perception, memory, floors });

world.start();
for (const id of CAST) world.spawn(id, SPOTS[id]);

// --- transport ---------------------------------------------------------------
/** Block the world - not the clock's idea of time, the process - until a file lands. */
function waitFor(path) {
  const idle = new Int32Array(new SharedArrayBuffer(4));
  while (!existsSync(path)) Atomics.wait(idle, 0, 0, 500);
  return JSON.parse(readFileSync(path, 'utf8'));
}

let n = 0;
function ask(offer) {
  n += 1;
  const id = String(n).padStart(4, '0');
  const prompt = [
    prefixes.get(offer.entityId),
    '',
    '---',
    '',
    '## 現在',
    '',
    '```json',
    JSON.stringify(offer.context.forModel, null, 2),
    '```',
    '',
    '只回一行 JSON，不要別的。'
  ].join('\n');

  writeFileSync(join(DIR, 'pending', `${id}.md`), prompt);
  writeFileSync(join(DIR, 'pending', `${id}.json`), JSON.stringify({
    id, tick: world.tick, character: offer.entityId, zone: offer.zone,
    why: offer.why, round: offer.round, menu: offer.menu,
    promptChars: prompt.length
  }, null, 2));
  say(`\n> **請求 ${id}** — tick ${world.tick} / ${offer.zone} / ${offer.entityId} / ${offer.why}`);

  const answer = waitFor(join(DIR, 'answer', `${id}.json`));
  renameSync(join(DIR, 'pending', `${id}.md`), join(DIR, 'done', `${id}.md`));
  renameSync(join(DIR, 'pending', `${id}.json`), join(DIR, 'done', `${id}.json`));
  return answer;
}

// --- the run -----------------------------------------------------------------
say(`# 手動 Brain demo — seed ${SEED}, ${CAST.filter((i) => minds.has(i)).length} 個 Brain\n`);
let calls = 0;
for (let t = 0; t < TICKS && calls < MAX_CALLS; t += 1) {
  loop.step();
  for (const offer of floors.offers()) {
    if (calls >= MAX_CALLS) { floors.decline(offer.entityId); continue; }
    calls += 1;
    const answer = ask(offer);
    const picks = answer.picks ?? (answer.pick ? [answer.pick] : []);
    if (!picks.length || (picks.length === 1 && picks[0] === 'nothing')) {
      floors.decline(offer.entityId);
      say(`  *（${offer.entityId} 沒有說話）*`);
      continue;
    }
    const result = floors.commit(offer.entityId, { picks, text: answer.text ?? null });
    if (result.refused) {
      // Not swept under the carpet: a refusal here is an interface defect, and
      // finding those is what the demo is for.
      say(`  **拒絕：${result.refused}** — \`${picks.join(' + ')}\``);
      floors.decline(offer.entityId);
      continue;
    }
    // What the WORLD took, not what the Brain sent: the first run printed the
    // Brain's text and so hid a truncation that only surfaced two turns later,
    // inside somebody else's transcript.
    const took = trimSpeech(answer.text, Math.min(
      speechBudget(traits.get(offer.entityId)), floors.config.speechLimit));
    say(`  **${offer.entityId}**（${picks.join(' + ')}）：${took}`
      + (took === answer.text ? '' : `\n  *（引擎切掉了後面 ${answer.text.length - took.length} 個字）*`));
  }
}

// The last answer is only committed on the NEXT tick, so a run that stops the
// moment the call budget is spent throws away the line it just paid for.
for (let t = 0; t < 4; t += 1) {
  loop.step();
  for (const offer of floors.offers()) floors.decline(offer.entityId);
}

say(`\n---\n\n${calls} 次 Brain 呼叫，${world.tick} ticks，`
  + `${world.log.facts.filter((e) => e.type === 'speech_said').length} 句話。`);
writeFileSync(join(DIR, 'facts.json'), JSON.stringify(world.log.facts, null, 2));
