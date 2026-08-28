/**
 * A recording, read as a story rather than as a log.
 *
 * Implements docs/specs/engine/replay-presentation.md §2 (the normalizer) and
 * §8 (the 3F facts Replay has to learn to present).
 *
 * Two things it does that a fact list does not:
 *
 * IT JOINS A SPAN. `order_placed` … `order_cleared` is one thing that happened
 * to one person, not six unrelated lines, and a montage cannot be built out of
 * events that do not know they belong together.
 *
 * IT CARRIES PROVENANCE. Every beat says which committed facts it came from, by
 * index. That is what lets §5 be checked rather than asked for politely: an
 * editor's script either points at facts that exist and say what it claims, or
 * it does not.
 *
 * What it does NOT do is read prose. §8 is explicit: a structured order is
 * authoritative even when the sentence never says the item, so the beat is built
 * from `order_placed` and the dialogue is left as the dialogue.
 */

/** Facts a viewer would never see happening. Kept, marked, not drawn. */
const UNSEEN = new Set(['venue_obligation', 'ambient_set', 'activity_started', 'activity_ended']);

export function extractStory(recording) {
  const facts = recording.facts;
  const beats = [];
  const orders = new Map();          // orderId -> the beat being assembled
  const walks = new Map();           // agentId -> the movement beat in progress

  const push = (beat) => { beats.push(beat); return beat; };

  facts.forEach((e, i) => {
    switch (e.type) {
      case 'ambient_set':
        push({ source: [i], t: e.t, kind: 'ambient', visible: false,
               daypart: e.daypart, weatherType: e.weatherType,
               ambientTempC: e.ambientTempC, feltCondition: e.feltCondition ?? null });
        break;

      case 'agent_spawned':
      case 'agent_arrived':
        push({ source: [i], t: e.t, kind: 'arrival', who: e.agent, at: e.at });
        break;

      case 'agent_departed':
        push({ source: [i], t: e.t, kind: 'departure', who: e.agent });
        break;

      case 'speech_said':
        push({ source: [i], t: e.t, kind: 'dialogue', speaker: e.agent,
               text: e.text, to: e.to ?? [], scope: e.scope });
        break;

      case 'animal_responded':
        push({ source: [i], t: e.t, kind: 'animal', animal: e.animal,
               act: e.act, to: e.to, outcome: e.outcome });
        break;

      // --- one walk, not a start and an end -------------------------------
      case 'move_started':
        walks.set(e.agent, push({
          source: [i], t: e.t, kind: 'movement', who: e.agent,
          from: e.from, path: e.path, untilT: e.arriveTick, arrived: false
        }));
        break;
      case 'move_completed': {
        const walk = walks.get(e.agent);
        if (walk) {
          walk.source.push(i);
          walk.untilT = e.t;
          walk.to = e.at;
          walk.arrived = true;
          walks.delete(e.agent);
        }
        break;
      }

      // --- one order, from asking to the cup being taken away --------------
      case 'order_placed':
        orders.set(e.order, push({
          source: [i], t: e.t, kind: 'order', order: e.order,
          customer: e.customer, item: e.item, name: e.name, price: e.price,
          steps: [], startedT: null, readyT: null, servedT: null, clearedT: null,
          untilT: e.t
        }));
        break;
      case 'preparation_started': {
        const o = orders.get(e.order);
        if (o) { o.source.push(i); o.startedT = e.t; o.untilT = e.t; }
        break;
      }
      case 'preparation_step': {
        const o = orders.get(e.order);
        if (o) { o.source.push(i); o.steps.push({ t: e.t, step: e.step }); o.untilT = e.t; }
        break;
      }
      case 'order_ready': {
        const o = orders.get(e.order);
        if (o) { o.source.push(i); o.readyT = e.t; o.untilT = e.t; }
        break;
      }
      case 'order_served': {
        const o = orders.get(e.order);
        if (o) { o.source.push(i); o.servedT = e.t; o.untilT = e.t; }
        break;
      }
      case 'order_cleared': {
        const o = orders.get(e.order);
        if (o) { o.source.push(i); o.clearedT = e.t; o.untilT = e.t; }
        break;
      }

      case 'venue_obligation':
        push({ source: [i], t: e.t, kind: 'obligation', visible: false,
               who: e.customer, state: e.state });
        break;

      default:
        if (!UNSEEN.has(e.type)) break;   // world_started, resources, day_started
        break;
    }
  });

  // A walk with no arrival ran off the end of the recording. Say so rather than
  // leaving a span whose end is a tick that never came.
  for (const walk of walks.values()) walk.untilT = recording.lastTick ?? walk.t;

  return {
    seed: recording.seed,
    lastTick: recording.lastTick ?? (facts.length ? facts[facts.length - 1].t : 0),
    tickDurationMs: recording.tickDurationMs ?? 100,
    ambient: recording.ambient ?? null,
    menu: recording.menu ?? null,
    cast: recording.cast ?? null,
    beats
  };
}

/** The beats a viewer could actually see. */
export const visible = (story) => story.beats.filter((b) => b.visible !== false);

/**
 * What was ordered, said in words, from the authoritative fact rather than from
 * the sentence. §8: 「煎茶をひとつ」 may never have been spoken and the tea still
 * has to be explicable.
 */
export function orderCaption(beat, menu = null) {
  const named = menu?.items?.find((i) => i.id === beat.item);
  return `${named?.name ?? beat.name ?? beat.item}`;
}
