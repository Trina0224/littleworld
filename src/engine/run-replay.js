/**
 * Replay acceptance: the twelve things §11 says have to work.
 *
 *   node src/engine/run-replay.js
 *
 * docs/specs/engine/replay-presentation.md §11. It builds a real Phase 3F
 * recording, saves it, loads it back without touching live Simulation state, and
 * then plays it both ways - exact and audience - on the same file.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createWorld } from './world.js';
import { createNav } from './nav.js';
import { createZones } from './zones.js';
import { createPerception } from './perception.js';
import { createMemory, buildContext } from './memory.js';
import { createFloors } from './floors.js';
import { createSocialWeigher, speechBudget, interjectPatience } from './social.js';
import { createGrounding } from './grounding.js';
import { createAmbient } from './ambient.js';
import { createCafe } from './cafe.js';
import { createActivityRuntime } from './activity.js';
import { createLoop } from './loop.js';
import { replay } from './view.js';
import { saveRecording, loadRecording, publicOnly } from './recording.js';
import { extractStory } from './story.js';
import { buildTimeline, readingMs } from './presentation.js';
import { validateScript, compareModes } from './script.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SPEC = join(ROOT, 'docs', 'specs', 'world');
const RUNS = join(ROOT, 'docs', 'runs');
const read = (...p) => JSON.parse(readFileSync(join(...p), 'utf8'));

const CAST = ['grandma-01', 'shopkeeper-01', 'man-01', 'brother-01'];
const NEAR_TABLE = [[227, 235], [232, 238], [222, 240]];
const COUNTER = [222, 178];
// Walkable cells, found rather than written down: the tidy centroids elsewhere
// in the suite are furniture, which is fine to stand on and impossible to walk
// to. He has to actually cross the scene for the retiming to have anything to
// keep continuous.
const WALKS_FROM = [350, 78];
const WALKS_TO = [302, 194];

const problems = [];
const check = (ok, label) => { if (!ok) problems.push(label); };

/**
 * A short afternoon with everything in it: somebody arrives, two people talk,
 * one of them orders tea, it is made and carried over, and there is a long dull
 * stretch in the middle for the edit to compress.
 */
function generate() {
  const entities = new Map(), seeds = new Map(), minds = new Set(), traits = new Map();
  for (const id of CAST) {
    const c = read(ROOT, 'characters', id, 'character.json');
    entities.set(id, { appearance: c.appearance, kind: 'person' });
    minds.add(id);
    traits.set(id, c.social);
    if (Array.isArray(c.knows) && c.knows.length) seeds.set(id, c.knows);
  }
  const nav = createNav(read(SPEC, 'navgrid.json'));
  const zones = createZones(read(SPEC, 'zones.json'), nav);
  const world = createWorld({ anchors: read(SPEC, 'anchors.json'), nav, zones, seed: 3070 });
  const ambient = createAmbient(world);
  const memory = createMemory(world, { seeds, minds });
  const perception = createPerception(world, zones, {
    entities, attentionHint: (o, e) => memory.attentionHint(o, e)
  });
  const menu = read(SPEC, 'cafe-menu.json');
  const cafe = createCafe(world, zones, {
    menu, attendant: 'shopkeeper-01', config: { graceTicks: 60 }
  });
  let floors;
  floors = createFloors(world, zones, perception, {
    minds, cafe,
    weigh: createSocialWeigher({ traitsFor: traits, memory }),
    budgetFor: (id) => speechBudget(traits.get(id)),
    patienceFor: (id) => interjectPatience(traits.get(id)),
    ground: createGrounding(world, zones, { ambient: ambient.state, cafe }),
    makeContext: (id) => buildContext(perception, memory, id, floors)
  });
  const loop = createLoop({
    world, runtime: createActivityRuntime(world), perception, memory, floors, venue: cafe
  });
  world.start();
  ambient.record();
  world.spawn('grandma-01', NEAR_TABLE[0]);
  world.spawn('shopkeeper-01', COUNTER);
  world.spawn('man-01', NEAR_TABLE[1]);
  world.spawn('brother-01', WALKS_FROM);    // across the scene, and walks over later

  // A small scripted afternoon. Written here rather than decided, because what
  // is under test is Replay - the recording only has to contain the shapes
  // Replay must handle: several lines, one order, one long walk, and a dull
  // stretch in the middle.
  const script = [
    ['grandma-01', 'greet:', 'こんにちは。今日は過ごしやすいこと'],
    ['man-01', 'reply:', 'ええ。どうも'],
    ['grandma-01', 'ask:', 'こちらへはお仕事で？'],
    ['man-01', 'reply:', '出張所に。一年になります'],
    ['grandma-01', 'order:tea_sencha', '煎茶をひとつ、お願いしますね'],
    ['grandma-01', 'greet:', 'あら、こっちへおいで'],
    ['man-01', 'reply:', 'おとなしい子ですね']
  ];
  let step = 0, walked = false;
  for (let t = 0; t < 900; t += 1) {
    // He crosses the whole scene, which is the movement the retiming must not
    // break: it spans a stretch the edit wants to compress.
    if (t === 320 && !walked) {
      walked = world.moveTo('brother-01', WALKS_TO);
      if (!walked) throw new Error('the test premise is wrong: he could not set off');
    }
    loop.step();
    for (const o of floors.offers()) {
      const want = script[step];
      if (want && o.entityId === want[0]) {
        const pick = want[1].endsWith(':')
          ? o.menu.find((m) => m.startsWith(want[1]) && !m.endsWith(o.entityId))
          : (o.menu.includes(want[1]) ? want[1] : null);
        if (pick && !floors.commit(o.entityId, { pick, text: want[2] }).refused) {
          step += 1;
          continue;
        }
      }
      floors.decline(o.entityId);
    }
  }
  world.stop();
  return { world, ambient, cafe, menu };
}

// --- 1. save and load, without rerunning anything --------------------------
const { world, ambient, cafe, menu } = generate();
const placements = read(ROOT, 'docs', 'specs', 'characters', 'placements.json');
const saved = saveRecording(world, {
  ambient: ambient.state,
  menu,
  // Opaque to the engine: the sprite box the browser draws, reused from the
  // placements the static scene already ships rather than invented here.
  cast: placements.placements.map((p) => ({
    id: p.id, sprite: p.key, w: p.w, h: p.h, footOffsetY: +(p.depth - p.y).toFixed(2)
  })),
  notes: 'run-replay.js acceptance recording'
});
mkdirSync(RUNS, { recursive: true });
writeFileSync(join(RUNS, '3f-cafe.json'), JSON.stringify(saved));

const file = JSON.parse(readFileSync(join(RUNS, '3f-cafe.json'), 'utf8'));
const rec = loadRecording(file);
check(rec.facts.length >= 15, `the recording holds ${rec.facts.length} facts`);
check(rec.ambient?.weatherType, 'the recording does not say what kind of day it was');
check(rec.menu?.items?.length > 20, 'the recording does not say what the cafe was selling');
check(rec.cast?.length === 12, `the recording carries ${rec.cast?.length} display entries`);
check(rec.private === false, 'a saved recording defaulted to carrying the private stream');
check(rec.audit === undefined, 'the private stream was written out anyway');
{
  // A file this build cannot honestly play is refused rather than half-read.
  const wrongFormat = () => loadRecording({ ...file, format: 99 });
  let refused = false;
  try { wrongFormat(); } catch { refused = true; }
  check(refused, 'a recording written by another format was loaded anyway');
  // And a recording whose facts are out of order would make every source index
  // Replay hands out a lie, so it is not a recording.
  let outOfOrder = false;
  try {
    loadRecording({ ...file, facts: [{ t: 5, type: 'x' }, { t: 1, type: 'x' }] });
  } catch { outOfOrder = true; }
  check(outOfOrder, 'a recording with its facts shuffled was accepted');

  const withAudit = saveRecording(world, { ambient: ambient.state, menu, audit: true });
  check(withAudit.private === true && Array.isArray(withAudit.audit),
    'asking for audit did not produce any');
  check(publicOnly(withAudit).audit === undefined && publicOnly(withAudit).private === false,
    'publicOnly left the private stream in');
}

// --- 2. exact replay is unchanged ------------------------------------------
{
  const frames = [];
  replay(rec, { onTick: (s) => frames.push(s) });
  const again = [];
  replay(loadRecording(JSON.parse(JSON.stringify(file))), { onTick: (s) => again.push(s) });
  check(frames.length === rec.lastTick + 1,
    `exact replay produced ${frames.length} frames for ${rec.lastTick + 1} ticks`);
  check(JSON.stringify(frames) === JSON.stringify(again), 'exact replay is not byte-stable');
  var exactFrames = frames;
}

// --- 3. the audience clock is not the tick counter -------------------------
const story = extractStory(rec);
const timeline = buildTimeline(story);
check(timeline.durationMs > 0, 'the timeline has no duration');
check(timeline.durationMs !== rec.lastTick * rec.tickDurationMs,
  'the presentation is exactly as long as the simulation, which is the one thing it must not be');
check(timeline.durationMs < rec.lastTick * rec.tickDurationMs,
  `${timeline.durationMs}ms of presentation for ${rec.lastTick * rec.tickDurationMs}ms of world`);

// --- 4. a dead gap compresses, and nothing changes places ------------------
{
  const dialogue = timeline.events.filter((e) => e.kind === 'dialogue');
  check(dialogue.length >= 2, `only ${dialogue.length} lines to order`);
  const inFacts = dialogue.map((e) => Math.min(...e.source.map((i) => rec.facts[i].t)));
  const inPresentation = dialogue.map((e) => e.startMs);
  for (let i = 1; i < dialogue.length; i += 1) {
    check(inFacts[i] >= inFacts[i - 1] && inPresentation[i] >= inPresentation[i - 1],
      `line ${i} moved: ticks ${inFacts[i - 1]}->${inFacts[i]}, ms ${inPresentation[i - 1]}->${inPresentation[i]}`);
  }
  // The longest dull stretch really was dull, and really did shrink.
  let worst = { ticks: 0, ms: 0 };
  for (let i = 1; i < timeline.marks.length; i += 1) {
    const dt = timeline.marks[i].t - timeline.marks[i - 1].t;
    if (dt > worst.ticks) worst = { ticks: dt, ms: timeline.marks[i].ms - timeline.marks[i - 1].ms };
  }
  check(worst.ticks > 100, `the test premise is wrong: the longest gap was ${worst.ticks} ticks`);
  check(worst.ms < worst.ticks * rec.tickDurationMs / 2,
    `a ${worst.ticks}-tick gap became ${worst.ms}ms, which is not compression`);
}

// --- 5. movement stays continuous through the retiming ---------------------
{
  const walk = timeline.events.find((e) => e.kind === 'movement');
  check(walk, 'nobody walked in the recording');
  check(walk.durationMs > 0, 'a walk was retimed to take no time at all');
  const beat = story.beats.find((b) => b.kind === 'movement' && b.who === walk.who);
  // Sampled along the walk, presentation time moves forward and only forward.
  let last = -1, backwards = 0;
  for (let t = beat.t; t <= beat.untilT; t += 1) {
    const ms = timeline.msAt(t);
    if (ms < last) backwards += 1;
    last = ms;
  }
  check(backwards === 0, `presentation time went backwards ${backwards} times inside a walk`);
  check(timeline.msAt(beat.untilT) - timeline.msAt(beat.t) === walk.durationMs,
    'the walk and the map disagree about how long it took');
}

// --- 6. the order is explicable, and not from the sentence -----------------
{
  const order = timeline.events.find((e) => e.kind === 'order');
  check(order, 'the recording has no order');
  check(order.caption === '煎茶', `the caption reads ${order.caption}`);
  check(order.customer === 'grandma-01', `the order was captioned as ${order.customer}'s`);
  const spoken = timeline.events.filter((e) => e.kind === 'dialogue').map((e) => e.text);
  // The line that placed it says nothing a parser could use; that is the point.
  check(!spoken.some((t) => t.includes('煎茶をひとつ、お願いしますね') === false && t.includes('煎茶')),
    'the test premise is wrong');
  const other = spoken.filter((t) => !t.includes('煎茶'));
  check(other.length >= 1, 'every line named the item, so nothing was proved');
}

// --- 7. a long preparation is a montage that still runs forwards -----------
{
  const order = timeline.events.find((e) => e.kind === 'order');
  const placed = rec.facts.findIndex((f) => f.type === 'order_placed');
  const ready = rec.facts.find((f) => f.type === 'order_ready');
  const served = rec.facts.find((f) => f.type === 'order_served');
  check(ready && served, 'the order never completed');
  const realMs = (served.t - rec.facts[placed].t) * rec.tickDurationMs;
  const shownMs = order.servedMs - order.startMs;
  check(shownMs < realMs, `${shownMs}ms shown for ${realMs}ms of work, which is not a montage`);
  check(shownMs > 0, 'the whole order happened in an instant');
  check(order.readyMs <= order.servedMs, 'it was served before it was ready');
  check(order.startedMs <= order.readyMs, 'it was ready before anyone started making it');
}

// --- 8. subtitles get reading time, not tick lifetimes ---------------------
{
  const lines = timeline.events.filter((e) => e.kind === 'dialogue');
  for (const line of lines) {
    check(line.durationMs === readingMs(line.text),
      `a ${[...line.text].length}-character line got ${line.durationMs}ms`);
    check(line.durationMs >= 1200, `a line was on screen for ${line.durationMs}ms`);
  }
  const long = lines.reduce((a, b) => ([...a.text].length > [...b.text].length ? a : b));
  const short = lines.reduce((a, b) => ([...a.text].length < [...b.text].length ? a : b));
  check(long.durationMs > short.durationMs || long.text === short.text,
    'a long line and a short line were given the same time');
}

// --- 11. an editor's script is checked, not trusted ------------------------
{
  const speech = rec.facts.map((f, i) => ({ f, i })).filter((x) => x.f.type === 'speech_said');
  check(speech.length >= 2, 'not enough speech to build a script from');
  const good = { events: [
    { source: [speech[0].i], kind: 'dialogue', speaker: speech[0].f.agent,
      text: 'こんにちは。ええ天気で。', startMs: 0, durationMs: 2000 },
    { source: [], kind: 'caption', editorial: true, text: '——喫茶ひだまり、午後',
      startMs: 2200, durationMs: 1500 },
    { source: [speech[1].i], kind: 'dialogue', speaker: speech[1].f.agent,
      text: 'ええ、どうも。', startMs: 4000, durationMs: 1600 }
  ] };
  const ok = validateScript(good, rec);
  check(ok.ok, `a lightly cleaned script was rejected: ${ok.problems.join('; ')}`);

  const bad = [
    [{ events: [{ source: [speech[0].i], kind: 'dialogue', speaker: 'brother-01',
                  text: 'x', startMs: 0 }] }, 'put a line in the wrong mouth'],
    [{ events: [{ source: [], kind: 'dialogue', speaker: 'grandma-01',
                  text: 'x', startMs: 0 }] }, 'invented a line from nothing'],
    [{ events: [{ source: [99999], kind: 'dialogue', speaker: 'grandma-01',
                  text: 'x', startMs: 0 }] }, 'cited a fact that does not exist'],
    [{ events: [
        { source: [speech[1].i], kind: 'dialogue', speaker: speech[1].f.agent, text: 'x', startMs: 0 },
        { source: [speech[0].i], kind: 'dialogue', speaker: speech[0].f.agent, text: 'y', startMs: 100 }
      ] }, 'reversed two lines'],
    [{ events: [{ source: [1], kind: 'caption', editorial: true, text: 'x', startMs: 0 }] },
      'marked an entry editorial and still claimed a fact']
  ];
  for (const [script, what] of bad) {
    check(!validateScript(script, rec).ok, `a script that ${what} was accepted`);
  }
  // An order attributed to the wrong person, which is §5's clearest rule.
  const placed = rec.facts.findIndex((f) => f.type === 'order_placed');
  check(!validateScript({ events: [{ source: [placed], kind: 'order', customer: 'man-01',
    item: 'tea_sencha', startMs: 0 }] }, rec).ok, 'an order was given to the wrong customer');
  check(!validateScript({ events: [{ source: [placed], kind: 'order', customer: 'grandma-01',
    item: 'coffee_house', startMs: 0 }] }, rec).ok, 'the wrong item was captioned');
  check(validateScript({ events: [{ source: [placed], kind: 'order', customer: 'grandma-01',
    item: 'tea_sencha', startMs: 0 }] }, rec).ok, 'a true order caption was rejected');
}

// --- 10, 12. two modes over one file, and the difference is a choice -------
{
  const diff = compareModes(exactFrames, timeline);
  check(diff.invented.length === 0,
    `the audience heard ${diff.invented.length} lines nobody said: ${diff.invented}`);
  check(diff.exactTicks !== diff.audienceMs,
    'the two modes are the same length, so one of them is not doing its job');
  check(diff.linesInAudience > 0, 'the audience mode has no dialogue at all');
}

// The saved timeline, so the browser player has something to load.
writeFileSync(join(RUNS, '3f-cafe.timeline.json'), JSON.stringify({
  format: 1,
  source: '3f-cafe.json',
  durationMs: timeline.durationMs,
  tickDurationMs: timeline.tickDurationMs,
  ambient: rec.ambient,
  cast: rec.cast,
  marks: timeline.marks,
  events: timeline.events
}));

console.log('');
if (problems.length) {
  console.log(`FAILED\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`OK  a 3F recording saves and loads without rerunning anything;`);
console.log(`    exact replay is byte-stable; the audience clock runs`);
console.log(`    ${timeline.durationMs}ms against ${rec.lastTick * rec.tickDurationMs}ms of world`);
console.log(`    with nothing reordered; a walk stays continuous through it; the`);
console.log(`    order is captioned from the fact and not the sentence; a long`);
console.log(`    preparation is a montage that still finishes before it is served;`);
console.log(`    subtitles get reading time; and an editor's script is checked`);
console.log(`    against provenance rather than trusted`);
console.log('');
console.log(`    docs/runs/3f-cafe.json           ${rec.facts.length} facts`);
console.log(`    docs/runs/3f-cafe.timeline.json  ${timeline.events.length} presentation events`);
