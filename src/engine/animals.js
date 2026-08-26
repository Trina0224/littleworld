/**
 * What a deterministic actor does when somebody speaks to it.
 *
 * Implements phase-3e-implementation-structure.md 8 with
 * phase-3e-floor-clarifications.md 1 and 8.5.
 */

export const ANIMAL_ACTS = new Set(['call_over', 'praise', 'shoo']);

const BASE = { call_over: 0.15, praise: 1, shoo: 0.8 };

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

export function createAnimals(world, { table = new Map(), nearRange = 40 } = {}) {
  const familiarityOf = (animalId, speakerId) =>
    (table.get(animalId)?.bonds ?? []).find((b) => b.who === speakerId)?.familiarity ?? 0;

  function chance(animalId, speakerId, act) {
    const a = world.agents.get(animalId);
    const s = world.agents.get(speakerId);
    if (!a || !s) return 0;
    const gap = Math.hypot(a.at[0] - s.at[0], a.at[1] - s.at[1]);
    let p = (BASE[act] ?? 0) + 0.75 * familiarityOf(animalId, speakerId);
    if (gap > nearRange) p *= 0.6;
    if ((a.activity?.name ?? 'idle') !== 'idle') p *= 0.5;
    return Math.max(0, Math.min(1, p));
  }

  return {
    knows(animalId) {
      return table.has(animalId);
    },

    chance,

    respond(speakerId, animalId, act, { scope = 'normal' } = {}) {
      if (!ANIMAL_ACTS.has(act) || !table.has(animalId)) return null;
      let outcome = 'ignored';
      if (world.hearing.canHear(animalId, speakerId, scope)) {
        const roll = hash01(`${world.seed}:${world.tick}:${speakerId}:${act}:${animalId}`);
        if (roll < chance(animalId, speakerId, act)) outcome = 'complied';
      }
      if (outcome === 'complied' && act === 'call_over') {
        world.moveTo(animalId, world.agents.get(speakerId).at);
      }
      world.log.fact(world.tick, 'animal_responded', {
        animal: animalId, to: speakerId, act, outcome
      });
      return outcome;
    }
  };
}
