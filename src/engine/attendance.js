/**
 * Who is here today.
 *
 * Two people in the cast are defined by not always being here: the old man from
 * the main shop looks in every so often, and the retired stationmaster comes
 * every few days because the place is lively. Everyone else is a fixture. Until
 * now the world had no way to express that at all - an agent existed or it did
 * not, and there was no day for it to be absent from.
 *
 * Two decisions worth the words:
 *
 * A HABIT, NOT DICE. Attendance is periodic - present when the day lands on the
 * agent's phase - rather than a per-day coin flip. A coin clusters: a character
 * meant to appear "every few days" would sometimes vanish for a fortnight and
 * sometimes turn up four days running. More to the point, a retired man who
 * drops in every few days is keeping a habit, not rolling a die, so the
 * periodic model is the more truthful one as well as the better behaved one.
 *
 * NOT DRAWN FROM THE WORLD'S RNG. createRng gives a stream, and a stream's
 * values depend on how many times anyone else has drawn from it. Deciding
 * attendance that way would make adding one agent to the cast silently reshuffle
 * everybody else's schedule. So this hashes (seed, agentId) instead: the same
 * agent on the same day of the same seed always gets the same answer, whatever
 * else the run contains. Determinism for a whole run is what the rng is for;
 * this needs stability under change, which is a different property.
 */

/** FNV-1a over the string, then a final avalanche, as a float in [0, 1). */
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

/** Which day of the cycle this agent turns up on. Depends on the agent, not the day. */
export function phase(seed, agentId, every) {
  if (every <= 1) return 0;
  return Math.floor(hash01(`${seed}:${agentId}`) * every);
}

/**
 * Is this agent here on this day?
 *
 * `{ every: 1 }` - or no policy at all - means every day, which is what the
 * whole cast was before this existed.
 */
export function attends(seed, day, agentId, policy = null) {
  const every = policy?.every ?? 1;
  if (every <= 1) return true;
  return (day + phase(seed, agentId, every)) % every === 0;
}
