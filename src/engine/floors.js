/**
 * One offered conversational floor per zone.
 *
 * Implements docs/specs/engine/phase-3e-implementation-structure.md and the two
 * clarification files. This step is the store only: qualification, creation and
 * destruction, and ingestion of committed speech. Offer rounds are 3E-4.
 */

export const DEFAULTS = {
  transcriptWindow: 12,
  // How long an unanswered heard address keeps its target's zone qualified.
  // A guess until one scripted run has been looked at.
  addressExpiry: 200
};

export function createFloors(world, zones, { minds, config = {} } = {}) {
  if (minds === undefined) {
    throw new Error('createFloors needs an explicit `minds` set: who can hold a floor');
  }

  const cfg = { ...DEFAULTS, ...config };
  const llm = new Set(minds);
  const floors = new Map();          // zoneId -> Floor
  const spoken = new Map();          // zoneId -> indices into world.log.facts
  const pendingAddress = new Map();  // entityId -> { tick, from, zone }
  const spent = new Set();           // `${observer}|${sourceZone}|${sourceSpell}`
  let spell = 0;
  let factCursor = 0;

  function zoneOf(entityId) {
    const a = world.agents.get(entityId);
    return a && world.present(entityId) ? zones.at(a.at[0], a.at[1]) : null;
  }

  function occupants(zoneId) {
    return world.presentIds().filter((id) => zoneOf(id) === zoneId);
  }

  /**
   * Three clauses today; the overheard-nudge clause arrives with the nudge
   * itself in 3E-4 (floor-clarifications 10.3).
   */
  function qualifies(zoneId) {
    const here = occupants(zoneId);
    const heads = here.filter((id) => llm.has(id));
    if (heads.length >= 2) return true;
    if (heads.length === 0) return false;
    if (here.length > heads.length) return true;          // an addressable animal
    return pendingAddress.has(heads[0]);                  // clarifications 9.3
  }

  function open(zoneId) {
    spell += 1;
    floors.set(zoneId, {
      zone: zoneId,
      socialSpell: spell,
      lastSpeechTick: null,
      lastSpeaker: null,
      addressed: null
    });
    world.log.note(world.tick, 'floor_opened', { zone: zoneId, spell });
  }

  function close(zoneId) {
    floors.delete(zoneId);
    world.log.note(world.tick, 'floor_closed', { zone: zoneId });
  }

  function requalify() {
    for (const zoneId of zones.ids) {
      const wanted = qualifies(zoneId);
      if (wanted === floors.has(zoneId)) continue;
      if (wanted) open(zoneId);
      else close(zoneId);
    }
  }

  /** A heard address gives its target's own zone something to answer with. */
  function registerAddress(e) {
    if (!e.to || !e.heardBy.includes(e.to) || !llm.has(e.to)) return;
    pendingAddress.set(e.to, { tick: e.t, from: e.agent, zone: e.zone ?? null });
  }

  function record(e, index) {
    if (!e.zone) return;                                  // outside every zone
    const list = spoken.get(e.zone) ?? [];
    list.push(index);
    spoken.set(e.zone, list);
    const f = floors.get(e.zone);
    if (!f) return;
    f.lastSpeechTick = e.t;
    f.lastSpeaker = e.agent;
    f.addressed = e.to && e.heardBy.includes(e.to) ? e.to : null;
  }

  const view = (f) => ({ ...f });

  return {
    config: cfg,

    /** Stage 8 of the canonical tick. */
    tick() {
      for (const [id, a] of [...pendingAddress.entries()].sort()) {
        if (world.tick - a.tick > cfg.addressExpiry) pendingAddress.delete(id);
      }

      const facts = world.log.facts;
      const fresh = [];
      for (; factCursor < facts.length; factCursor += 1) {
        const e = facts[factCursor];
        if (e.type !== 'speech_said') continue;
        if (!Array.isArray(e.heardBy)) throw new Error('a speech fact carries no heardBy');
        fresh.push([e, factCursor]);
      }

      // Addresses first: one of them may be the reason a zone qualifies at all.
      for (const [e] of fresh) registerAddress(e);
      requalify();
      for (const [e, i] of fresh) record(e, i);
    },

    /** Every open floor, in sorted zone order. */
    all() {
      return zones.ids.filter((z) => floors.has(z)).map((z) => view(floors.get(z)));
    },

    floor(zoneId) {
      const f = floors.get(zoneId);
      return f ? view(f) : null;
    },

    /** The floor this actor is standing on, or null. */
    floorFor(entityId) {
      return this.floor(zoneOf(entityId));
    },

    /**
     * The zone's recent utterances, newest last. Derived from the fact stream on
     * every call, so there is no cache to go stale when a floor is destroyed and
     * opened again (clarifications 2).
     */
    transcript(zoneId, limit = cfg.transcriptWindow) {
      const facts = world.log.facts;
      return (spoken.get(zoneId) ?? []).slice(-limit).map((i) => {
        const e = facts[i];
        return {
          tick: e.t, speaker: e.agent, text: e.text, scope: e.scope,
          addressed: e.to ?? null, heardBy: e.heardBy
        };
      });
    },

    pendingAddressFor(entityId) {
      return pendingAddress.get(entityId) ?? null;
    },

    clearAddress(entityId) {
      return pendingAddress.delete(entityId);
    },

    /**
     * An overheard nudge is spent against the SOURCE zone's social spell, never
     * against the lifetime of the target's temporary floor
     * (pre-floor-corrections 2.1). The target floor may be created and destroyed
     * any number of times without erasing this.
     */
    spendNudge(observerId, sourceZone) {
      const f = floors.get(sourceZone);
      if (!f) return false;
      spent.add(`${observerId}|${sourceZone}|${f.socialSpell}`);
      return true;
    },

    nudgeSpent(observerId, sourceZone) {
      const f = floors.get(sourceZone);
      if (!f) return false;
      return spent.has(`${observerId}|${sourceZone}|${f.socialSpell}`);
    },

    /** Throw the working state away and rebuild it from the committed facts. */
    rebuild() {
      floors.clear();
      spoken.clear();
      pendingAddress.clear();
      factCursor = 0;
      this.tick();
    }
  };
}
