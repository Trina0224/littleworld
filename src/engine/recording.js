/**
 * A finished run, saved whole.
 *
 * Implements docs/specs/engine/replay-presentation.md §7. The engine has been
 * passing `{ v, facts }` around since 3A, which is enough to replay a world and
 * not enough to explain one: a character mentions the weather, orders from a
 * menu, and the file that holds those sentences has to say what the weather and
 * the menu were or Replay is guessing at its own source.
 *
 * The privacy rule is the load-bearing one. Audit carries prompts, private
 * memory, canonical identity and refused proposals, so it is off unless somebody
 * asks for it, and a saved file says on its face whether it has any. A public
 * Replay must not leak an interior because an editor once had access to one.
 */

export const FORMAT = 1;

/**
 * @param world    the finished world
 * @param ambient  the run's ambient state (ambient.js), or null
 * @param menu     the cafe menu as it stood, or null
 * @param cast     opaque display metadata for the renderer - sprite boxes and
 *                 the like. The engine does not know what a sprite is and does
 *                 not look inside this.
 * @param audit    true to include the private stream. Off by default, on
 *                 purpose, and recorded either way.
 */
export function saveRecording(world, { ambient = null, menu = null, cast = null,
                                       audit = false, notes = null } = {}) {
  const { v, facts } = world.log.recording();
  return {
    format: FORMAT,
    events: v,                        // the fact schema version 3A already had
    seed: world.seed,
    tickDurationMs: world.clock?.tickDurationMs ?? 100,
    ticksPerDay: world.clock?.ticksPerDay ?? 0,
    lastTick: facts.length ? facts[facts.length - 1].t : 0,
    ambient,
    menu: menu ? {
      venue: menu.venue ?? null,
      venueName: menu.venueName ?? null,
      serviceTimeScale: menu.serviceTimeScale ?? null,
      // What was actually sellable, which is what explains the legal choices.
      items: menu.items.map((i) => ({
        id: i.id, name: i.name, price: i.price, prepTicks: i.prepTicks,
        ...(i.available === false ? { available: false } : {})
      }))
    } : null,
    cast,
    ...(notes ? { notes } : {}),
    private: !!audit,
    facts,
    ...(audit ? { audit: world.log.audit } : {})
  };
}

/** Read one back, and refuse one this build cannot honestly play. */
export function loadRecording(json) {
  const r = typeof json === 'string' ? JSON.parse(json) : json;
  if (!r || typeof r !== 'object') throw new Error('not a recording');
  if (r.format !== FORMAT) {
    throw new Error(`recording format ${r.format}, this build reads ${FORMAT}`);
  }
  if (!Array.isArray(r.facts)) throw new Error('a recording with no facts');
  for (let i = 1; i < r.facts.length; i += 1) {
    // Out-of-order facts would make every source index Replay hands out a lie.
    if (r.facts[i].t < r.facts[i - 1].t) throw new Error(`facts out of order at ${i}`);
  }
  return r;
}

/**
 * Drop the private half. A file that has been through this can be published,
 * and says so.
 */
export function publicOnly(recording) {
  const { audit, ...rest } = recording;
  void audit;
  return { ...rest, private: false };
}
