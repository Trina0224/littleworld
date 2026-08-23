/**
 * The Activity Runtime: intentions become legal world operations here.
 *
 * An activity is a list of steps. Each tick, every agent advances its current
 * step by one, and the tick in which a step reports 'done' is spent on that
 * step - so a four-step activity takes at least four ticks even if nothing
 * waits. Durations like restTicks are the waiting part only. A step returns 'running', 'done', or 'failed'; a failure drops
 * the rest of the activity and leaves the agent in idle, which is the
 * deterministic fallback the world always has (section 4.1).
 *
 * The runtime never calls out to anything slow. That is the whole point: world
 * time never waits, so this layer only ever does work it can finish inside the
 * tick it started.
 */
import { AVAILABLE } from './resources.js';

const STEPS = {
  /** walk to the resource, then wait for the walk to finish */
  approach: (world, agent, a) => {
    if (world.walking(agent.id)) return 'running';
    if (a.walkStarted) return 'done';
    const r = world.resource(a.target);
    if (!r) return 'failed';
    a.walkStarted = true;
    return world.moveTo(agent.id, r.at) ? 'running' : 'failed';
  },

  reserve: (world, agent, a) => (world.reserve(a.target, agent.id) ? 'done' : 'failed'),

  sit: (world, agent, a) => (world.occupy(a.target, agent.id) ? 'done' : 'failed'),

  rest: (world, agent, a, step) => {
    if (step.until === undefined) step.until = world.tick + a.restTicks;
    return world.tick >= step.until ? 'done' : 'running';
  },

  release: (world, agent, a) => (world.release(a.target, agent.id) ? 'done' : 'failed')
};

/** An activity nobody has to invent: doing nothing, correctly, forever. */
export function idle() {
  return { name: 'idle', steps: [] };
}

/**
 * Claim a seat, walk to it, sit on it for a while, give it back.
 *
 * Reserve comes before approach on purpose. Walking to a seat and only then
 * finding out someone else took it is how agents spend an afternoon crossing a
 * park for nothing; claiming first means a refusal costs one tick.
 */
export function sitAndRest(seatId, restTicks) {
  return {
    name: 'sit_and_rest',
    target: seatId,
    restTicks,
    steps: [{ type: 'reserve' }, { type: 'approach' }, { type: 'sit' },
            { type: 'rest' }, { type: 'release' }]
  };
}

export function createActivityRuntime(world) {
  const log = world.log;

  function assign(agentId, activity) {
    const agent = world.agents.get(agentId);
    if (!agent) return;
    if (agent.activity && agent.activity.name !== 'idle') {
      log.fact(world.tick, 'activity_ended', {
        agent: agentId, activity: agent.activity.name, outcome: 'replaced'
      });
    }
    agent.activity = activity;
    agent.step = 0;
    if (activity.name !== 'idle') {
      log.fact(world.tick, 'activity_started', {
        agent: agentId, activity: activity.name, target: activity.target ?? null
      });
    }
  }

  function finish(agent, outcome) {
    log.fact(world.tick, 'activity_ended', {
      agent: agent.id, activity: agent.activity.name, outcome
    });
    agent.activity = idle();
    agent.step = 0;
  }

  return {
    assign,

    /** advance every agent by one step-tick, in a fixed order */
    tick() {
      for (const id of world.agentIds()) {
        const agent = world.agents.get(id);
        const a = agent.activity;
        if (!a || a.name === 'idle') continue;
        const step = a.steps[agent.step];
        if (!step) {
          finish(agent, 'completed');
          continue;
        }
        const run = STEPS[step.type];
        if (!run) {
          finish(agent, 'unknown_step');
          continue;
        }
        const result = run(world, agent, a, step);
        if (result === 'failed') {
          log.note(world.tick, 'step_failed', { agent: id, activity: a.name, step: step.type });
          // Whatever it already holds must not be leaked - a half-done activity
          // that keeps a reservation forever is how a world runs out of seats.
          const r = a.target ? world.resource(a.target) : null;
          if (r && r.holder === id && r.state !== AVAILABLE) world.release(a.target, id);
          finish(agent, 'failed');
        } else if (result === 'done') {
          agent.step += 1;
          if (agent.step >= a.steps.length) finish(agent, 'completed');
        }
      }
    }
  };
}
