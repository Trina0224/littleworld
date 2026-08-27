/**
 * Private memory: what one character remembers about what it has perceived.
 *
 * Implements docs/specs/engine/phase-3d-memory.md. The engine records structural
 * contact; the Brain writes interpretation. A person model may exist before the
 * observer has actually met that entity, so "known" and "met" are deliberately
 * separate states.
 */

export const DEFAULTS = {
  episodeLimit: 24,
  separationTicks: 60
};

/** A landed directed utterance is an exchange; passive overhearing is not. */
const EXCHANGED = new Set(['direct_address', 'own_speech_directed']);

/** Salience used only when the bounded episode list must evict something. */
const KEEP = {
  direct_address: 100,
  speech_heard: 80,
  own_action_failed: 55,
  own_activity_changed: 40,
  nearby_world_event: 35,
  first_meeting: 90,
  note: 70
};

export function createMemory(world, { seeds = new Map(), minds, config = {} } = {}) {
  if (minds === undefined) {
    throw new Error('createMemory needs an explicit `minds` set: who has a memory at all');
  }

  const cfg = { ...DEFAULTS, ...config };
  const enabled = new Set(minds);
  const people = new Map();          // observerId -> Map(entityId -> person model)
  const episodes = new Map();        // observerId -> bounded private episodes
  const consumed = new Map();        // observerId -> highest perception seq ingested

  const isMind = (observerId) => enabled.has(observerId);

  function store(observerId) {
    if (!people.has(observerId)) people.set(observerId, new Map());
    return people.get(observerId);
  }

  function newPerson(entityId, { label = null, seeded = false } = {}) {
    return {
      entityId,
      label,
      encounters: 0,
      spokenWith: 0,
      lastSeenTick: null,
      // A person model can exist because of authored knowledge or a Brain
      // inference. Neither is a meeting. Only observe() may fill firstMetTick.
      firstMetTick: null,
      seeded,
      open: false,
      spoke: false
    };
  }

  // `knows` is memory that existed before tick zero, not a second database.
  for (const [observerId, entries] of seeds) {
    if (!isMind(observerId)) {
      throw new Error(`${observerId} was seeded with knowledge but has no memory`);
    }
    const m = store(observerId);
    for (const { who, as } of entries) {
      m.set(who, newPerson(who, { label: as, seeded: true }));
    }
  }

  function remember(observerId, episode) {
    const list = episodes.get(observerId) ?? [];
    list.push(episode);
    if (list.length > cfg.episodeLimit) {
      let worst = 0;
      for (let i = 1; i < list.length; i += 1) {
        const a = (KEEP[list[i].kind] ?? 10) * 1000 + list[i].tick;
        const b = (KEEP[list[worst].kind] ?? 10) * 1000 + list[worst].tick;
        if (a < b) worst = i;
      }
      list.splice(worst, 1);
    }
    episodes.set(observerId, list);
    world.log.note(world.tick, 'memory_written', {
      agent: observerId,
      kind: episode.kind,
      about: episode.entityId ?? null
    });
  }

  /**
   * Ensure that the observer has a model of this entity.
   *
   * Load-bearing rule: this function NEVER claims a meeting happened. note()
   * and learnLabel() are allowed to create "known but not met" models. A real
   * encounter is opened only by observe().
   */
  function ensure(observerId, entityId) {
    const m = store(observerId);
    let p = m.get(entityId);
    if (!p) {
      p = newPerson(entityId);
      m.set(entityId, p);
    }
    return p;
  }

  /** Record the first real in-world meeting, and only the first one. */
  function recordFirstMeeting(observerId, p, tick) {
    // Seeded knowledge intentionally keeps firstMetTick null: the character did
    // not "first meet" this person during the recorded simulation.
    if (p.seeded || p.firstMetTick !== null) return;
    p.firstMetTick = tick;
    remember(observerId, {
      tick,
      kind: 'first_meeting',
      entityId: p.entityId,
      gist: 'met for the first time'
    });
  }

  /**
   * Record genuine contact: proximity, or a directed utterance that landed.
   * One continuous contact period is one encounter no matter how many ticks or
   * sentences it lasts.
   */
  function observe(observerId, entityId, tick, { words = false } = {}) {
    const p = ensure(observerId, entityId);
    if (!p.open) {
      p.open = true;
      p.encounters += 1;
      p.spoke = false;
      recordFirstMeeting(observerId, p, tick);
    }
    if (words && !p.spoke) {
      p.spoke = true;
      p.spokenWith += 1;
    }
    p.lastSeenTick = p.lastSeenTick === null ? tick : Math.max(p.lastSeenTick, tick);
    return p;
  }

  function closeStale(observerId, tick) {
    for (const p of people.get(observerId)?.values() ?? []) {
      if (!p.open) continue;
      if (tick - p.lastSeenTick > cfg.separationTicks) p.open = false;
    }
  }

  return {
    config: cfg,

    minds() {
      return [...enabled].sort();
    },

    /** Canonical-loop deterministic accumulation stage. */
    tick(perception) {
      for (const observerId of world.presentIds()) {
        if (!isMind(observerId)) continue;

        closeStale(observerId, world.tick);

        // Proximity is a meeting even if nobody speaks.
        for (const v of perception.sensoryState(observerId).visible) {
          if (v.distance > perception.config.nearRange) continue;
          observe(observerId, v.entityId, world.tick);
        }

        // Memory reads but never drains perception. Passive overhearing remains
        // perception only; landed directed speech is both a meeting and an
        // exchanged-words encounter.
        let high = consumed.get(observerId) ?? 0;
        for (const e of perception.pendingFor(observerId)) {
          if (e.seq === undefined) throw new Error('a queued perceived event carries no seq');
          if (e.seq <= high) continue;
          high = e.seq;
          if (!e.entityId || e.entityId === observerId) continue;
          if (!EXCHANGED.has(e.kind)) continue;
          observe(observerId, e.entityId, e.t, { words: true });
        }
        consumed.set(observerId, high);
      }
    },

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

    /** Brain interpretation may create knowledge, but never a meeting. */
    note(observerId, entityId, text) {
      if (!isMind(observerId)) throw new Error(`${observerId} has no memory to write to`);
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      ensure(observerId, entityId);
      remember(observerId, {
        tick: world.tick,
        kind: 'note',
        entityId,
        gist: text
      });
    },

    /** Learn this observer's label for someone, without claiming they met. */
    learnLabel(observerId, entityId, label) {
      if (!isMind(observerId)) throw new Error(`${observerId} has no memory to write to`);
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      const p = ensure(observerId, entityId);
      p.label = label;
      world.log.note(world.tick, 'label_learned', { agent: observerId, about: entityId });
      return p;
    },

    attentionHint(observerId, entityId) {
      const p = people.get(observerId)?.get(entityId);
      if (!p) return 0;
      return p.label ? 12 : 6;
    }
  };
}

/**
 * Compose sanitized perception with only this observer's own recognition.
 * Internal ids remain server-side joins and never enter the model-visible data.
 */
export function buildContext(perception, memory, observerId, floors = null) {
  const ctx = perception.contextFor(observerId);
  const refOf = new Map([...ctx.refs].map(([ref, id]) => [id, ref]));
  for (const v of ctx.forModel.sensoryState.visible) {
    const p = memory.recall(observerId, ctx.refs.get(v.ref));
    if (!p) continue;
    v.recognised = true;
    if (p.label) v.youCallThem = p.label;
    if (p.encounters > 0) v.timesMet = p.encounters;
    if (p.spokenWith > 0) v.timesSpoken = p.spokenWith;
  }
  ctx.forModel.memory = memory.episodesFor(observerId)
    .slice(-8)
    .map((e) => ({ kind: e.kind, gist: e.gist }))
    .filter((e) => e.gist);
  if (floors) {
    ctx.forModel.conversation = floors.utterancesFor(observerId)
      .map((u) => ({
        said: u.text,
        speaker: name(u.speaker),
        ...(u.addressed.length ? { to: u.addressed.map(name) } : {})
      }));
  }
  return ctx;

  /**
   * Who a transcript line is by, said safely. The ordered fallback of
   * phase-3e-implementation-structure.md 7.2, which is 3D's label rule applied
   * to history: never the target's canonical name, never an entity id, and never
   * a fallback that reaches for either because the first four were inconvenient.
   */
  function name(entityId) {
    if (entityId === observerId) return 'you';
    const p = memory.recall(observerId, entityId);
    if (p?.label) return p.label;
    const ref = refOf.get(entityId);
    if (ref) {
      const v = ctx.forModel.sensoryState.visible.find((x) => x.ref === ref);
      return v ? { ref, looks: v.appearance } : 'somebody';
    }
    return 'somebody';
  }
}
