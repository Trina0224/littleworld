/**
 * One offered conversational floor per zone.
 *
 * Implements docs/specs/engine/phase-3e-implementation-structure.md with
 * phase-3e-floor-clarifications.md and phase-3e-pre-floor-corrections.md, which
 * win over it. The engine offers the floor to one character at a time and asks
 * whether they want to speak; "no" is an answer, and a round with no taker is
 * what silence means.
 */
import { SOCIAL_FACTS } from './events.js';
import { SEAT } from './resources.js';

export const DEFAULTS = {
  transcriptWindow: 12,
  addressExpiry: 200,      // how long an unanswered heard address keeps a zone qualified
  offerExpiry: 400,        // an offer nobody answers becomes a decline
  batch: 3,                // K when the floor is open; 1 when there is an addressee
  quietLimit: 1            // rounds with no taker before the floor sleeps
};

/** Stable non-identity-revealing tie-break. Same shape as attendance.js. */
function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const ADDRESSED = 3000;
const OVERHEARD = 1500;
const ORDINARY = 1000;

export function createFloors(world, zones, perception, {
  minds, config = {}, weigh = null
} = {}) {
  if (minds === undefined) {
    throw new Error('createFloors needs an explicit `minds` set: who can hold a floor');
  }

  const cfg = { ...DEFAULTS, ...config };
  const llm = new Set(minds);
  const floors = new Map();          // zoneId -> Floor
  const spoken = new Map();          // zoneId -> indices into world.log.facts
  const pendingAddress = new Map();  // entityId -> { tick, from, zone }
  const spent = new Set();           // `${observer}|${sourceZone}|${sourceSpell}`
  const opened = [];                 // offers opened this tick, drained by offers()
  let spell = 0;
  let factCursor = 0;

  function zoneOf(entityId) {
    const a = world.agents.get(entityId);
    return a && world.present(entityId) ? zones.at(a.at[0], a.at[1]) : null;
  }

  function occupants(zoneId) {
    return world.presentIds().filter((id) => zoneOf(id) === zoneId);
  }

  function heads(zoneId) {
    return occupants(zoneId).filter((id) => llm.has(id));
  }

  /** The three physical clauses. The overheard nudge is separate, below. */
  function qualifiesPhysically(zoneId) {
    const here = occupants(zoneId);
    const mine = here.filter((id) => llm.has(id));
    if (mine.length >= 2) return true;
    if (mine.length === 0) return false;
    if (here.length > mine.length) return true;           // an addressable animal
    return pendingAddress.has(mine[0]);                   // clarifications 9.3
  }

  /**
   * A conversation this actor can hear but is not part of, worth one offer
   * (clarifications 10). Only for somebody who has nobody to talk to where they
   * are - a deliberate narrowing of 10.3, recorded in the spec.
   */
  function nudgeSource(entityId) {
    const mine = zoneOf(entityId);
    if (!mine || qualifiesPhysically(mine)) return null;
    for (const zoneId of zones.ids) {
      if (zoneId === mine) continue;
      const f = floors.get(zoneId);
      if (!f || f.state === 'dormant' || f.lastSpeechTick === null) continue;
      if (spent.has(`${entityId}|${zoneId}|${f.socialSpell}`)) continue;
      const audible = (spoken.get(zoneId) ?? []).slice(-1)
        .some((i) => world.log.facts[i].heardBy.includes(entityId));
      if (audible) return zoneId;
    }
    return null;
  }

  function qualifies(zoneId) {
    if (qualifiesPhysically(zoneId)) return true;
    return heads(zoneId).some((id) => nudgeSource(id) !== null);
  }

  function open(zoneId) {
    spell += 1;
    floors.set(zoneId, {
      zone: zoneId, socialSpell: spell, state: 'open',
      round: 0, quietRounds: 0,
      lastSpeechTick: null, lastSpeaker: null, addressed: null,
      offeredTo: [], offeredAt: null, why: new Map(),
      asked: new Set(), claims: new Map(), declines: new Set(), epochs: new Map()
    });
    world.log.note(world.tick, 'floor_opened', { zone: zoneId, spell });
  }

  function close(zoneId) {
    const f = floors.get(zoneId);
    if (f) for (const [id, epochId] of f.epochs) settleQuietly(id, epochId, false);
    floors.delete(zoneId);
    world.log.note(world.tick, 'floor_closed', { zone: zoneId });
  }

  function settleQuietly(entityId, epochId, delivered) {
    try { perception.settle(epochId, { delivered }); } catch { /* already settled */ }
  }

  function rearm(f) {
    spell += 1;
    f.socialSpell = spell;
    f.state = 'open';
    f.quietRounds = 0;
    f.asked.clear();
    world.log.note(world.tick, 'floor_rearmed', { zone: f.zone, spell });
  }

  function carriesLiveOffer(f, zoneId) {
    return f.offeredTo.some((id) => f.why.get(id) !== 'open_floor' && zoneOf(id) === zoneId);
  }

  function requalify() {
    for (const zoneId of zones.ids) {
      const wanted = qualifies(zoneId);
      if (wanted === floors.has(zoneId)) continue;
      if (wanted) { open(zoneId); continue; }
      // A temporary floor exists to carry one offer, and spending the nudge or
      // answering the address is what stops it qualifying - so without this it
      // would be revoked in the same breath as the offer it was opened for.
      // Only that case: an ordinary open-floor offer in an emptying zone goes.
      if (carriesLiveOffer(floors.get(zoneId), zoneId)) continue;
      close(zoneId);
    }
  }

  function registerAddress(e) {
    if (!e.to || !e.heardBy.includes(e.to) || !llm.has(e.to)) return;
    pendingAddress.set(e.to, { tick: e.t, from: e.agent, zone: e.zone ?? null });
  }

  function record(e, index) {
    if (!e.zone) return;
    const list = spoken.get(e.zone) ?? [];
    list.push(index);
    spoken.set(e.zone, list);
    const f = floors.get(e.zone);
    if (!f) return;
    f.lastSpeechTick = e.t;
    f.lastSpeaker = e.agent;
    f.addressed = e.to && e.heardBy.includes(e.to) ? e.to : null;
  }

  /** Which zones a committed fact makes socially live again. */
  function rearmedBy(e) {
    if (!SOCIAL_FACTS.has(e.type)) return [];
    if (e.type === 'speech_said') {
      const out = new Set();
      if (e.to && e.heardBy.includes(e.to)) { const z = zoneOf(e.to); if (z) out.add(z); }
      if (e.scope === 'broadcast') for (const id of e.heardBy) { const z = zoneOf(id); if (z) out.add(z); }
      if (e.zone) out.add(e.zone);
      return [...out].sort();
    }
    if (e.type === 'resource_occupied' || e.type === 'resource_released') {
      const r = world.resource(e.resource);
      if (!r || r.kind !== SEAT) return [];          // a station is machinery
      const z = zones.at(r.at[0], r.at[1]);
      return z ? [z] : [];
    }
    const z = zoneOf(e.agent);
    return z ? [z] : [];
  }

  function rankOf(f, entityId) {
    if (pendingAddress.has(entityId) || f.addressed === entityId) return ADDRESSED;
    if (nudgeSource(entityId)) return OVERHEARD;
    return ORDINARY + (weigh ? weigh(entityId, { zone: f.zone, round: f.round }) : 0);
  }

  function ranked(f) {
    return heads(f.zone)
      .map((id) => ({ id, r: rankOf(f, id) }))
      .sort((a, b) => (b.r - a.r)
        || (hash01(`${world.seed}:${f.zone}:${f.round}:${a.id}`)
            - hash01(`${world.seed}:${f.zone}:${f.round}:${b.id}`))
        || (a.id < b.id ? -1 : 1))
      .map((x) => x.id);
  }

  function endRound(f) {
    f.round += 1;
    f.quietRounds += 1;
    f.asked.clear();
    if (f.quietRounds >= cfg.quietLimit) {
      f.state = 'dormant';
      world.log.note(world.tick, 'floor_dormant', { zone: f.zone, round: f.round });
    }
  }

  function offer(f) {
    const candidates = ranked(f).filter((id) => !f.asked.has(id));
    if (!candidates.length) { endRound(f); return; }
    const addressee = candidates[0];
    const k = rankOf(f, addressee) === ADDRESSED ? 1 : cfg.batch;
    f.offeredTo = candidates.slice(0, k);
    f.offeredAt = world.tick;
    f.state = 'offered';
    for (const id of f.offeredTo) {
      f.asked.add(id);
      const source = nudgeSource(id);
      const why = rankOf(f, id) === ADDRESSED ? 'addressed'
        : source ? 'overheard' : 'open_floor';
      if (why === 'overheard') spent.add(`${id}|${source}|${floors.get(source).socialSpell}`);
      const ctx = perception.contextFor(id);
      f.epochs.set(id, ctx.epochId);
      f.why.set(id, why);
      opened.push({ entityId: id, zone: f.zone, round: f.round, why, epochId: ctx.epochId, context: ctx });
      world.log.note(world.tick, 'floor_offered', { zone: f.zone, agent: id, why });
    }
  }

  function resolve(f) {
    const answered = (id) => f.claims.has(id) || f.declines.has(id);
    const expired = world.tick - f.offeredAt > cfg.offerExpiry;
    if (!f.offeredTo.every(answered) && !expired) return;
    for (const id of f.offeredTo) if (!answered(id)) f.declines.add(id);

    const takers = f.offeredTo.filter((id) => f.claims.has(id));
    const winner = takers[0] ?? null;                    // offeredTo is rank-ordered
    const said = winner ? f.claims.get(winner) : null;
    for (const id of f.offeredTo) {
      const lost = takers.includes(id) && id !== winner;
      if (lost) world.log.note(world.tick, 'floor_lost', { zone: f.zone, agent: id });
      settleQuietly(id, f.epochs.get(id), !lost);        // a loser's context was never used
      f.epochs.delete(id);
    }
    f.offeredTo = [];
    f.claims.clear();
    f.declines.clear();
    f.state = 'open';

    if (!winner) return;                                 // all declined: try the next batch
    pendingAddress.delete(winner);
    world.say(winner, said.speak, said.to ? { to: said.to } : {});
    f.round += 1;
    f.quietRounds = 0;
    f.asked.clear();
  }

  return {
    config: cfg,

    /** Stage 8 of the canonical tick. */
    tick() {
      for (const [id, a] of [...pendingAddress.entries()].sort()) {
        if (world.tick - a.tick > cfg.addressExpiry) pendingAddress.delete(id);
      }

      const facts = world.log.facts;
      const fresh = [];
      const wake = new Set();
      for (; factCursor < facts.length; factCursor += 1) {
        const e = facts[factCursor];
        for (const z of rearmedBy(e)) wake.add(z);
        if (e.type !== 'speech_said') continue;
        if (!Array.isArray(e.heardBy)) throw new Error('a speech fact carries no heardBy');
        fresh.push([e, factCursor]);
      }

      for (const [e] of fresh) registerAddress(e);
      requalify();
      for (const [e, i] of fresh) record(e, i);
      for (const z of [...wake].sort()) {
        const f = floors.get(z);
        if (f && f.state === 'dormant') rearm(f);
      }

      for (const zoneId of zones.ids) {
        const f = floors.get(zoneId);
        if (!f) continue;
        if (f.state === 'offered') resolve(f);
        if (f.state === 'open') offer(f);
      }
    },

    /** Offers opened this tick. Drained, like fresh() in loop.js. */
    offers() {
      return opened.splice(0, opened.length);
    },

    /**
     * "I will speak." A claim, not an utterance: the highest-ranked claimant in
     * the batch speaks and every other claim is a counterfactual that commits
     * nothing (clarifications 3).
     */
    commit(entityId, { speak, to = null } = {}) {
      const f = floors.get(zoneOf(entityId));
      if (!f || !f.offeredTo.includes(entityId)) return false;
      if (typeof speak !== 'string' || !speak) return false;
      f.claims.set(entityId, { speak, to });
      return true;
    },

    decline(entityId) {
      const f = floors.get(zoneOf(entityId));
      if (!f || !f.offeredTo.includes(entityId)) return false;
      // A direct address is a one-shot response opportunity. Explicitly
      // declining that addressed offer resolves the address just as surely as
      // speaking would. Ordinary open-floor declines must not erase unrelated
      // pending addresses, so this is gated by the offer's recorded reason.
      if (f.why.get(entityId) === 'addressed') pendingAddress.delete(entityId);
      f.declines.add(entityId);
      world.log.note(world.tick, 'floor_declined', { zone: f.zone, agent: entityId });
      return true;
    },

    all() {
      return zones.ids.filter((z) => floors.has(z)).map((z) => ({ ...floors.get(z) }));
    },

    floor(zoneId) {
      const f = floors.get(zoneId);
      return f ? { ...f } : null;
    },

    floorFor(entityId) {
      return this.floor(zoneOf(entityId));
    },

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

    /** Spent against the SOURCE zone's spell, never a target floor's lifetime. */
    spendNudge(observerId, sourceZone) {
      const f = floors.get(sourceZone);
      if (!f) return false;
      spent.add(`${observerId}|${sourceZone}|${f.socialSpell}`);
      return true;
    },

    nudgeSpent(observerId, sourceZone) {
      const f = floors.get(sourceZone);
      return f ? spent.has(`${observerId}|${sourceZone}|${f.socialSpell}`) : false;
    },

    rebuild() {
      for (const zoneId of [...floors.keys()]) close(zoneId);
      spoken.clear();
      pendingAddress.clear();
      opened.length = 0;
      factCursor = 0;
      this.tick();
    }
  };
}
