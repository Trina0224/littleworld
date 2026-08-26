/**
 * Private memory: what one character remembers about what it has perceived.
 *
 * Implements docs/specs/engine/phase-3d-memory.md. It accumulates and it does
 * not decide - whether two characters are now friends is a judgement, and the
 * judgement belongs to the Brain reading its own memory, not to a number the
 * engine computed.
 *
 * Seven things carry the design.
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
 * Stated so it cannot be drifted away from (phase-3d-memory.md 6.1):
 *
 *     THE ENGINE WRITES EXACTLY ONE KIND OF EPISODE: first_meeting.
 *     EVERYTHING ELSE IN THE LIST WAS PROPOSED BY THE BRAIN.
 *
 * It used to write one per heard utterance, because until 3E gave conversation a
 * transcript of its own there was nowhere else for a sentence to live. Four lines
 * of こんにちは / そうですね cost a sixth of a character's permanent budget and
 * preserved nothing; ten turns of a real conversation took half of it. What the
 * engine keeps instead is structural, permanent, and one line per person -
 * encounters, spokenWith, lastSeenTick.
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
 * WHO HAS A MEMORY AT ALL IS DECLARED, NOT INFERRED. `minds` is required, and
 * an observer outside it can never acquire a person model, an episode or an
 * audit line - not by standing next to somebody for a day, not by being spoken
 * to, not through a Brain call that should never have been made for it. The dog
 * is a deterministic actor whose personality is its parameters (3B section 8),
 * and the way to be sure it never grows a past is to have nothing that could
 * give it one. The gate is on the OBSERVER only: everybody else still remembers
 * the dog perfectly well, which is why it is a character and not scenery.
 *
 * There are exactly three doors into this store and exactly three checks, one on
 * each: the deterministic tick, note(), and learnLabel() - plus a refusal to
 * even construct a memory that was seeded for something with no mind. Deeper
 * belt-and-braces checks were written first and taken out again: a redundant
 * guard cannot be shown to bite, so removing it is a mutation the suite passes,
 * and a gate no test can hold is a gate that quietly rots.
 *
 * AN ENCOUNTER IS A MEETING, NOT A SAMPLE. Two people who spend the afternoon at
 * one table met once. So an encounter opens when contact begins, stays open
 * while it continues however long that is, and closes only after they have been
 * apart for `separationTicks`. Counting "still nearby after another cooldown"
 * instead would make `timesMet` a stopwatch wearing a counter's name, and a
 * Brain reading "we have met 40 times" about one long conversation would be
 * reading something false.
 *
 * PERCEIVED EVENTS ARE CONSUMED WITHOUT BEING TAKEN. Perception's queue belongs
 * to Brain delivery, which drains it; memory only reads it, and remembers each
 * event exactly once by carrying a per-observer cursor over the monotonic `seq`
 * perception stamps on every queued event. So a sentence can be remembered on
 * the tick it was heard and still be waiting in the queue for a wakeup that
 * happens three hundred ticks later - the two consumers do not interfere, and
 * neither one's timing can duplicate or erase the other's work.
 *
 * LENGTH IS A PER-CALL COST. self.md is a cached prefix at 0.1x; memory is the
 * dynamic suffix, re-sent uncached on every request. A long memory is expensive
 * in a way a long self sheet is not, which is why episodes are bounded and
 * evicted deterministically.
 */

export const DEFAULTS = {
  episodeLimit: 24,          // per observer; the dynamic suffix is what costs
  // How long two people must be out of contact before the next contact is a new
  // meeting rather than the same one continuing. Not a cooldown: it never
  // re-counts a meeting that is still going on.
  separationTicks: 60
};

/**
 * Salience for what is worth keeping when the episode budget is full.
 *
 * Kinds the engine no longer writes are still ranked, because a Brain may
 * propose an episode of any of them. A kind nothing writes is not a stale row;
 * it is a kind nothing has proposed yet.
 */
const KEEP = {
  direct_address: 100,
  speech_heard: 80,
  own_action_failed: 55,
  own_activity_changed: 40,
  nearby_world_event: 35,
  first_meeting: 90,
  note: 70                    // something the Brain chose to remember
};

export function createMemory(world, { seeds = new Map(), minds, config = {} } = {}) {
  if (minds === undefined) {
    // Deliberately not defaulted. Inferring it from `seeds` would give a
    // character who knows nobody yet (man-01) no memory, and inferring it from
    // the roster would give the dog one. Both are wrong in a way that would
    // only show up much later, so the scenario has to say.
    throw new Error('createMemory needs an explicit `minds` set: who has a memory at all');
  }
  const cfg = { ...DEFAULTS, ...config };
  const enabled = new Set(minds);

  // observerId -> Map(entityId -> person model). Never merged across observers.
  const people = new Map();
  // observerId -> episodes, oldest first
  const episodes = new Map();
  // observerId -> highest perception `seq` already remembered. A cursor rather
  // than a count, because the queue it reads is being emptied by somebody else.
  const consumed = new Map();

  const isMind = (observerId) => enabled.has(observerId);

  function store(observerId) {
    if (!people.has(observerId)) people.set(observerId, new Map());
    return people.get(observerId);
  }

  /**
   * Seed from `knows`. This is not "loading defaults" - it is the memory the
   * character starts the world already holding.
   */
  for (const [observerId, entries] of seeds) {
    if (!isMind(observerId)) {
      throw new Error(`${observerId} was seeded with knowledge but has no memory`);
    }
    const m = store(observerId);
    for (const { who, as } of entries) {
      m.set(who, {
        entityId: who,
        label: as,
        encounters: 0,
        spokenWith: 0,
        lastSeenTick: null,
        firstMetTick: null,                      // seeded knowledge has no first time
        seeded: true,
        open: false,                             // never met in the world yet
        spoke: false                             // words during the open encounter
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

  /**
   * Make sure this observer has a model of this entity, without claiming they
   * met just now.
   *
   * The Brain writing a note about someone is not the two of them meeting, and
   * letting it count would put encounter timing in the hands of whatever the
   * scheduler happened to call this tick.
   */
  function ensure(observerId, entityId, tick) {
    const m = store(observerId);
    let p = m.get(entityId);
    if (!p) {
      p = {
        entityId, label: null, encounters: 0, spokenWith: 0,
        lastSeenTick: null, firstMetTick: tick, seeded: false,
        open: false, spoke: false
      };
      m.set(entityId, p);
      remember(observerId, { tick, kind: 'first_meeting', entityId, gist: 'met for the first time' });
    }
    return p;
  }

  /**
   * Record contact: we are near, or words passed between us.
   *
   * Opens an encounter if none is open, and otherwise only extends the one that
   * is. `lastSeenTick` never moves backwards, because a queued utterance may
   * carry an older tick than the proximity seen this same tick.
   *
   * `words` counts the MEETING, not the sentence. Standing next to someone for
   * an afternoon and talking to them for an afternoon are different facts about
   * the same afternoon, and the engine may honestly hold both - we have met four
   * times and spoken on two of them. What it may not do is say what that amounts
   * to.
   */
  function observe(observerId, entityId, tick, { words = false } = {}) {
    const p = ensure(observerId, entityId, tick);
    if (!p.open) {
      p.open = true;
      p.encounters += 1;
      p.spoke = false;                           // every meeting starts silent
    }
    if (words && !p.spoke) {
      p.spoke = true;
      p.spokenWith += 1;
    }
    p.lastSeenTick = p.lastSeenTick === null ? tick : Math.max(p.lastSeenTick, tick);
    return p;
  }

  /** An encounter ends by absence, which is the only thing that can end one. */
  function closeStale(observerId, tick) {
    for (const p of people.get(observerId)?.values() ?? []) {
      if (!p.open) continue;
      // `spoke` is reset when the NEXT encounter opens, not here. One reset,
      // in the place that can be shown to bite - a second one would be a
      // mutation the suite passes, which is not evidence of anything.
      if (tick - p.lastSeenTick > cfg.separationTicks) p.open = false;
    }
  }

  return {
    config: cfg,

    /** who was declared to have a memory at all */
    minds() {
      return [...enabled].sort();
    },

    /**
     * Deterministic half, and a stage of the canonical tick (loop.js step 7).
     *
     * Reads what perception has already refreshed and queued, and records that
     * these people were here and what passed between them. No Brain involved,
     * which is the point: this keeps running when inference does not.
     */
    tick(perception) {
      for (const observerId of world.presentIds()) {
        if (!isMind(observerId)) continue;

        // Who has been gone long enough that the next sighting is a new
        // meeting. Done before recording contact, so a meeting still in
        // progress is never closed and immediately reopened.
        closeStale(observerId, world.tick);

        // Encounters from what is perceptible right now.
        for (const v of perception.sensoryState(observerId).visible) {
          if (v.distance > perception.config.nearRange) continue;
          observe(observerId, v.entityId, world.tick);
        }

        // And from what was heard, which reaches further than "near". The queue
        // is read, not drained - delivery to a Brain owns the draining. The
        // cursor is what makes reading it repeatedly safe, and it is still
        // required now that no episode is written: re-ingesting a queued
        // utterance would inflate spokenWith and drag lastSeenTick backwards,
        // which is the same defect wearing different clothes.
        let high = consumed.get(observerId) ?? 0;
        for (const e of perception.pendingFor(observerId)) {
          if (e.seq === undefined) throw new Error('a queued perceived event carries no seq');
          if (e.seq <= high) continue;
          high = e.seq;
          if (!e.entityId || e.entityId === observerId) continue;
          if (e.kind !== 'speech_heard' && e.kind !== 'direct_address') continue;
          // Contact, and nothing else. The words themselves belong to the
          // conversation transcript (3E) and to the fact stream, which is where
          // replay and the offline script pass read them from.
          observe(observerId, e.entityId, e.t, { words: true });
        }
        consumed.set(observerId, high);
      }
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
     *
     * Both refuse an observer with no memory rather than quietly doing nothing:
     * a Brain proposal arriving for a deterministic actor means the scheduler
     * woke something that has no mind, and that is worth failing loudly.
     */
    note(observerId, entityId, text) {
      if (!isMind(observerId)) throw new Error(`${observerId} has no memory to write to`);
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      ensure(observerId, entityId, world.tick);
      remember(observerId, { tick: world.tick, kind: 'note', entityId, gist: text });
    },

    /**
     * Learn what to call someone.
     *
     * The label is the observer's, always. Nothing here consults the target's
     * files, and there is nothing to consult: character.json carries no name.
     */
    learnLabel(observerId, entityId, label) {
      if (!isMind(observerId)) throw new Error(`${observerId} has no memory to write to`);
      if (/^(seen|heard)-\d+$/.test(String(entityId))) {
        throw new Error(`a perception ref reached memory uncanonicalized: ${entityId}`);
      }
      const p = ensure(observerId, entityId, world.tick);
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
    if (p.spokenWith > 0) v.timesSpoken = p.spokenWith;
  }
  ctx.forModel.memory = memory.episodesFor(observerId)
    .slice(-8)
    .map((e) => ({ kind: e.kind, gist: e.gist }))
    .filter((e) => e.gist);
  return ctx;
}
