/**
 * The Perception Engine: the sensory boundary between the world and one Brain.
 *
 *     WORLD TRUTH != AGENT PERCEPTION
 *     PERCEPTION  != INTERPRETATION
 *     SENSORY DATA NEVER REVEALS INTERNAL IDENTITY
 *
 * Implements docs/specs/engine/phase-3c-perception.md and its clarifications.
 * No LLM is called from here and none is awaited; this is deterministic engine
 * work that happens to be the thing a model will later read.
 *
 * Four decisions carry the design.
 *
 * THE SERVER KNOWS WHO; THE MODEL IS TOLD WHAT IT LOOKS LIKE. Even when the
 * engine is certain an entity is pastor-01, the model-visible observation says
 * only "a tall thin middle-aged man in a dark suit". Recognition belongs to the
 * character - to its own self sheet and memory - not to the world's eyes, and
 * that is what permits uncertainty and honest mistakes. Sanitising is an
 * allowlist, not a denylist: the model-visible object is built field by field
 * from scratch, so a field added to the internal record later cannot leak by
 * being forgotten.
 *
 * REFS POINT, THEY DO NOT NAME - AND THEY ARE TRANSPORT, NOT STORAGE. Within one
 * delivered context the same entity is always the same `seen-N`, so the model can
 * say "approach seen-2" without ever being handed an id. Numbering follows the
 * order the model reads rather than entity id: if seen-1 always meant
 * "alphabetically first", the numbering would itself be a slow identity leak.
 *
 * A ref is valid for one request and its answer. Anything that outlives that
 * round trip - an action target, a memory - is CANONICALISED at the moment it is
 * committed: the ref is resolved to the entity, and the entity is what gets
 * stored. Long-term memory therefore never holds a ref and never depends on an
 * epoch still existing. The epoch cache below is a transport window that may be
 * evicted at any size without affecting anything already committed, which is
 * exactly the property that makes the two layers independent (clarifications 1.1a).
 *
 * A QUEUE, BECAUSE PERCEPTION AND DELIVERY RUN AT DIFFERENT SPEEDS. Sensory
 * state refreshes every tick; a Brain wakes up rarely. A sentence spoken two
 * hundred ticks before the next wakeup must still be there. The queue is not
 * memory and not a message broker - once an event makes it into a successfully
 * built context it counts as delivered even if inference later fails, so an
 * agent is never told the same old utterance again on every retry.
 *
 * It has two readers with different rights. Delivery to a Brain DRAINS it; 3D
 * memory only READS it, every tick, and must still see each event exactly once.
 * That is why every queued event carries a monotonic `seq`: a reader that may
 * not drain cannot track its progress as a position in an array somebody else
 * is emptying. The seq is server-side and never reaches a model.
 *
 * HOW FAR A VOICE CARRIES IS NOT DECIDED HERE. It is world physics, it lives in
 * hearing.js, and `world.say` has already stamped the audience onto the speech
 * fact by the time this file sees it. Recomputing it would be a second
 * implementation of one rule that could disagree with the recording, and the
 * answer is not recoverable later anyway - it depends on where everyone stood at
 * that tick. So this file reads `heardBy` and only decides what a near miss
 * looks like: seeing a speaker is not hearing the words.
 *
 * OWN FAILURE IS THE ONE THING TAKEN FROM AUDIT. A failed attempt changed
 * nothing, so it is not a fact, so it cannot be derived from the fact stream at
 * all. It reaches the agent that attempted it and nobody else - not another
 * observer's package, not another observer's queue, at any distance. See
 * phase-3c-perception.md 12.1 for why this narrows the audit stream's contract
 * rather than widening it.
 */

const round = (v) => Math.round(v * 100) / 100;

/** Stable non-identity-revealing tie-break. Same shape as attendance.js. */
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * What perception decides for itself. `hearingRange` and `soundRange` are NOT
 * here: how far a voice carries is world physics and lives in `hearing.js`, so
 * that `say` and this file cannot disagree about who heard something.
 */
export const DEFAULTS = {
  // Flat in world units, like movement speed, and for the same reason: making it
  // flat in metres means scaling by the height ramp, which is a refinement
  // rather than a correctness problem.
  nearRange: 40,
  personalSpace: 6,
  queueLimit: 40,
  visibleLimit: 8,          // how many people one request describes, most salient first
  // A transport window, not a retention policy. Refs only have to survive from a
  // request to its answer; anything durable is canonicalised at commit, so
  // shrinking this to 1 must not break a single committed record. The test does
  // exactly that.
  epochHistory: 8
};

/** Model-visible salience order, from phase-3c-perception.md 11. */
const SALIENCE = {
  direct_address: 100,
  own_action_failed: 100,
  own_activity_changed: 95,
  speech_heard: 80,
  nearby_world_event: 55,
  movement_seen: 45,
  public_activity_seen: 40,
  person_seen: 30,
  animal_seen: 30,
  sound_heard: 20
};

/**
 * Being visible is not the same as being worth a slot in a request (11).
 *
 * Zone adjacency decides whether someone is in your scene at all; this decides
 * how much they are worth saying. Adjacent-zone figures across the garden are
 * genuinely perceptible and genuinely uninteresting, so they rank below the
 * person at your table and fall off the end of a busy package - omitted from one
 * delivery, not removed from the world.
 */
function visualSalience(entry, sameZone, cfg) {
  let s = entry.kind === 'animal_seen' ? 28 : 30;
  if (entry.distance <= cfg.nearRange) s += 20;
  else if (entry.distance <= cfg.hearingRange * 2) s += 8;
  if (sameZone) s += 6;
  if (entry.activity && entry.activity !== 'idle') s += 4;
  return s;
}

/** These may never be pushed out of the queue by ordinary visual noise (2.3). */
const PROTECTED = new Set([
  'direct_address', 'speech_heard', 'own_activity_changed', 'own_action_failed'
]);

export function createPerception(world, zones, {
  entities = new Map(),                 // id -> { appearance, kind }
  config = {},
  attentionHint = null                  // (observerId, entityId) -> number, see below
} = {}) {
  // World physics wins over anything a caller passes: a perception config that
  // quietly disagreed with the ranges `say` used would produce packages that
  // contradict the recorded `heardBy`.
  const cfg = { ...DEFAULTS, ...config, ...world.hearing.config };
  const pending = new Map();            // observerId -> perceived events
  const epochs = new Map();             // epochId -> { observer, tick, refs: Map }
  const epochOrder = [];
  let nextEpoch = 1;
  let factCursor = 0;
  let auditCursor = 0;
  // Monotonic across every observer. Delivery to a Brain drains the queue, but
  // memory reads it without draining, so "have I taken this one" cannot be a
  // position in an array that somebody else is emptying.
  let nextSeq = 1;

  const describe = (id) => entities.get(id)?.appearance ?? 'someone';
  const kindOf = (id) => (entities.get(id)?.kind === 'animal' ? 'animal_seen' : 'person_seen');

  function positionOf(id) {
    const a = world.agents.get(id);
    return a ? a.at : null;
  }

  function gap(a, b) {
    const pa = positionOf(a);
    const pb = positionOf(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  }

  function band(distance) {
    if (distance <= cfg.nearRange) return 'near';
    if (distance <= cfg.hearingRange * 2) return 'nearby';
    return 'across the way';
  }

  function queue(observerId, event) {
    if (!world.present(observerId)) return;
    const q = pending.get(observerId) ?? [];
    q.push({ ...event, seq: nextSeq++ });
    if (q.length > cfg.queueLimit) {
      // Drop the oldest unprotected event rather than the oldest event, so a
      // direct address is never displaced by a crowd walking past.
      const i = q.findIndex((e) => !PROTECTED.has(e.kind));
      q.splice(i === -1 ? 0 : i, 1);
    }
    pending.set(observerId, q);
  }

  /** Can `observer` see `subject` at all? Zone first, then distance. */
  function canSee(observerId, subjectId) {
    if (observerId === subjectId) return false;
    if (!world.present(subjectId)) return false;
    const po = positionOf(observerId);
    const ps = positionOf(subjectId);
    if (!po || !ps) return false;
    const zo = zones.at(po[0], po[1]);
    const zs = zones.at(ps[0], ps[1]);
    if (zs === 'backstage' && zo !== 'backstage') return false;
    return zones.adjacent(zo, zs);
  }

  return {
    config: cfg,

    /**
     * Turn everything committed since the last call into per-observer perceived
     * events. Deterministic, and it neither dispatches nor awaits inference.
     */
    tick() {
      const facts = world.log.facts;
      for (; factCursor < facts.length; factCursor += 1) {
        const e = facts[factCursor];
        switch (e.type) {
          case 'speech_said': {
            // Who heard it was settled at commit, by the world, while everybody
            // was still standing where they were standing. Asking again here
            // would be a second implementation of one rule and could disagree
            // with the recording (phase-3e-floor-clarifications.md 8.1).
            if (!Array.isArray(e.heardBy)) {
              throw new Error('a speech fact carries no heardBy');
            }
            const heard = new Set(e.heardBy);
            for (const observerId of world.presentIds()) {
              if (observerId === e.agent) continue;
              if (heard.has(observerId)) {
                queue(observerId, {
                  kind: e.to === observerId ? 'direct_address' : 'speech_heard',
                  t: e.t, entityId: e.agent, text: e.text, scope: e.scope
                });
              } else if (gap(observerId, e.agent) <= cfg.soundRange
                         && canSee(observerId, e.agent)) {
                // Seeing a speaker does not mean hearing the words (9).
                queue(observerId, {
                  kind: 'sound_heard', t: e.t, entityId: e.agent,
                  detail: '有人在說話，聽不清楚內容'
                });
              }
            }
            break;
          }
          case 'move_started':
          case 'activity_started': {
            const kind = e.type === 'move_started' ? 'movement_seen' : 'public_activity_seen';
            for (const observerId of world.presentIds()) {
              if (observerId === e.agent) {
                if (e.type === 'activity_started') {
                  queue(observerId, {
                    kind: 'own_activity_changed', t: e.t, entityId: e.agent,
                    detail: e.activity
                  });
                }
                continue;
              }
              if (canSee(observerId, e.agent)) {
                queue(observerId, { kind, t: e.t, entityId: e.agent, detail: e.activity ?? null });
              }
            }
            break;
          }
          case 'activity_ended': {
            queue(e.agent, {
              kind: 'own_activity_changed', t: e.t, entityId: e.agent,
              detail: `${e.activity}:${e.outcome}`
            });
            break;
          }
          case 'resource_occupied':
          case 'resource_released': {
            for (const observerId of world.presentIds()) {
              if (observerId === e.by) continue;
              if (canSee(observerId, e.by) && gap(observerId, e.by) <= cfg.hearingRange) {
                queue(observerId, {
                  kind: 'nearby_world_event', t: e.t, entityId: e.by,
                  detail: e.type === 'resource_occupied' ? 'sat down' : 'got up'
                });
              }
            }
            break;
          }
          default:
            break;
        }
      }

      // The one narrow claim on the audit stream: an agent learns its own
      // attempt failed, because nothing changed and so there is no fact to
      // derive it from. Actor only, at any distance, never anyone else.
      const audit = world.log.audit;
      for (; auditCursor < audit.length; auditCursor += 1) {
        const e = audit[auditCursor];
        if (e.type !== 'step_failed') continue;
        queue(e.agent, {
          kind: 'own_action_failed', t: e.t, entityId: e.agent,
          detail: `${e.activity}:${e.step}`
        });
      }
    },

    /** Server-only view. Carries ids; never handed to a model. */
    sensoryState(observerId) {
      const visible = [];
      for (const id of world.presentIds()) {
        if (!canSee(observerId, id)) continue;
        const d = gap(observerId, id);
        const p = positionOf(id);
        visible.push({
          entityId: id,
          kind: kindOf(id),
          appearance: describe(id),
          zone: zones.at(p[0], p[1]),
          distance: round(d),
          activity: world.agents.get(id)?.activity?.name ?? 'idle'
        });
      }
      return { observerId, tick: world.tick, visible };
    },

    /**
     * Build one delivered context: the model-visible half, plus the server-only
     * half that keeps it resolvable.
     *
     * Everything included is marked delivered. If inference later fails the
     * agent falls back deterministically; it is not told the same utterance
     * again on the next attempt (clarifications 2.2).
     */
    contextFor(observerId) {
      const epochId = `e${nextEpoch++}`;
      const state = this.sensoryState(observerId);
      const events = pending.get(observerId) ?? [];
      pending.set(observerId, []);

      // Rank first, then number, so seen-1 is the first thing the model reads.
      // Ranking is by salience and distance, never by entity id: if seen-1 always
      // meant "alphabetically first", the numbering would itself be an identity
      // leak, paid out slowly across many contexts. The hash only breaks ties.
      const here = positionOf(observerId);
      const myZone = here ? zones.at(here[0], here[1]) : null;
      const ranked = state.visible
        .map((v) => ({ v, s: visualSalience(v, v.zone === myZone, cfg) }))
        .sort((a, b) => (b.s - a.s)
          || (a.v.distance - b.v.distance)
          || (hash01(epochId + a.v.entityId) - hash01(epochId + b.v.entityId)))
        .slice(0, cfg.visibleLimit);

      const refOf = new Map();
      const refs = new Map();
      ranked.forEach(({ v }, i) => {
        const ref = `seen-${i + 1}`;
        refOf.set(v.entityId, ref);
        refs.set(ref, v.entityId);
      });
      let heard = 0;
      for (const ev of events) {
        if (!ev.entityId || refOf.has(ev.entityId) || ev.entityId === observerId) continue;
        const ref = `heard-${++heard}`;
        refOf.set(ev.entityId, ref);
        refs.set(ref, ev.entityId);
      }

      // Allowlist. Built field by field so a field added upstream cannot leak.
      const visible = ranked
        .map(({ v, s }) => ({
          ref: refOf.get(v.entityId),
          kind: v.kind,
          appearance: v.appearance,
          location: zones.label(v.zone),
          distance: band(v.distance),
          activity: v.activity,
          salience: s
        }));

      const recent = events
        .map((ev) => {
          const o = { kind: ev.kind, salience: SALIENCE[ev.kind] ?? 10 };
          if (ev.entityId && ev.entityId !== observerId) o.ref = refOf.get(ev.entityId);
          if (ev.text !== undefined) o.said = ev.text;
          if (ev.detail !== undefined) o.detail = ev.detail;
          if (attentionHint && ev.entityId) {
            // Hook for the "should a known person be more salient" question,
            // which is open. Off by default so this file does not settle it.
            o.salience += attentionHint(observerId, ev.entityId) ?? 0;
          }
          return o;
        })
        .sort((a, b) => b.salience - a.salience);

      epochs.set(epochId, { observer: observerId, tick: world.tick, refs });
      epochOrder.push(epochId);
      while (epochOrder.length > cfg.epochHistory) epochs.delete(epochOrder.shift());

      return {
        epochId,                                   // server-side handle, not model-visible
        forModel: { tick: world.tick, sensoryState: { visible }, recentPerceivedEvents: recent },
        refs                                       // server-side, see resolve()
      };
    },

    /**
     * ref -> canonical entity, server-side only.
     *
     * @returns {string|null} null for a stale or unknown ref - never a guess at
     * a different entity.
     */
    resolve(epochId, ref) {
      return epochs.get(epochId)?.refs.get(ref) ?? null;
    },

    /**
     * Turn a Brain's reply into something that can be stored.
     *
     * Every ref in the reply is replaced by the canonical entity it pointed at,
     * so what the caller gets back holds no refs at all. That is the whole
     * point: a memory that kept `seen-2` would mean "whoever seen-2 happened to
     * be in an epoch that may since have been evicted", which makes what an
     * agent remembers depend on a cache size. Memory stores entities.
     *
     * Unresolvable refs are reported rather than guessed at. A stale ref must
     * fail cleanly, never silently retarget somebody else.
     *
     * @returns {{value: any, unresolved: string[]}}
     */
    canonicalize(epochId, reply) {
      const unresolved = [];
      const walk = (v) => {
        if (typeof v === 'string' && /^(seen|heard)-\d+$/.test(v)) {
          const id = this.resolve(epochId, v);
          if (id === null) { unresolved.push(v); return null; }
          return id;
        }
        if (Array.isArray(v)) return v.map(walk);
        if (v && typeof v === 'object') {
          return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
        }
        return v;
      };
      return { value: walk(reply), unresolved };
    },

    /**
     * Done with this round trip.
     *
     * Safe to call the moment a reply has been canonicalised, and safe never to
     * call at all - the cache evicts on its own. Nothing committed depends on an
     * epoch surviving, so releasing one can never orphan a memory.
     */
    releaseEpoch(epochId) {
      epochs.delete(epochId);
      const i = epochOrder.indexOf(epochId);
      if (i !== -1) epochOrder.splice(i, 1);
    },

    /**
     * Read the queue without taking it, for a consumer that may not drain -
     * today that is 3D memory. Each event carries `seq`; ingest only what is
     * above your own cursor. Draining belongs to contextFor and to nothing else.
     */
    pendingFor(observerId) {
      return (pending.get(observerId) ?? []).slice();
    }
  };
}
