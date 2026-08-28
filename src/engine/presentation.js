/**
 * The audience clock.
 *
 * Implements docs/specs/engine/replay-presentation.md §3 and §6. Simulation
 * ticks say what happened and in what order; presentation milliseconds say when
 * somebody watches it. They are never the same number and this file is the only
 * place allowed to convert between them.
 *
 * The whole design is one idea: build a MONOTONE piecewise-linear map from tick
 * to millisecond, then place everything through it. Monotone means nothing can
 * be reordered by retiming - a serving cannot overtake its own preparation, and
 * a walk cannot arrive before it set off - so §5's causal rules are a property
 * of the mapping rather than a checklist applied afterwards. Piecewise-linear
 * means a walk stays continuous through a compression instead of teleporting,
 * because both of its ends are marks on the same map and everything between is
 * interpolated (§11.5).
 *
 * What varies is only how many milliseconds a stretch of ticks is worth:
 *
 *   nothing is happening      a readable beat, however long the wait really was
 *   somebody is walking       real time, scaled, so it stays legible
 *   something is being made   compressed to a montage, never to nothing
 */
import { visible, orderCaption } from './story.js';

export const DEFAULTS = {
  // A tick is 100ms of world time. Watching a whole afternoon at 1x is not the
  // product, so ordinary time runs faster and interesting time slows down.
  rate: 3,                  // simulation speed for ordinary stretches
  moveRate: 2,              // walking is slower, because it has to be followable
  prepRate: 12,             // making a cup of tea is a montage
  deadMs: [400, 2200],      // a gap with nothing in it: floor and ceiling
  moveMs: [200, 6000],
  prepMs: [600, 4000],
  // Reading time. A subtitle that leaves as fast as it arrived is a subtitle
  // nobody read; a short line still needs a moment to land.
  readMsPerChar: 90,
  readMs: [1200, 7000],
  holdAfterSpeech: 0.55     // how much of a line must be readable before the next
};

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/** How long a line needs to be on screen to have been read. */
export function readingMs(text, cfg = DEFAULTS) {
  return Math.round(clamp([...String(text)].length * cfg.readMsPerChar, cfg.readMs));
}

/**
 * @returns {{ durationMs, marks, events, msAt }}
 *   `marks` is the tick->ms map. `events` are placed presentation entries with
 *   the source provenance §6 requires. `msAt(tick)` is the map itself, which is
 *   what a renderer interpolates a walk through.
 */
export function buildTimeline(story, { config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const tickMs = story.tickDurationMs ?? 100;
  const beats = visible(story);

  // Every tick anything begins or ends at. Sorted, unique: these are the points
  // the map is allowed to bend at, and everything between two of them is linear.
  const anchors = new Set([0]);
  for (const b of beats) {
    anchors.add(b.t);
    if (b.untilT != null) anchors.add(b.untilT);
    for (const s of b.steps ?? []) anchors.add(s.t);
    for (const k of ['startedT', 'readyT', 'servedT', 'clearedT']) {
      if (b[k] != null) anchors.add(b[k]);
    }
  }
  anchors.add(story.lastTick);
  const ticks = [...anchors].sort((a, b) => a - b);

  /** What is going on across [from, to), which decides what the gap is worth. */
  const spanning = (from, to) => {
    let walking = false, making = false;
    for (const b of beats) {
      if (b.kind === 'movement' && b.t <= from && b.untilT >= to) walking = true;
      if (b.kind === 'order' && b.startedT != null && b.readyT != null
          && b.startedT <= from && b.readyT >= to) making = true;
    }
    return { walking, making };
  };

  const byTick = new Map();
  for (const b of beats) {
    if (!byTick.has(b.t)) byTick.set(b.t, []);
    byTick.get(b.t).push(b);
  }

  const marks = [];
  const events = [];
  let ms = 0;
  let speechUntil = 0;         // the earliest a new line may land

  for (let i = 0; i < ticks.length; i += 1) {
    const t = ticks[i];
    marks.push({ t, ms: Math.round(ms) });

    for (const b of byTick.get(t) ?? []) {
      // A line waits for the last one to be readable. This is the only place
      // presentation is allowed to hold time back, and it is why a burst of
      // simulation speech does not become an unreadable flicker (§11.8).
      if (b.kind === 'dialogue' && ms < speechUntil) {
        ms = speechUntil;
        marks[marks.length - 1].ms = Math.round(ms);
      }
      const placed = place(b, Math.round(ms), cfg, story);
      if (placed) {
        events.push(placed);
        if (b.kind === 'dialogue') {
          speechUntil = Math.round(ms) + placed.durationMs * cfg.holdAfterSpeech;
        }
      }
    }

    const next = ticks[i + 1];
    if (next === undefined) break;
    const span = next - t;
    const { walking, making } = spanning(t, next);
    const real = span * tickMs;
    if (walking) ms += clamp(real / cfg.moveRate, cfg.moveMs);
    else if (making) ms += clamp(real / cfg.prepRate, cfg.prepMs);
    else ms += clamp(real / cfg.rate, cfg.deadMs);
  }

  const durationMs = Math.round(ms);

  /** Linear between the two marks either side. Monotone by construction. */
  function msAt(t) {
    if (!marks.length) return 0;
    if (t <= marks[0].t) return marks[0].ms;
    if (t >= marks[marks.length - 1].t) return marks[marks.length - 1].ms;
    let lo = 0, hi = marks.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (marks[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = marks[lo], b = marks[hi];
    if (b.t === a.t) return a.ms;
    return Math.round(a.ms + ((t - a.t) / (b.t - a.t)) * (b.ms - a.ms));
  }

  // Spans are placed through the map rather than measured, so a walk and a
  // preparation both come out of the same compression their neighbours did.
  for (const e of events) {
    if (e.untilT != null) {
      e.durationMs = Math.max(1, msAt(e.untilT) - e.startMs);
      delete e.untilT;
    }
    if (e.kind === 'order') {
      for (const key of ['started', 'ready', 'served', 'cleared']) {
        if (e[`${key}T`] != null) { e[`${key}Ms`] = msAt(e[`${key}T`]); }
        delete e[`${key}T`];
      }
      e.steps = (e.steps ?? []).map((s) => ({ step: s.step, atMs: msAt(s.t) }));
    }
  }

  return { durationMs, tickDurationMs: tickMs, marks, events, msAt };
}

/** One beat, as a presentation entry with provenance (§6). */
function place(b, startMs, cfg, story) {
  const base = { source: b.source, kind: b.kind, startMs };
  switch (b.kind) {
    case 'dialogue':
      return { ...base, speaker: b.speaker, text: b.text,
               durationMs: readingMs(b.text, cfg),
               focus: [b.speaker, ...(b.to ?? [])] };
    case 'movement':
      return { ...base, who: b.who, path: b.path, untilT: b.untilT, durationMs: 0 };
    case 'order':
      return { ...base, order: b.order, customer: b.customer, item: b.item,
               // From the fact, never from the sentence (§8).
               caption: orderCaption(b, story.menu),
               steps: b.steps, untilT: b.untilT, durationMs: 0,
               startedT: b.startedT, readyT: b.readyT,
               servedT: b.servedT, clearedT: b.clearedT,
               focus: [b.customer] };
    case 'arrival':
      return { ...base, who: b.who, at: b.at, durationMs: 0 };
    case 'departure':
      return { ...base, who: b.who, durationMs: 0 };
    case 'animal':
      return { ...base, animal: b.animal, act: b.act, outcome: b.outcome,
               durationMs: cfg.readMs[0], focus: [b.animal, b.to] };
    default:
      return null;
  }
}
