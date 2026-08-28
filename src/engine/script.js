/**
 * Checking an editor's script against the recording it claims to come from.
 *
 * Implements docs/specs/engine/replay-presentation.md §5 and §11.11. The spec's
 * own instruction is the design:
 *
 *   PREFER PROVENANCE AND VALIDATION OVER A GIANT PROMPT SAYING "BE FAITHFUL".
 *
 * So an editorial pass may rewrite a line, cut a dull stretch, and retime the
 * whole thing - §4 allows all of that - and what it may not do is claim a
 * history the facts do not support. Every entry that is not marked editorial has
 * to point at committed facts, and what it says about those facts has to be what
 * they say. A line whose speaker is not the speaker of the fact it cites is not
 * a cleaned line; it is a different story.
 *
 * This validates. It does not call anything: no provider, no model, no network.
 */

/** @returns {{ ok, problems }} - problems are strings, in script order. */
export function validateScript(script, recording) {
  const problems = [];
  const facts = recording.facts;
  const entries = script?.events;
  if (!Array.isArray(entries)) return { ok: false, problems: ['a script with no events'] };

  const at = (i) => (Number.isInteger(i) && i >= 0 && i < facts.length ? facts[i] : null);
  const say = (n, msg) => problems.push(`#${n} ${msg}`);

  let lastMs = -1;
  let lastSourceTick = -1;

  entries.forEach((e, n) => {
    // --- it has to be placed, and placed after the entry before it ----------
    if (!Number.isFinite(e.startMs) || e.startMs < 0) { say(n, 'has no start time'); return; }
    if (e.startMs < lastMs) say(n, `starts at ${e.startMs}ms, before the entry above it`);
    lastMs = Math.max(lastMs, e.startMs);

    // --- editorial captions are allowed, and must say that is what they are -
    const src = e.source ?? [];
    if (e.editorial) {
      if (src.length) say(n, 'is marked editorial and still claims committed facts');
      return;
    }
    if (!Array.isArray(src) || !src.length) {
      say(n, 'derives from the recording and cites no fact');
      return;
    }
    const cited = src.map(at);
    if (cited.some((f) => !f)) { say(n, 'cites a fact index that does not exist'); return; }

    // --- causal order is the recording's order (§5) -------------------------
    const first = Math.min(...cited.map((f) => f.t));
    if (first < lastSourceTick) {
      say(n, `is built from tick ${first}, behind the entry above it at ${lastSourceTick}`);
    }
    lastSourceTick = Math.max(lastSourceTick, first);

    // --- and what it says about them has to be what they say ---------------
    switch (e.kind) {
      case 'dialogue': {
        const spoken = cited.filter((f) => f.type === 'speech_said');
        if (!spoken.length) { say(n, 'is dialogue and cites no utterance'); break; }
        if (!spoken.some((f) => f.agent === e.speaker)) {
          say(n, `puts the line in ${e.speaker}'s mouth; the fact says ${spoken[0].agent}`);
        }
        if (typeof e.text !== 'string' || !e.text.trim()) say(n, 'is dialogue with no words');
        break;
      }
      case 'order': {
        const placed = cited.find((f) => f.type === 'order_placed');
        if (!placed) { say(n, 'is an order and cites no order_placed'); break; }
        if (e.customer && e.customer !== placed.customer) {
          say(n, `gives the order to ${e.customer}; it was ${placed.customer}'s`);
        }
        if (e.item && e.item !== placed.item) {
          say(n, `says ${e.item} was ordered; the fact says ${placed.item}`);
        }
        // Serving cannot be shown before the thing was made (§11.7).
        if (e.servedMs != null && e.readyMs != null && e.servedMs < e.readyMs) {
          say(n, 'serves the order before it is ready');
        }
        break;
      }
      case 'movement':
      case 'arrival':
      case 'departure': {
        const who = cited.find((f) => f.agent === e.who);
        if (!who) say(n, `says ${e.who} moved; no cited fact is theirs`);
        break;
      }
      default:
        break;
    }
  });

  // --- nothing may be invented, and nothing private may leak ---------------
  const kinds = new Set(entries.filter((e) => !e.editorial).map((e) => e.kind));
  if (kinds.has('order') && !facts.some((f) => f.type === 'order_placed')) {
    problems.push('the script shows an order and the recording has none');
  }
  if (recording.private === false && script.usedAudit) {
    problems.push('the script says it used private audit that this recording does not carry');
  }

  return { ok: problems.length === 0, problems };
}

/**
 * The other half of §11.12: the same recording, two ways, and a statement of
 * what differs. Not "they must match" - they must not, that is the point - but
 * "the difference is presentation, and here it is".
 */
export function compareModes(exactFrames, timeline) {
  const spoke = new Set();
  for (const f of exactFrames) {
    for (const a of f.agents) if (a.saying) spoke.add(`${a.id}|${a.saying}`);
  }
  const scripted = new Set(
    timeline.events.filter((e) => e.kind === 'dialogue').map((e) => `${e.speaker}|${e.text}`)
  );
  return {
    exactTicks: exactFrames.length,
    audienceMs: timeline.durationMs,
    linesInExact: spoke.size,
    linesInAudience: scripted.size,
    // Every line the audience hears was said by the person the recording says
    // said it. A line here would be one Replay made up.
    invented: [...scripted].filter((k) => !spoke.has(k)),
    // Lines the edit left out. Allowed by §4; listed so it is a choice.
    omitted: [...spoke].filter((k) => !scripted.has(k))
  };
}
