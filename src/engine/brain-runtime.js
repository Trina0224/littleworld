/**
 * The seam between conversational opportunities and whoever answers them.
 *
 * Implements docs/specs/engine/phase-3f.md §8. Real provider adapters are 3G;
 * this is the bounded, auditable middle that a mock, the manual harness, or a
 * later adapter all sit behind.
 *
 * PROVIDER WALL-CLOCK LATENCY IS NOT FICTIONAL TIME.
 *
 * There is deliberately no tick budget here. A request stays outstanding for
 * as many simulation ticks as it takes. Infrastructure may explicitly drop or
 * cancel a request, but that decision comes from outside the fiction and is
 * recorded in audit; elapsed simulation ticks never fabricate social silence.
 *
 * Phase 3F also deliberately does NOT implement automatic load shedding. Earlier
 * code exposed an `essential` classification that was never used. That false
 * policy surface is removed. Until real provider limits are known in Phase 3G,
 * every valid opportunity queues when global concurrency is full. If a future
 * provider needs pressure-based dropping, it must be an explicit, tested policy
 * with an auditable reason rather than a dormant config knob.
 */

export const DEFAULTS = {
  // How many Brains may be thinking at once, across every floor. The Floor
  // already asks one at a time per zone; this bounds the whole scene.
  maxInFlight: 4
};

export function createBrainRuntime(world, floors, { config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
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
     * When concurrency is full the offer is queued; Phase 3F performs no
     * automatic priority/drop policy.
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
     * out, or an operator cancelled it. NEVER called from a simulation tick.
     */
    drop(entityId, reason) {
      const offer = inFlight.get(entityId);
      if (!offer) return false;
      note('brain_dropped', offer, { reason });
      floors.decline(entityId, { by: 'infrastructure', reason });
      this.answered(entityId);
      return true;
    },

    /** The world/provider invalidated a proposal explicitly. */
    cancel(entityId, reason) {
      return this.drop(entityId, reason);
    },

    /** Everything outstanding, given up at once. For shutdown, not a tick. */
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
