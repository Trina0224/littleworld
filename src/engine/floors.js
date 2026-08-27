/**
 * One offered conversational floor per zone.
 *
 * Implements docs/specs/engine/phase-3e-implementation-structure.md with
 * phase-3e-floor-clarifications.md, phase-3e-pre-floor-corrections.md, and
 * phase-3e-owner-latency-correction.md. The owner correction wins on offer
 * sequencing and latency: one Brain is asked at a time, and elapsed simulation
 * ticks never turn a pending Brain request into a decline.
 */
import { SOCIAL_FACTS } from './events.js';
import { SEAT } from './resources.js';
import { ANIMAL_ACTS } from './animals.js';

export const ACTS = {
  greet: { target: true, scope: 'normal' },
  reply: { target: true, scope: 'normal' },
  ask: { target: true, scope: 'normal', asks: true },
  change_topic: { target: true, scope: 'normal' },
  address_group: { target: false, scope: 'normal' },
  call_across: { target: true, scope: 'broadcast' },
  call_over: { target: true, scope: 'normal', animal: true },
  praise: { target: true, scope: 'normal', animal: true },
  shoo: { target: true, scope: 'normal', animal: true },
  nothing: { target: false, scope: null, silent: true }
};

export const DEFAULTS = {
  transcriptWindow: 12,
  speechLimit: 240,
  quietLimit: 1
};

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
const ASKED = 2000;
const OVERHEARD = 1500;
const ORDINARY = 1000;

export function createFloors(world, zones, perception, {
  minds, config = {}, weigh = null, makeContext = null, animals = null
} = {}) {
  if (minds === undefined) {
    throw new Error('createFloors needs an explicit `minds` set: who can hold a floor');
  }

  const cfg = { ...DEFAULTS, ...config };
  const llm = new Set(minds);
  const floors = new Map();
  const spoken = new Map();
  const pendingAddress = new Map();
  const spent = new Set();
  const recorded = new Set();
  const opened = [];
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

  function qualifiesPhysically(zoneId) {
    const here = occupants(zoneId);
    const mine = here.filter((id) => llm.has(id));
    if (mine.length >= 2) return true;
    if (mine.length === 0) return false;
    if (here.length > mine.length) return true;
    return pendingAddress.has(mine[0]);
  }

  /**
   * One optional invitation to notice/join an active neighboring conversation.
   *
   * The old implementation looked only at the last committed utterance's
   * historical heardBy list. That meant somebody who walked into earshot after
   * that line was spoken was invisible until another line happened. Social
   * opportunity is about current geometry, while transcript/perception remains
   * historical: moving close may create the nudge, but never grants words the
   * observer did not actually hear.
   */
  function nudgeSource(entityId) {
    const mine = zoneOf(entityId);
    if (!mine || qualifiesPhysically(mine)) return null;
    for (const zoneId of zones.ids) {
      if (zoneId === mine) continue;
      const f = floors.get(zoneId);
      if (!f || f.state === 'dormant' || f.lastSpeechTick === null || !f.lastSpeaker) continue;
      if (spent.has(`${entityId}|${zoneId}|${f.socialSpell}`)) continue;
      if (world.hearing.canHear(entityId, f.lastSpeaker, 'normal')) return zoneId;
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
      lastSpeechTick: null, lastSpeaker: null, addressed: null, openQuestion: null,
      offeredTo: [], offeredAt: null, why: new Map(), menus: new Map(),
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
      if (carriesLiveOffer(floors.get(zoneId), zoneId)) continue;
      close(zoneId);
    }
  }

  function registerAddress(e) {
    if (!e.to || !e.heardBy.includes(e.to) || !llm.has(e.to)) return;
    pendingAddress.set(e.to, { tick: e.t, from: e.agent, zone: e.zone ?? null, scope: e.scope });
  }

  function record(e, index) {
    if (!e.zone || recorded.has(index)) return;
    recorded.add(index);
    const list = spoken.get(e.zone) ?? [];
    list.push(index);
    spoken.set(e.zone, list);
    const f = floors.get(e.zone);
    if (!f) return;
    f.lastSpeechTick = e.t;
    f.lastSpeaker = e.agent;
    f.addressed = e.to && e.heardBy.includes(e.to) ? e.to : null;
  }

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
      if (!r || r.kind !== SEAT) return [];
      const z = zones.at(r.at[0], r.at[1]);
      return z ? [z] : [];
    }
    const z = zoneOf(e.agent);
    return z ? [z] : [];
  }

  function rankOf(f, entityId) {
    if (pendingAddress.has(entityId) || f.addressed === entityId) return ADDRESSED;
    if (f.openQuestion?.asker === entityId) return ASKED;
    if (nudgeSource(entityId)) return OVERHEARD;

    const situation = {
      zone: f.zone,
      participants: heads(f.zone).filter((id) => id !== entityId),
      quietRounds: f.quietRounds,
      roundIndex: f.round,
      lastSpeakerWasMe: f.lastSpeaker === entityId
    };
    return ORDINARY + (weigh ? weigh(entityId, situation) : 0);
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

  /**
   * Ask exactly one Brain. Simulation is allowed to take real wall-clock time;
   * there is no reason to pre-generate counterfactual replies just to hide
   * provider latency. If this character declines, the next tick offers the next
   * ranked eligible character in the same round.
   */
  function offer(f) {
    const candidates = ranked(f).filter((id) => !f.asked.has(id));
    if (!candidates.length) { endRound(f); return; }
    const id = candidates[0];
    f.offeredTo = [id];
    f.offeredAt = world.tick; // audit/debug metadata only; never an expiry clock
    f.state = 'offered';
    f.asked.add(id);
    const source = nudgeSource(id);
    const why = rankOf(f, id) === ADDRESSED ? 'addressed'
      : source ? 'overheard' : 'open_floor';
    if (why === 'overheard') spent.add(`${id}|${source}|${floors.get(source).socialSpell}`);
    const ctx = makeContext ? makeContext(id) : perception.contextFor(id);
    const menu = menuOf(id, ctx);
    f.epochs.set(id, ctx.epochId);
    f.why.set(id, why);
    f.menus.set(id, menu);
    ctx.forModel.choices = menu;
    opened.push({
      entityId: id, zone: f.zone, round: f.round, why,
      epochId: ctx.epochId, context: ctx, menu
    });
    world.log.note(world.tick, 'floor_offered', { zone: f.zone, agent: id, why });
  }

  function menuOf(entityId, ctx) {
    const mine = zoneOf(entityId);
    const menu = ['nothing'];
    let anyHere = false;
    for (const v of ctx.forModel.sensoryState.visible) {
      const target = ctx.refs.get(v.ref);
      if (!target) continue;
      if (animals?.knows(target)) {
        if (zoneOf(target) === mine) for (const act of ANIMAL_ACTS) menu.push(`${act}:${v.ref}`);
        continue;
      }
      if (!llm.has(target)) continue;
      if (zoneOf(target) === mine) {
        anyHere = true;
        for (const act of ['reply', 'ask', 'greet', 'change_topic']) menu.push(`${act}:${v.ref}`);
      } else if (world.hearing.canHear(target, entityId, 'broadcast')) {
        menu.push(`call_across:${v.ref}`);
      }
    }
    if (anyHere) menu.push('address_group');
    return menu;
  }

  function refuse(entityId, reason, pick) {
    world.log.note(world.tick, 'floor_refused', { agent: entityId, reason, pick });
    return { refused: reason };
  }

  function resolve(f) {
    const id = f.offeredTo[0];
    if (!id) return;
    const answered = f.claims.has(id) || f.declines.has(id);

    // No simulation-tick timeout here. A Brain that is still thinking has not
    // declined. 3F-B may later make an explicit infrastructure drop/cancel
    // decision, but provider wall-clock latency never authors social silence.
    if (!answered) return;

    const said = f.claims.get(id) ?? null;
    settleQuietly(id, f.epochs.get(id), true);
    f.epochs.delete(id);
    f.offeredTo = [];
    f.claims.clear();
    f.declines.clear();
    f.menus.clear();
    f.state = 'open';

    if (!said) return;
    pendingAddress.delete(id);

    world.say(id, said.speak, { scope: said.scope, to: said.target ?? null });
    const i = world.log.facts.length - 1;
    const committed = world.log.facts[i];
    if (said.animal) animals.respond(id, said.target, said.act, { scope: said.scope });

    if (said.asks && said.target && committed.heardBy.includes(said.target)) {
      f.openQuestion = { asker: id, asked: said.target, sinceTick: world.tick };
    } else if (said.act === 'reply') {
      for (const other of floors.values()) {
        if (other.openQuestion?.asked === id
            && other.openQuestion.asker === said.target) other.openQuestion = null;
      }
    }

    registerAddress(committed);
    record(committed, i);
    f.round += 1;
    f.quietRounds = 0;
    f.asked.clear();
  }

  return {
    config: cfg,

    tick() {
      // A direct-address opportunity is not aged out by simulation ticks. It is
      // cleared only when its physical participants cease to exist in this
      // scene; an outstanding Floor offer itself is protected by requalify().
      for (const [id, a] of [...pendingAddress.entries()].sort()) {
        if (!world.present(id) || !world.present(a.from)) pendingAddress.delete(id);
      }
      for (const f of floors.values()) {
        const q = f.openQuestion;
        if (q && !world.hearing.canHear(q.asked, q.asker, 'normal')) f.openQuestion = null;
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

    offers() {
      return opened.splice(0, opened.length);
    },

    commit(entityId, { pick, text = null } = {}) {
      const f = floors.get(zoneOf(entityId));
      if (!f || !f.offeredTo.includes(entityId)) {
        return refuse(entityId, 'no offer outstanding', pick);
      }
      if (!f.menus.get(entityId)?.includes(pick)) {
        return refuse(entityId, 'not a choice this offer supplied', pick);
      }
      const [name, ref] = String(pick).split(':');
      const act = ACTS[name];
      if (act.silent) { this.decline(entityId); return { act: name, spoken: false }; }

      const target = ref ? perception.resolve(f.epochs.get(entityId), ref) : null;
      if (act.target && !target) return refuse(entityId, 'a stale ref', pick);
      if (typeof text !== 'string' || !text.trim()) {
        return refuse(entityId, 'the act needs words and none arrived', pick);
      }
      f.claims.set(entityId, {
        act: name, target, scope: act.scope, asks: !!act.asks, animal: !!act.animal,
        speak: text.slice(0, cfg.speechLimit)
      });
      return { act: name, target, spoken: true };
    },

    menuFor(entityId) {
      const f = floors.get(zoneOf(entityId));
      return f?.menus.get(entityId)?.slice() ?? null;
    },

    decline(entityId) {
      const f = floors.get(zoneOf(entityId));
      if (!f || !f.offeredTo.includes(entityId)) return false;
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

    utterancesFor(entityId, limit = cfg.transcriptWindow) {
      if (!llm.has(entityId)) return [];
      const mine = zoneOf(entityId);
      const facts = world.log.facts;
      const seen = [];
      for (const [zoneId, list] of [...spoken.entries()].sort()) {
        for (const i of list) {
          const e = facts[i];
          if (e.agent !== entityId && !e.heardBy.includes(entityId)) continue;
          if (zoneId !== mine && e.agent !== entityId && e.to !== entityId) continue;
          seen.push({
            tick: e.t, speaker: e.agent, text: e.text,
            addressed: e.to ?? null, zone: zoneId
          });
        }
      }
      return seen.sort((a, b) => a.tick - b.tick || (a.speaker < b.speaker ? -1 : 1))
        .slice(-limit);
    },

    openQuestionIn(zoneId) {
      return floors.get(zoneId)?.openQuestion ?? null;
    },

    pendingAddressFor(entityId) {
      return pendingAddress.get(entityId) ?? null;
    },

    clearAddress(entityId) {
      return pendingAddress.delete(entityId);
    },

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
      recorded.clear();
      pendingAddress.clear();
      opened.length = 0;
      factCursor = 0;
      this.tick();
    }
  };
}