/**
 * Presentation state, built from facts alone.
 *
 * This is the only thing a renderer needs, and it is deliberately the same code
 * whether the facts arrive from a running world or from a recording (section
 * 16). A fact carries what a viewer needs - where a move went and how long it
 * took - so nothing here re-derives anything, and the Activity Runtime is not
 * involved.
 */
import { pathLength, pointAlong } from './nav.js';

const round = (v) => Math.round(v * 100) / 100;

export function createView() {
  const agents = new Map();
  const resources = new Map();
  let tick = 0;
  let tickDurationMs = 100;
  let day = 0;
  // How long an utterance stays on screen. Counted in ticks, never in
  // milliseconds, so a bubble expires at the same moment live and in replay.
  const SPEECH_TICKS = 30;

  function place(agent) {
    if (!agent.walk) return;
    const { path, startTick, arriveTick, length } = agent.walk;
    const span = arriveTick - startTick;
    const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (tick - startTick) / span));
    agent.at = pointAlong(path, length * t);
  }

  return {
    get tick() { return tick; },
    get day() { return day; },
    get tickDurationMs() { return tickDurationMs; },

    apply(e) {
      switch (e.type) {
        case 'world_started':
          tickDurationMs = e.tickDurationMs;
          for (const r of e.resources) {
            resources.set(r.id, { ...r, state: 'available', holder: null });
          }
          break;
        case 'agent_spawned':
        case 'agent_arrived':
          agents.set(e.agent, {
            id: e.agent, at: [...e.at], holding: null, walk: null,
            saying: null, responded: null
          });
          break;
        case 'agent_departed':
          // Out of the scene, so out of the snapshot. The roster still knows
          // this agent exists; a renderer is only ever told what to draw.
          agents.delete(e.agent);
          break;
        case 'day_started':
          day = e.day;
          break;
        case 'speech_said': {
          // Who actually heard it is perception's business and is private. What
          // the renderer needs is only that somebody said something out loud.
          const a = agents.get(e.agent);
          if (a) a.saying = { text: e.text, until: e.t + SPEECH_TICKS };
          break;
        }
        case 'animal_responded': {
          // A dog that visibly does not come is as much a thing to draw as one
          // that does, so the outcome is kept either way and expires on a tick.
          const a = agents.get(e.animal);
          if (a) a.responded = { to: e.to, act: e.act, outcome: e.outcome, until: e.t + SPEECH_TICKS };
          break;
        }
        case 'move_started': {
          const a = agents.get(e.agent);
          if (a) a.walk = { path: e.path, startTick: e.t, arriveTick: e.arriveTick, length: pathLength(e.path) };
          break;
        }
        case 'move_completed': {
          const a = agents.get(e.agent);
          if (a) { a.at = [...e.at]; a.walk = null; }
          break;
        }
        case 'resource_reserved': {
          const r = resources.get(e.resource);
          if (r) { r.state = 'reserved'; r.holder = e.by; }
          break;
        }
        case 'resource_occupied': {
          const r = resources.get(e.resource);
          if (r) { r.state = 'occupied'; r.holder = e.by; }
          const a = agents.get(e.by);
          if (a) { a.holding = e.resource; a.at = [...e.at]; a.walk = null; }
          break;
        }
        case 'resource_released': {
          const r = resources.get(e.resource);
          if (r) { r.state = 'available'; r.holder = null; }
          const a = agents.get(e.by);
          if (a && a.holding === e.resource) a.holding = null;
          break;
        }
        default:
          break;                       // activity_started / _ended are not visible
      }
    },

    /** move presentation time to `t`, interpolating anyone mid-walk */
    goto(t) {
      tick = t;
      for (const a of agents.values()) place(a);
    },

    /** what a renderer would draw, and what a test can compare */
    snapshot() {
      return {
        t: tick,
        day,
        agents: [...agents.keys()].sort().map((id) => {
          const a = agents.get(id);
          const said = a.saying && tick < a.saying.until ? a.saying.text : null;
          const reply = a.responded && tick < a.responded.until
            ? { act: a.responded.act, outcome: a.responded.outcome } : null;
          return {
            id, at: [round(a.at[0]), round(a.at[1])],
            holding: a.holding, walking: !!a.walk, saying: said,
            ...(reply ? { responded: reply } : {})
          };
        }),
        resources: [...resources.keys()].sort().map((id) => {
          const r = resources.get(id);
          return { id, state: r.state, holder: r.holder };
        })
      };
    }
  };
}

/** Drive a view over a whole recording, one tick at a time. */
export function replay(recording, { onTick } = {}) {
  const view = createView();
  const facts = recording.facts;
  const last = facts.length ? facts[facts.length - 1].t : 0;
  let i = 0;
  for (let t = 0; t <= last; t += 1) {
    while (i < facts.length && facts[i].t === t) view.apply(facts[i++]);
    view.goto(t);
    if (onTick) onTick(view.snapshot());
  }
  return view;
}
