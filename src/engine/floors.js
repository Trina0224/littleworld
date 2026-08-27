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
  // Measured, not guessed - docs/specs/engine/phase-3e-tuning.md.
  transcriptWindow: 8,     // the spec's own lower bound; a third off the suffix
  // The fallback and the hard ceiling, not the budget: a character's own budget
  // comes from its talkativeness through `budgetFor`. See phase-3e-tuning.md 4
  // and notes/pre-3f-brain-findings.md 1.
  speechLimit: 480,
  quietLimit: 1,           // 57 conversations, median 19 lines, 31% quiet
  // How many acts one utterance may carry. Two, because answering somebody and
  // calling the dog in the same breath is what a person does - the first real
  // Brain run had a boy smuggle 「ハナ、おいで」 into a reply, and the dog was
  // never called. See notes/pre-3f-brain-findings.md 3.
  actLimit: 2
};

/**
 * Cut a line that came back over budget - at the end of a sentence if there is
 * one, never in the middle of a word. The first real Brain run committed
 *「…脱いでお」and told nobody; a line cut at an arbitrary character is not a
 * shorter sentence, it is a broken one.
 */
const SENTENCE_END = /[。！？!?」』）\)]/g;

export function trimSpeech(text, budget) {
  if (text.length <= budget) return text;
  let cut = 0;
  SENTENCE_END.lastIndex = 0;
  for (let m = SENTENCE_END.exec(text); m; m = SENTENCE_END.exec(text)) {
    if (m.index + 1 > budget) break;
    cut = m.index + 1;
  }
  return cut > 0 ? text.slice(0, cut) : text.slice(0, budget);
}

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
  minds, config = {}, weigh = null, makeContext = null, animals = null,
  budgetFor = null
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
  // Is there an outside conversation this person can hear and has not yet been
  // nudged about? Says nothing about whether they are free to be nudged - that
  // is the caller's question, and keeping them apart is what stops the answer
  // depending on the order the two are asked in.
  function nudgeSource(entityId) {
    const mine = zoneOf(entityId);
    if (!mine) return null;
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
      lastSpeechTick: null, lastSpeaker: null, addressed: [], openQuestion: null,
      nudgedFor: new Map(),
      offeredTo: [], offeredAt: null, why: new Map(), menus: new Map(),
      asked: new Set(), claims: new Map(), declines: new Set(), epochs: new Map(),
      // Waiting is counted from the start of THIS conversation. Both halves
      // matter: without the map nobody accumulates at all, and without the
      // start round a re-armed floor counts everybody as having waited since
      // round zero and hands the whole room the maximum bonus at once - which
      // makes a direct address ignorable.
      spellStartRound: 0,
      lastOffered: new Map()   // entityId -> the round it was last offered in
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
    // Waiting restarts with the conversation. Only the start round is moved:
    // clearing lastOffered as well was tried and could not be shown to change
    // anything, because by the time a floor sleeps everyone present has been
    // offered at least once and their entries are already at the current round.
    // One gate, not two.
    f.spellStartRound = f.round;
    world.log.note(world.tick, 'floor_rearmed', { zone: f.zone, spell });
  }

  function carriesLiveOffer(f, zoneId) {
    return f.offeredTo.some((id) => f.why.get(id) !== 'open_floor' && zoneOf(id) === zoneId);
  }

  /**
   * A conversation somebody here can hear but is not part of is worth one look
   * up. The nudge is spent HERE - when it buys the chance - rather than when the
   * offer is built: by then the floor has been woken or created for it and no
   * longer looks like somewhere nobody was talking, so spending it there depends
   * on the order two questions are asked in.
   *
   * Only for a floor that is asleep or has never had a word said on it. Somebody
   * already in a conversation is not looking for another one.
   */
  function settleNudges() {
    for (const zoneId of zones.ids) {
      const f = floors.get(zoneId);
      if (!f || (f.state !== 'dormant' && f.lastSpeechTick !== null)) continue;
      let woke = false;
      for (const id of heads(zoneId)) {
        const source = nudgeSource(id);
        if (!source || f.nudgedFor.has(id)) continue;
        spent.add(`${id}|${source}|${floors.get(source).socialSpell}`);
        f.nudgedFor.set(id, source);
        woke = true;
      }
      if (woke && f.state === 'dormant') rearm(f);
    }
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
    for (const target of e.to) {
      if (!e.heardBy.includes(target) || !llm.has(target)) continue;
      pendingAddress.set(target, {
        tick: e.t, from: e.agent, zone: e.zone ?? null, scope: e.scope
      });
    }
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
    f.addressed = e.to.filter((id) => e.heardBy.includes(id));
  }

  function rearmedBy(e) {
    if (!SOCIAL_FACTS.has(e.type)) return [];
    if (e.type === 'speech_said') {
      // No separate pass over e.to. It cannot reach a room these two do not:
      // menuOf only offers a normal-scope act toward somebody in the speaker's
      // own zone, and a cross-zone act is call_across, which is broadcast. If
      // the menu ever offers a quiet act across a zone boundary, this is the
      // line that has to come back.
      const out = new Set();
      if (e.scope === 'broadcast') for (const id of e.heardBy) { const z = zoneOf(id); if (z) out.add(z); }
      if (e.zone) out.add(e.zone);
      return [...out].sort();
    }
    // Walking into a room is how somebody joins it: agent_arrived is only for
    // coming into the SCENE. One fact per move rather than per step, so this is
    // a new social situation rather than the machinery §4 excludes. Setting off
    // is deliberately not social - a room that somebody just left does not need
    // waking to be told so.
    if (e.type === 'move_completed') {
      const z = zones.at(e.at[0], e.at[1]);
      return z ? [z] : [];
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

  function classOf(f, entityId) {
    if (pendingAddress.has(entityId) || f.addressed.includes(entityId)) return ADDRESSED;
    if (f.openQuestion?.asker === entityId) return ASKED;
    if (f.nudgedFor.has(entityId)) return OVERHEARD;
    return ORDINARY;
  }

  /**
   * The class decides who comes first; personality decides everything within it
   * AND, through the waiting term, whether somebody who has never been asked
   * eventually overtakes a pair answering each other. Personality is added to
   * every class rather than only to the ordinary one, because otherwise the
   * addressee's privilege is absolute and the round restarts forever.
   */
  function rankOf(f, entityId) {
    const situation = {
      zone: f.zone,
      participants: heads(f.zone).filter((id) => id !== entityId),
      quietRounds: f.quietRounds,
      roundIndex: f.round,
      roundsWaited: f.round - (f.lastOffered.get(entityId) ?? f.spellStartRound),
      lastSpeakerWasMe: f.lastSpeaker === entityId
    };
    return classOf(f, entityId) + (weigh ? weigh(entityId, situation) : 0);
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
    f.nudgedFor.clear();
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
    const why = classOf(f, id) === ADDRESSED ? 'addressed'
      : f.nudgedFor.has(id) ? 'overheard' : 'open_floor';
    f.lastOffered.set(id, f.round);
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

    // The one thing that DOES invalidate a pending request: the world changed
    // under it. A character who walked out of this zone is not still thinking
    // about its floor, and without this the floor waits on them forever - the
    // whole zone stops conversing and a perception context is never given back.
    if (zoneOf(id) !== f.zone) {
      settleQuietly(id, f.epochs.get(id), false);    // never used, so still owed
      f.epochs.delete(id);
      f.menus.delete(id);
      f.claims.delete(id);
      f.declines.delete(id);
      f.offeredTo = [];
      f.state = 'open';
      world.log.note(world.tick, 'floor_cancelled', { zone: f.zone, agent: id, reason: 'left' });
      return;
    }

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

    world.say(id, said.speak, {
      scope: said.scope, to: said.acts.map((a) => a.target).filter(Boolean)
    });
    const i = world.log.facts.length - 1;
    const committed = world.log.facts[i];

    for (const a of said.acts) {
      if (a.animal) animals.respond(id, a.target, a.act, { scope: said.scope });
      if (a.asks && a.target && committed.heardBy.includes(a.target)) {
        f.openQuestion = { asker: id, asked: a.target, sinceTick: world.tick };
      } else if (a.act === 'reply') {
        for (const other of floors.values()) {
          if (other.openQuestion?.asked === id
              && other.openQuestion.asker === a.target) other.openQuestion = null;
        }
      }
    }

    registerAddress(committed);
    record(committed, i);
    f.round += 1;
    f.quietRounds = 0;
    f.asked.clear();
    f.nudgedFor.clear();
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
      // A conversation somebody here can hear but is not part of wakes this
      // floor once - the nudge is already spent per observer and source spell,
      // so a lively neighbour cannot poll a quiet table line after line.
      settleNudges();

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

    /**
     * One utterance may carry more than one act - answering a neighbour and
     * calling the dog in the same breath is one thing said, not two. `picks`
     * takes the list; `pick` remains the shorthand for the ordinary single act.
     *
     * The constraint that cannot be relaxed is volume: an utterance has ONE
     * scope, so a quiet remark cannot be welded to a shout across the room
     * without changing who heard the whole line.
     */
    commit(entityId, { pick, picks, text = null } = {}) {
      const chosen = picks ?? (pick === undefined ? [] : [pick]);
      const f = floors.get(zoneOf(entityId));
      const shown = chosen.join(' + ');
      if (!f || !f.offeredTo.includes(entityId)) {
        return refuse(entityId, 'no offer outstanding', shown);
      }
      if (!chosen.length) return refuse(entityId, 'no choice arrived', shown);
      if (chosen.length > cfg.actLimit) {
        return refuse(entityId, `more than ${cfg.actLimit} acts in one breath`, shown);
      }
      const menu = f.menus.get(entityId) ?? [];
      if (!chosen.every((c) => menu.includes(c))) {
        return refuse(entityId, 'not a choice this offer supplied', shown);
      }
      // No separate check for the same choice twice: for anything with a
      // target the same-person check below already refuses it, and for a remark
      // to the room repeating it commits the same single utterance either way.
      // It could not be shown to change behaviour.

      const parsed = chosen.map((c) => {
        const [name, ref] = String(c).split(':');
        return { name, ref, ...ACTS[name] };
      });

      if (parsed.some((a) => a.silent)) {
        if (parsed.length > 1) return refuse(entityId, 'saying nothing is not half an act', shown);
        this.decline(entityId);
        return { act: parsed[0].name, spoken: false };
      }
      // One utterance, one volume. Broadcast reaches further than normal, so a
      // pair sharing a line would have to pick one - and either choice changes
      // who heard the other half.
      if (new Set(parsed.map((a) => a.scope)).size > 1) {
        return refuse(entityId, 'one breath cannot be two volumes', shown);
      }
      // No separate rule against a shout carrying a passenger. Mixing a shout
      // with a quiet remark is already refused above, and two shouts in one
      // breath -「澄子さん、小野さん！」- is a thing people do. The guard that
      // was here could not be shown to change any behaviour the volume check
      // did not already cover.
      // The floor holds one open question. Two in one breath would silently
      // lose one of them, which is worse than refusing.
      if (parsed.filter((a) => a.asks).length > 1) {
        return refuse(entityId, 'two questions in one breath', shown);
      }

      for (const a of parsed) {
        a.target = a.ref ? perception.resolve(f.epochs.get(entityId), a.ref) : null;
        if (a.target === undefined) a.target = null;
        if (ACTS[a.name].target && !a.target) return refuse(entityId, 'a stale ref', shown);
      }
      const aimed = parsed.map((a) => a.target).filter(Boolean);
      if (new Set(aimed).size !== aimed.length) {
        return refuse(entityId, 'two acts aimed at the same person', shown);
      }
      if (typeof text !== 'string' || !text.trim()) {
        return refuse(entityId, 'the act needs words and none arrived', shown);
      }

      const budget = Math.min(budgetFor?.(entityId) ?? cfg.speechLimit, cfg.speechLimit);
      const speak = trimSpeech(text, budget);
      if (speak.length < text.length) {
        world.log.note(world.tick, 'speech_trimmed', {
          agent: entityId, budget, sent: text.length, kept: speak.length
        });
      }
      f.claims.set(entityId, {
        acts: parsed.map((a) => ({
          act: a.name, target: a.target, asks: !!a.asks, animal: !!a.animal
        })),
        scope: parsed[0].scope,   // all equal: the volume check above saw to it
        speak
      });
      return { acts: parsed.map((a) => a.name), targets: aimed, spoken: true };
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
          addressed: e.to, heardBy: e.heardBy
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
          if (zoneId !== mine && e.agent !== entityId && !e.to.includes(entityId)) continue;
          seen.push({
            tick: e.t, speaker: e.agent, text: e.text,
            addressed: e.to, zone: zoneId
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