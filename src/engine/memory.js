/**
 * Private memory: what one character remembers about what it has perceived.
 *
 * Implements docs/specs/engine/phase-3d-memory.md. It accumulates and it does
 * not decide - whether two characters are now friends is a judgement, and the
 * judgement belongs to the Brain reading its own memory, not to a number the
 * engine computed.
 *
 * Five things carry the design.
 *
 * `knows` IS MEMORY THAT EXISTED BEFORE TICK ZERO. The seeded knowledge from 3B
 * is not a second mechanism consulted alongside this one; it is the first entry
 * in the store. That is what stops there ever being two answers to "does this
 * character know that one". A seeded model has no first-met tick, because a
 * grandmother has always known the girl from the shop.
 *
 * THE ENGINE WRITES ENCOUNTERS; THE BRAIN WRITES MEANING. Presence, proximity
 * and whether words were exchanged are recorded deterministically every tick.
 * Prose and learned labels arrive as proposals. So when a provider is down,
 * recognition keeps working and encounters keep counting - only the
 * interpretation is missing. The world does not stop being a world.
 *
 * A LABEL BELONGS TO THE OBSERVER. What the brothers call the shopkeeper is
 * theirs; her name is hers. Nothing here reads a target's own files, and 3B made
 * that structurally hard by accident worth keeping: character.json has no name
 * field, so a label can only come from the observer's own `knows` or from
 * something heard in the world.
 *
 * ASYMMETRY IS FREE AND STAYS FREE. Memory is per observer, so the grandmother
 * calling her granddaughter 孫女 while the granddaughter calls her おばあちゃん
 * needs no mechanism. Nothing reconciles two stores, ever - two people
 * remembering the same evening differently is what this cast is for.
 *
 * LENGTH IS A PER-CALL COST. self.md is a cached prefix at 0.1x; memory is the
 * dynamic suffix, re-sent uncached on every request. A long memory is expensive
 * in a way a long self sheet is not, which is why episodes are bounded and
 * evicted deterministically.
 */

export const DEFAULTS = {
  episodeLimit: 24,          // per observer; the dynamic suffix is what costs
  nearTicks: 1,              // an encounter needs the two to be perceptible now
  encounterCooldown: 60      // don't count the same continuous meeting repeatedly
};

/** Salience for what is worth keeping when the episode budget is full. */
const KEEP = {
  direct_address: 100,
  speech_heard: 80,
  own_action_failed: 55,
  own_activity_changed: 40,
  nearby_world_event: 35,
  first_meeting: 90,
  note: 70                    // something the Brain chose to remember
};

export function createMemory(world, { seeds = new Map(), config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };

  // observerId -> Map(entityId -> person model). Never merged across observers.
  const people = new Map();
  // observerId -> episodes, oldest first
  const episodes = new Map();
  let seen = 0;                                  // perception events consumed

  function store(observerId) {
    if (!people.has(observerId)) people.set(observerId, new Map());
    return people.get(observerId);
  }

  /**
   * Seed from `knows`. This is not "loading defaults" - it is the memory the
   * character starts the world already holding.
   */
  for (const [observerId, entries] of seeds) {
    const m = store(observerId);
    for (const { who, as } of entries) {
      m.set(who, {
        entityId: who,
        label: as,
        encounters: 0,
        lastSeenTick: null,
        firstMetTick: null,                      // seeded knowledge has no first time
        seeded: true
      });
    }
  }

  function remember(observerId, episode) {
    const list = episodes.get(observerId) ?? [];
    list.push(episode);
    if (list.length > cfg.episodeLimit) {
      // Deterministic: drop the lowest-value episode, oldest first among equals.
      // No clock, no rng - the same state always keeps the same survivors.
      let worst = 0;
      for (let i = 1; i < list.length; i += 1) {
        const a = (KEEP[list[i].kind] ?? 10) * 1000 + list[i].tick;
        const b = (KEEP[list[worst].kind] ?? 10) * 1000 + list[worst].tick;
        if (a < b) worst = i;
      }
      list.splice(worst, 1);
    }
    episodes.set(observerId, list);
    // Private, so not a fact. Audit is already the stream for why, and the
    // renderer may not read it - which is exactly the property wanted here.
    world.log.note(world.tick, 'memory_written', {
      agent: observerId, kind: episode.kind, about: episode.entityId ?? null
    });
  }

  function touch(observerId, entityId, tick) {
    const m = store(observerId);
    let p = m.get(entityId);
    if (!p) {
      p = {
        entityId, label: null, encounters: 0,
        lastSeenTick: null, firstMetTick: tick, seeded: false
      };
      m.set(entityId, p);
      remember(observerId, { tick, kind: 'first_meeting', entityId, gist: 'met for the first time' });
    }
    const fresh = p.lastSeenTick === null || (tick - p.lastSeenTick) > cfg.encounterCooldown;
    if (fresh) p.encounters += 1;
    p.lastSeenTick = tick;
    return p;
  }

  return {
    config: cfg,

    /**
     * Deterministic half. Consumes what perception has queued and records that
     * these people were here and what passed between them. No Brain involved,
     * which is the point: this keeps running when inference does not.
     */
    tick(perception) {
      for (const observerId of world.presentIds()) {
        // Encounters from what is perceptible right now.
        for (const v of perception.sensoryState(observerId).visible) {
          if (v.distance > perception.config.nearRange) continue;
          touch(observerId, v.entityId, world.tick);
        }
      }
      // And from what was heard, which reaches further than "near".
      for (const observerId of world.presentIds()) {
        for (const e of perception.pendingFor(observerId).slice(seen)) {
          if (!e.entityId || e.entityId === observerId) continue;
          if (e.kind !== 'speech_heard' && e.kind !== 'direct_address') continue;
          touch(observerId, e.entityId, e.t);
          remember(observerId, {
            tick: e.t, kind: e.kind, entityId: e.entityId,
            gist: e.text ?? null
          });
        }
      }
      seen = 0;                                  // pendingFor is drained by delivery
    },

    /** @returns the observer's model of one entity, or null */
    recall(observerId, entityId) {
      const p = people.get(observerId)?.get(entityId) ?? null;
      return p ? { ...p } : null;
    },

    knownTo(observerId) {
      return [...(people.get(observerId)?.keys() ?? [])].sort();
    },

    episodesFor(observerId) {
      return (episodes.get(observerId) ?? []).slice();
    },

    /**
     * The Brain's half. Both take entity ids, because the caller canonicalized
     * the reply before committing it - a ref must never reach storage
     * (clarifications 1.1a).
     */
    note(observerId, entityId, text) {
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      touch(observerId, entityId, world.tick);
      remember(observerId, { tick: world.tick, kind: 'note', entityId, gist: text });
    },

    /**
     * Learn what to call someone.
     *
     * The label is the observer's, always. Nothing here consults the target's
     * files, and there is nothing to consult: character.json carries no name.
     */
    learnLabel(observerId, entityId, label) {
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      const p = touch(observerId, entityId, world.tick);
      p.label = label;
      world.log.note(world.tick, 'label_learned', { agent: observerId, about: entityId });
      return p;
    },

    /**
     * The salience provider phase 3C left empty.
     *
     * A number, never a name. Returning a label here would make perception
     * perform recognition, which is the one thing it may not do.
     */
    attentionHint(observerId, entityId) {
      const p = people.get(observerId)?.get(entityId);
      if (!p) return 0;
      return p.label ? 12 : 6;
    }
  };
}

/**
 * Compose what a Brain actually receives: sanitized perception, plus this
 * observer's own recognition of the people in it.
 *
 * Recognition is added HERE and not in perception, because perception may not
 * know who anyone is (phase-3c-perception.md 5). The join runs server-side on
 * the entity behind each ref, and the model still never sees an id.
 */
export function buildContext(perception, memory, observerId) {
  const ctx = perception.contextFor(observerId);
  for (const v of ctx.forModel.sensoryState.visible) {
    const p = memory.recall(observerId, ctx.refs.get(v.ref));
    if (!p) continue;                            // a stranger stays a stranger
    v.recognised = true;
    if (p.label) v.youCallThem = p.label;
    if (p.encounters > 0) v.timesMet = p.encounters;
  }
  ctx.forModel.memory = memory.episodesFor(observerId)
    .slice(-8)
    .map((e) => ({ kind: e.kind, gist: e.gist }))
    .filter((e) => e.gist);
  return ctx;
}
