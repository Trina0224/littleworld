/** Phase 3E exactly-once speech integration regression. */
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
const ids = ['grandma-01', 'brother-01'];
const entities = new Map();
const seeds = new Map();
const minds = new Set(ids);
for (const id of ids) {
  const c = read(ROOT, 'characters', id, 'character.json');
  entities.set(id, { appearance: c.appearance, kind: 'person' });
  if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
}
const nav = createNav(read(SPEC, 'navgrid.json'));
const zones = createZones(read(SPEC, 'zones.json'), nav);
const world = createWorld({ anchors: read(SPEC, 'anchors.json'), nav, zones, seed: 311 });
const memory = createMemory(world, { seeds, minds });
const perception = createPerception(world, zones, { entities });
let floors;
floors = createFloors(world, zones, perception, {
  minds, config: { batch: 1 },
  makeContext: (id) => buildContext(perception, memory, id, floors)
});
const loop = createLoop({ world, runtime: createActivityRuntime(world), perception, memory, floors });
world.start();
world.spawn('grandma-01', [227, 235]);
world.spawn('brother-01', [232, 238]);

const LINE = '一度だけ言う';
let committed = false;
for (let i = 0; i < 12; i += 1) {
  loop.step();
  for (const o of floors.offers()) {
    if (!committed && o.entityId === 'grandma-01') {
      const ref = [...o.context.refs.entries()].find(([, id]) => id === 'brother-01')?.[0];
      const pick = ref && o.menu.find((m) => m === `greet:${ref}`);
      if (pick) {
        floors.commit(o.entityId, { pick, text: LINE });
        committed = true;
        continue;
      }
    }
    floors.decline(o.entityId);
  }
}
for (let i = 0; i < 4; i += 1) {
  loop.step();
  for (const o of floors.offers()) floors.decline(o.entityId);
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };
const speech = world.log.facts.filter((e) => e.type === 'speech_said' && e.text === LINE);
check(committed, 'the scripted utterance was never claimed');
check(speech.length === 1, `conversation bookkeeping committed the line ${speech.length} times`);
check(floors.transcript('near-table').filter((u) => u.text === LINE).length === 1,
  'the committed line is not exactly once in the floor transcript');
check(memory.recall('brother-01', 'grandma-01')?.spokenWith === 1,
  'one directed utterance did not produce exactly one spoken encounter');
check(memory.episodesFor('brother-01').filter((e) => e.kind !== 'first_meeting').length === 0,
  'ordinary speech leaked into long-term episodes');

console.log('');
if (problems.length) console.log(`FAILED\n  ${problems.join('\n  ')}`);
else console.log('OK  one floor claim -> one speech fact -> one transcript entry -> one spoken encounter');
process.exitCode = problems.length ? 1 : 0;
