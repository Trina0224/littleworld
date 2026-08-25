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
 * REFS POINT, THEY DO NOT NAME. Within one delivered context the same entity is
 * always the same `seen-N`, so the model can say "approach seen-2" without ever
 * being handed an id. Refs are ordered by distance rather than by entity id: if
 * seen-1 were always the alphabetically first character present, the ordering
 * would itself be a slow identity leak. The ref -> entity mapping is kept
 * server-side after the ref expires, because memory written against a ref would
 * otherwise be a dangling pointer the moment it was written (clarifications 1.1a).
 *
 * A QUEUE, BECAUSE PERCEPTION AND DELIVERY RUN AT DIFFERENT SPEEDS. Sensory
 * state refreshes every tick; a Brain wakes up rarely. A sentence spoken two
 * hundred ticks before the next wakeup must still be there. The queue is not
 * memory and not a message broker - once an event makes it into a successfully
 * built context it counts as delivered even if inference later fails, so an
 * agent is never told the same old utterance again on every retry.
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

export const DEFAULTS = {
  // Flat in world units, like movement speed, and for the same reason: making it
  // flat in metres means scaling by the height ramp, which is a refinement
  // rather than a correctness problem. Checked against the real anchors - the
  // counter to the near table is 48 units and audible; the counter to the far
  // table is 78 and is not, which is what makes broadcast worth having.
  nearRange: 40,
  hearingRange: 70,
  soundRange: 140,          // far enough to notice a voice, not to make out words
  personalSpace: 6,
  queueLimit: 40,
  visibleLimit: 8,          // how many people one request describes, most salient first
  epochHistory: 64          // how many ref maps stay resolvable for memory
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
function visualSalience(entry, sameZone) {
  let s = entry.kind === 'animal_seen' ? 28 : 30;
  if (entry.distance <= DEFAULTS.nearRange) s += 20;
  else if (entry.distance <= DEFAULTS.hearingRange * 2) s += 8;
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
  const cfg = { ...DEFAULTS, ...config };
  const pending = new Map();            // observerId -> perceived events
  const epochs = new Map();             // epochId -> { observer, tick, refs: Map }
  const epochOrder = [];
  let nextEpoch = 1;
  let factCursor = 0;
  let auditCursor = 0;

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
    q.push(event);
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

  function canHear(observerId, speakerId, scope) {
    if (!world.present(observerId)) return false;
    if (scope === 'broadcast') return true;      // scene-wide, for this small venue
    return gap(observerId, speakerId) <= cfg.hearingRange;
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
            for (const observerId of world.presentIds()) {
              if (observerId === e.agent) continue;
              if (canHear(observerId, e.agent, e.scope)) {
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
        .map((v) => ({ v, s: visualSalience(v, v.zone === myZone) }))
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
     * Kept after the ref has expired for the model, because a memory written
     * against a ref would otherwise be unresolvable the moment it was written.
     * @returns {string|null} null for a stale or unknown ref - never a guess at
     * a different entity.
     */
    resolve(epochId, ref) {
      return epochs.get(epochId)?.refs.get(ref) ?? null;
    },

    pendingFor(observerId) {
      return (pending.get(observerId) ?? []).slice();
    }
  };
}
