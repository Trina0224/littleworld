/**
 * Regression tests for phase-3e-pre-floor-corrections.md §1.
 *
 * Run with:
 *   node src/engine/meeting-boundary.test.js
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createMemory } from './memory.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const anchors = read(SPEC, 'anchors.json');
const grid = read(SPEC, 'navgrid.json');
const zoneSpec = read(SPEC, 'zones.json');

function setup({ seeds = new Map() } = {}) {
  const nav = createNav(grid);
  const zones = createZones(zoneSpec, nav);
  const world = createWorld({ anchors, nav, seed: 20260825 });
  const minds = new Set(['observer', 'other', 'seeded']);
  const memory = createMemory(world, { seeds, minds });
  const entities = new Map([
    ['observer', { appearance: 'an observer', kind: 'person' }],
    ['other', { appearance: 'another person', kind: 'person' }],
    ['seeded', { appearance: 'a familiar person', kind: 'person' }]
  ]);
  const perception = createPerception(world, zones, { entities });
  const runtime = createActivityRuntime(world);
  const loop = createLoop({ world, runtime, perception, memory });
  world.start();
  return { world, memory, loop };
}

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

// A Brain can know something about a person before ever meeting them.
{
  const { world, memory, loop } = setup();
  memory.note('observer', 'other', 'I noticed this person from a distance');
  memory.learnLabel('observer', 'other', 'the person by the gate');

  let p = memory.recall('observer', 'other');
  check(!!p, 'note/label failed to create a person model');
  check(p?.encounters === 0, 'note/label created an encounter');
  check(p?.firstMetTick === null, 'note/label set firstMetTick');
  check(!memory.episodesFor('observer').some((e) => e.kind === 'first_meeting'),
    'note/label wrote first_meeting');

  // First true proximity is the first meeting.
  world.spawn('observer', [470, 262]);
  world.spawn('other', [478, 264]);
  loop.run(2, {});

  p = memory.recall('observer', 'other');
  check(p?.encounters === 1, `first proximity counted ${p?.encounters} encounters`);
  check(p?.firstMetTick !== null, 'first real proximity did not set firstMetTick');
  check(memory.episodesFor('observer').filter((e) => e.kind === 'first_meeting').length === 1,
    'first real proximity did not write exactly one first_meeting');

  // Staying together cannot create another first-meeting episode.
  loop.run(100, {});
  check(memory.episodesFor('observer').filter((e) => e.kind === 'first_meeting').length === 1,
    'continuous contact duplicated first_meeting');
}

// A landed directed utterance can be the first meeting even outside nearRange.
{
  const { world, memory, loop } = setup();
  world.spawn('observer', [470, 262]);
  world.spawn('other', [525, 262]); // 55: outside nearRange, inside hearingRange
  world.say('other', 'こんにちは', { to: 'observer' });
  loop.run(2, {});

  const p = memory.recall('observer', 'other');
  check(p?.encounters === 1, 'landed direct address did not open an encounter');
  check(p?.spokenWith === 1, 'landed direct address did not count spokenWith');
  check(p?.firstMetTick !== null, 'landed direct address did not set firstMetTick');
  check(memory.episodesFor('observer').filter((e) => e.kind === 'first_meeting').length === 1,
    'landed direct address did not write exactly one first_meeting');
}

// Authored knowledge never pretends the recorded simulation witnessed the first meeting.
{
  const seeds = new Map([
    ['observer', [{ who: 'seeded', as: 'old acquaintance' }]]
  ]);
  const { world, memory, loop } = setup({ seeds });
  world.spawn('observer', [470, 262]);
  world.spawn('seeded', [478, 264]);
  loop.run(2, {});

  const p = memory.recall('observer', 'seeded');
  check(p?.encounters === 1, 'seeded person did not accumulate an in-world encounter');
  check(p?.firstMetTick === null, 'seeded knowledge was assigned an in-world firstMetTick');
  check(!memory.episodesFor('observer').some(
    (e) => e.kind === 'first_meeting' && e.entityId === 'seeded'),
  'seeded knowledge wrote a first_meeting episode');
}

if (problems.length) {
  console.error(`meeting-boundary: ${problems.length} failure(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exitCode = 1;
} else {
  console.log('meeting-boundary: all checks passed');
}
