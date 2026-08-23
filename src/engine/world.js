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

export const SEAT_AVAILABLE = 'available';
export const SEAT_RESERVED = 'reserved';
export const SEAT_OCCUPIED = 'occupied';

export function createWorld({ anchors, seed = 1, tickDurationMs = 100 }) {
  const clock = createClock({ tickDurationMs });
  const rng = createRng(seed);
  const log = createRecorder();

  const seats = new Map();
  for (const s of anchors.seats ?? []) {
    if (!s.seatSurface) continue;
    seats.set(s.id, {
      id: s.id,
      group: s.group,
      at: s.seatSurface.centre,
      facingDeg: s.facingDeg,
      state: SEAT_AVAILABLE,
      holder: null
    });
  }
  const stations = new Map();
  for (const st of anchors.stations ?? []) {
    stations.set(st.id, {
      id: st.id,
      at: st.anchor,
      facingDeg: st.facingDeg,
      state: SEAT_AVAILABLE,
      holder: null
    });
  }

  const agents = new Map();

  const world = {
    clock,
    rng,
    log,
    seats,
    stations,
    agents,

    get tick() {
      return clock.tick;
    },

    /** ids in a fixed order - never iterate a Map where order can change a result */
    seatIds() {
      return [...seats.keys()].sort();
    },
    agentIds() {
      return [...agents.keys()].sort();
    },

    spot(id) {
      return seats.get(id) ?? stations.get(id) ?? null;
    },

    start() {
      log.fact(clock.tick, 'world_started', {
        seed,
        tickDurationMs,
        seats: world.seatIds(),
        stations: [...stations.keys()].sort()
      });
    },

    spawn(id, at) {
      // Cold start: an agent exists holding a deterministic activity from its
      // first tick. There is no state in which it exists with nothing to do.
      const agent = { id, at: [...at], activity: null, seat: null };
      agents.set(id, agent);
      log.fact(clock.tick, 'agent_spawned', { agent: id, at: agent.at });
      return agent;
    },

    /**
     * Claim a spot. Atomic in the sense that matters here: only the World
     * Engine may touch seat.state, and it reads and writes it without yielding,
     * so two agents cannot both find the same seat free.
     */
    reserve(spotId, agentId) {
      const spot = world.spot(spotId);
      if (!spot) {
        log.note(clock.tick, 'reservation_refused', { spot: spotId, by: agentId, reason: 'no such spot' });
        return false;
      }
      if (spot.state !== SEAT_AVAILABLE) {
        log.note(clock.tick, 'reservation_refused', {
          spot: spotId, by: agentId, reason: spot.state, heldBy: spot.holder
        });
        return false;
      }
      spot.state = SEAT_RESERVED;
      spot.holder = agentId;
      log.fact(clock.tick, 'seat_reserved', { seat: spotId, by: agentId });
      return true;
    },

    occupy(spotId, agentId) {
      const spot = world.spot(spotId);
      if (!spot || spot.holder !== agentId || spot.state !== SEAT_RESERVED) return false;
      spot.state = SEAT_OCCUPIED;
      const agent = agents.get(agentId);
      if (agent) {
        agent.seat = spotId;
        agent.at = [...spot.at];
      }
      log.fact(clock.tick, 'seat_occupied', { seat: spotId, by: agentId, at: spot.at });
      return true;
    },

    release(spotId, agentId) {
      const spot = world.spot(spotId);
      if (!spot || spot.holder !== agentId) return false;
      spot.state = SEAT_AVAILABLE;
      spot.holder = null;
      const agent = agents.get(agentId);
      if (agent && agent.seat === spotId) agent.seat = null;
      log.fact(clock.tick, 'seat_released', { seat: spotId, by: agentId });
      return true;
    }
  };
  return world;
}
