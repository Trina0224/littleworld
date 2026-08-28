/**
 * The seam between conversational opportunities and whoever answers them.
 *
 * Implements docs/specs/engine/phase-3f.md §8. Real provider adapters are 3G;
 * this is the bounded, auditable middle that a mock, the manual harness, or a
 * later adapter all sit behind.
 *
 * The rule that shapes the whole file:
 *
 *   PROVIDER WALL-CLOCK LATENCY IS NOT FICTIONAL TIME.
 *
 * So there is no tick budget anywhere in here. A request stays outstanding for
 * as many simulation ticks as it takes, and nothing in this file will ever turn
 * one into a decline because a counter moved. Infrastructure MAY give up - that
 * is what `drop` and `cancel` are - but only because something outside the
 * fiction said so, and every one of those writes an audit line naming
 * infrastructure as the author. A character choosing `nothing` and a dropped
 * request are indistinguishable in the fact stream; the audit is where they
 * stop being the same thing.
 */

export const DEFAULTS = {
  // How many Brains may be thinking at once, across every floor. The Floor
  // already asks one at a time per zone; this bounds the whole scene.
  maxInFlight: 4,
  // Opportunities worth queueing when everything is busy. An `addressed` turn
  // is somebody owed an answer and is never dropped for load; an `open_floor`
  // or `interject` turn is one the world can do without.
  essential: ['addressed', 'overheard']
};

export function createBrainRuntime(world, floors, { config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const essential = new Set(cfg.essential);
  const inFlight = new Map();     // entityId -> offer
  const waiting = [];             // offers admitted later, in arrival order

  function note(type, offer, extra = {}) {
    world.log.note(world.tick, type, {
      zone: offer.zone, agent: offer.entityId, why: offer.why, ...extra
    });
  }

  function start(offer) {
    inFlight.set(offer.entityId, offer);
    note('brain_dispatched', offer);
    return offer;
  }

  return {
    config: cfg,
    inFlight: () => [...inFlight.values()],
    waiting: () => [...waiting],

    /**
     * Take this tick's offers and decide which may be asked now.
     * @returns the offers to send onward, in the order the Floor produced them.
     */
    admit(offers) {
      const out = [];
      for (const offer of offers) {
        if (inFlight.size < cfg.maxInFlight) { out.push(start(offer)); continue; }
        waiting.push(offer);
        note('brain_queued', offer, { inFlight: inFlight.size });
      }
      return out;
    },

    /** A request came back, whatever it said. Frees the slot and admits a waiter. */
    answered(entityId) {
      if (!inFlight.delete(entityId)) return [];
      const out = [];
      while (waiting.length && inFlight.size < cfg.maxInFlight) {
        const next = waiting.shift();
        // The world may have moved under it while it waited. A floor that no
        // longer holds this offer is not a request to send anywhere.
        if (!floors.floor(next.zone)?.offeredTo.includes(next.entityId)) {
          note('brain_stale', next, { reason: 'the floor moved on while it waited' });
          continue;
        }
        out.push(start(next));
      }
      return out;
    },

    /**
     * Infrastructure gives up on a request: a provider timed out, a budget ran
     * out, an operator cancelled it. NEVER called from a tick - the caller is
     * whatever is outside the fiction, and the reason is theirs to give.
     */
    drop(entityId, reason) {
      const offer = inFlight.get(entityId);
      if (!offer) return false;
      note('brain_dropped', offer, { reason });
      floors.decline(entityId, { by: 'infrastructure', reason });
      this.answered(entityId);
      return true;
    },

    /** The same thing, said the other way: the world invalidated the proposal. */
    cancel(entityId, reason) {
      return this.drop(entityId, reason);
    },

    /** Everything outstanding, given up at once. For a shutdown, not a tick. */
    drain(reason) {
      for (const id of [...inFlight.keys()]) this.drop(id, reason);
      while (waiting.length) {
        const offer = waiting.shift();
        note('brain_dropped', offer, { reason });
        floors.decline(offer.entityId, { by: 'infrastructure', reason });
      }
    }
  };
}
