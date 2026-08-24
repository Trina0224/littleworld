/**
 * The World Engine: the only thing allowed to mutate shared state.
 *
 * Seats and stations are not defined here. docs/specs/world/anchors.json is the
 * single source of truth for their identities and geometry (section 5); this
 * attaches runtime state to them and nothing more.
 */
import { createClock } from './clock.js';
import { createRng } from './rng.js';
import { createRecorder } from './events.js';
import { attends } from './attendance.js';
import { idle } from './activity.js';
import { AVAILABLE, RESERVED, OCCUPIED, SEAT, STATION } from './resources.js';
import { pathLength, pointAlong } from './nav.js';

const round2 = (v) => Math.round(v * 100) / 100;

export function createWorld({ anchors, nav = null, seed = 1, tickDurationMs = 100,
                             ticksPerDay = 0, moveUnitsPerTick = 4 }) {
  // 4 units per tick at 10 ticks a second is about 1.2 m/s where the bench is,
  // which is a walk. Speed is flat in world units for now; making it flat in
  // metres means scaling by the height ramp, and that is a refinement, not a
  // correctness problem.
  const clock = createClock({ tickDurationMs, ticksPerDay });
  const rng = createRng(seed);
  const log = createRecorder();

  // One table. A seat and a station are the same thing to a reservation.
  const resources = new Map();
  for (const s of anchors.seats ?? []) {
    if (!s.seatSurface) continue;
    resources.set(s.id, {
      id: s.id, kind: SEAT, group: s.group,
      at: s.seatSurface.centre, facingDeg: s.facingDeg,
      state: AVAILABLE, holder: null
    });
  }
  for (const st of anchors.stations ?? []) {
    resources.set(st.id, {
      id: st.id, kind: STATION, group: st.type ?? 'station',
      at: st.anchor, facingDeg: st.facingDeg,
      state: AVAILABLE, holder: null
    });
  }

  const agents = new Map();
  const walks = new Map();

  // The roster is who belongs to this world; `here` is who turned up today.
  // Keeping them apart is the whole point: an agent who is not here has not
  // stopped existing, it is somewhere the scene does not show.
  const roster = new Map();
  const here = new Set();

  const world = {
    clock,
    rng,
    log,
    resources,
    agents,

    get tick() {
      return clock.tick;
    },
    get day() {
      return clock.day;
    },

    /** ids in a fixed order - never iterate a Map where order can change a result */
    resourceIds(kind) {
      return [...resources.values()]
        .filter((r) => !kind || r.kind === kind)
        .map((r) => r.id)
        .sort();
    },
    /** every agent the world knows about, present or not */
    agentIds() {
      return [...agents.keys()].sort();
    },
    /** only the ones in the scene right now - what the runtime and movement step */
    presentIds() {
      return [...here].sort();
    },
    present(id) {
      return here.has(id);
    },

    resource(id) {
      return resources.get(id) ?? null;
    },

    start() {
      log.fact(clock.tick, 'world_started', {
        seed,
        tickDurationMs,
        ticksPerDay,
        resources: world.resourceIds().map((id) => {
          const r = resources.get(id);
          return { id: r.id, kind: r.kind, at: r.at, facingDeg: r.facingDeg };
        })
      });
    },

    stop() {
      log.fact(clock.tick, 'world_ended', {});
    },

    spawn(id, at) {
      // Cold start is an invariant of the world, not a courtesy the caller
      // performs. An agent is never observable without an activity, so idle is
      // set here rather than by whoever spawned it (section 4.1).
      const agent = { id, at: [...at], activity: idle(), step: 0, holding: null };
      agents.set(id, agent);
      here.add(id);
      log.fact(clock.tick, 'agent_spawned', { agent: id, at: agent.at });
      return agent;
    },

    /**
     * Declare how often someone turns up, and where they come in.
     *
     * Rostering does not put anyone in the scene. beginDay does that, so that
     * whether an agent is here on day zero is decided by the same rule as every
     * other day rather than by whoever wrote the setup.
     */
    roster(id, { at, every = 1 }) {
      roster.set(id, { at: [...at], every });
    },

    /**
     * Settle who is in the scene for the current day.
     *
     * Call it once at the start, and again whenever the day rolls over -
     * world.advance() does the second part for you.
     */
    beginDay() {
      const day = clock.day;
      log.fact(clock.tick, 'day_started', { day });
      for (const id of [...roster.keys()].sort()) {
        const policy = roster.get(id);
        const wanted = attends(seed, day, id, policy);
        if (wanted === here.has(id)) continue;
        if (wanted) world.arrive(id);
        else world.depart(id);
      }
    },

    /** put a rostered agent into the scene at its entry point */
    arrive(id) {
      const policy = roster.get(id);
      if (!policy || here.has(id)) return false;
      const agent = agents.get(id);
      if (!agent) {
        world.spawn(id, policy.at);
        return true;
      }
      agent.at = [...policy.at];
      agent.activity = idle();
      agent.step = 0;
      here.add(id);
      log.fact(clock.tick, 'agent_arrived', { agent: id, at: agent.at });
      return true;
    },

    /**
     * Take an agent out of the scene.
     *
     * Anything it holds goes back first. A seat still reserved by someone who
     * went home is the same leak a half-finished activity would cause, and the
     * world runs out of seats either way.
     */
    depart(id) {
      const agent = agents.get(id);
      if (!agent || !here.has(id)) return false;
      if (agent.holding) world.release(agent.holding, id);
      walks.delete(id);
      agent.activity = idle();
      agent.step = 0;
      here.delete(id);
      log.fact(clock.tick, 'agent_departed', { agent: id });
      return true;
    },

    /**
     * One tick of world time, and a new day when the count rolls over.
     *
     * The clock still does not own the loop; this is only the one place that
     * knows a day boundary is worth acting on.
     */
    advance() {
      const before = clock.day;
      clock.advance();
      if (clock.day !== before) world.beginDay();
      return clock.tick;
    },

    /**
     * Claim a spot. Atomic in the sense that matters here: only the World
     * Engine may touch seat.state, and it reads and writes it without yielding,
     * so two agents cannot both find the same seat free.
     */
    reserve(resourceId, agentId) {
      const r = resources.get(resourceId);
      if (!r) {
        log.note(clock.tick, 'reservation_refused', {
          resource: resourceId, by: agentId, reason: 'no such resource'
        });
        return false;
      }
      if (r.state !== AVAILABLE) {
        log.note(clock.tick, 'reservation_refused', {
          resource: resourceId, kind: r.kind, by: agentId, reason: r.state, heldBy: r.holder
        });
        return false;
      }
      r.state = RESERVED;
      r.holder = agentId;
      log.fact(clock.tick, 'resource_reserved', { resource: resourceId, kind: r.kind, by: agentId });
      return true;
    },

    occupy(resourceId, agentId) {
      const r = resources.get(resourceId);
      if (!r || r.holder !== agentId || r.state !== RESERVED) return false;
      r.state = OCCUPIED;
      const agent = agents.get(agentId);
      if (agent) {
        agent.holding = resourceId;
        agent.at = [...r.at];
      }
      log.fact(clock.tick, 'resource_occupied', {
        resource: resourceId, kind: r.kind, by: agentId, at: r.at
      });
      return true;
    },

    /**
     * Start walking. The path is solved once, here, and written into the fact
     * that starts the move, so replay follows it without ever pathfinding.
     */
    moveTo(agentId, to) {
      const agent = agents.get(agentId);
      if (!agent) return false;
      if (!nav) {
        log.note(clock.tick, 'move_refused', { agent: agentId, reason: 'no nav grid' });
        return false;
      }
      const path = nav.path(agent.at, to);
      if (!path || path.length < 1) {
        log.note(clock.tick, 'move_refused', { agent: agentId, to, reason: 'no route' });
        return false;
      }
      const length = pathLength(path);
      const ticks = Math.max(1, Math.ceil(length / moveUnitsPerTick));
      walks.set(agentId, { path, length, startTick: clock.tick, arriveTick: clock.tick + ticks });
      log.fact(clock.tick, 'move_started', {
        agent: agentId,
        from: [round2(agent.at[0]), round2(agent.at[1])],
        path: path.map(([x, y]) => [x, y]),
        arriveTick: clock.tick + ticks
      });
      return true;
    },

    walking(agentId) {
      return walks.has(agentId);
    },

    /** advance every walk by one tick; called once per tick before activities */
    stepMovement() {
      for (const id of world.presentIds()) {
        const walk = walks.get(id);
        if (!walk) continue;
        const agent = agents.get(id);
        const span = walk.arriveTick - walk.startTick;
        const t = span <= 0 ? 1 : (clock.tick - walk.startTick) / span;
        if (t >= 1) {
          agent.at = [...walk.path[walk.path.length - 1]];
          walks.delete(id);
          log.fact(clock.tick, 'move_completed', {
            agent: id, at: [round2(agent.at[0]), round2(agent.at[1])]
          });
        } else {
          agent.at = pointAlong(walk.path, walk.length * t);
        }
      }
    },

    release(resourceId, agentId) {
      const r = resources.get(resourceId);
      if (!r || r.holder !== agentId) return false;
      r.state = AVAILABLE;
      r.holder = null;
      const agent = agents.get(agentId);
      if (agent && agent.holding === resourceId) agent.holding = null;
      log.fact(clock.tick, 'resource_released', { resource: resourceId, kind: r.kind, by: agentId });
      return true;
    }
  };
  return world;
}
