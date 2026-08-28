/**
 * What a character knows about itself without having to look.
 *
 * Implements docs/specs/engine/phase-3e-brain-grounding-and-interject.md §3.
 * The first real Brain run committed invented physical claims - a walk from the
 * park, a frayed sleeve - because the package described everybody else's
 * position and said nothing about the observer's own. A model asked to speak as
 * a person supplies what a person would know; the invention was the hole, not
 * the model.
 *
 * Observer truth, not omniscience (§3.1): authoritative facts about this body,
 * and nothing about anybody else's state, no canonical name the observer has
 * not learned, no author material, no hidden world fact.
 *
 * And no fake precision (§3.3). If the world only knows somebody is at the near
 * table, that is what it says - no chair number, no clock time invented out of
 * a tick.
 */
import { SEAT, OCCUPIED, RESERVED } from './resources.js';

/** Why the Floor is asking, in words the character would use. */
export const REASONS = {
  addressed: '有人剛剛直接對你說話。',
  interject: '旁邊兩個人講完一段了。你一直坐在這裡沒開口，現在插得進去。',
  overheard: '你聽見旁邊有人在講話，你可以選擇加入，也可以不要。',
  open_floor: '這裡現在沒有人在說話。你可以開口，也可以不開口。'
};

// The daypart is AUTHORED, never computed. LittleWorld has no day/night cycle
// in the MVP: `ticksPerDay` is attendance bookkeeping, not the sun, so deriving
// morning/evening/night from tick fraction would be a clock the world does not
// have - and a long run would tell a character darkness had arrived.
// phase-3f.md §1 and §5.
export const DEFAULTS = { daypart: '午後' };

/**
 * @param ambient the run's ambient state (ambient.js), whose authored daypart
 *                wins over the local default. Optional so the low-level tests
 *                can build grounding without a whole world bootstrap.
 */
export function createGrounding(world, zones, { config = {}, ambient = null, cafe = null } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const daypart = () => ambient?.daypart ?? cfg.daypart;

  function seatUnder(agent) {
    if (!agent.holding) return null;
    const r = world.resource(agent.holding);
    if (!r || r.holder !== agent.id) return null;
    if (r.state !== OCCUPIED && r.state !== RESERVED) return null;
    return r;
  }

  return {
    config: cfg,

    /**
     * @returns the self section of a Brain package, or null for somebody who is
     *          not in the scene. `why` is the Floor's own reason, which is part
     *          of grounding: a character knows whether it was spoken to.
     */
    self(entityId, { why = null } = {}) {
      const agent = world.agents.get(entityId);
      if (!agent || !world.present(entityId)) return null;

      const zone = zones.at(agent.at[0], agent.at[1]);
      const held = seatUnder(agent);
      const walking = world.walking(entityId);
      const activity = agent.activity?.name && agent.activity.name !== 'idle'
        ? agent.activity.name : null;

      const self = {
        where: zone ? zones.label(zone) : '這附近',
        posture: walking ? '正在走過去'
          : held && held.kind === SEAT && held.state === OCCUPIED ? '坐著'
            : '站著',
        time: daypart()
      };
      // Only when there is something to say. A station is worth naming because
      // standing behind a counter is a fact about what you are doing; a seat is
      // already the posture.
      if (held && held.kind !== SEAT) self.at = zones.label(zones.at(held.at[0], held.at[1]));
      if (activity) self.doing = activity;
      // Cafe etiquette as something the character notices, not as a rule fired
      // at them: 「you have been sitting a while」 is a fact about this body in
      // this room, which is what grounding is for.
      const owes = cafe?.obligationFor(entityId);
      if (owes) self.noticing = owes;
      if (why) self.askedBecause = REASONS[why] ?? why;
      return self;
    }
  };
}
