/**
 * The social vector, turned into a number.
 *
 * Implements social-personality.md 6.1 and phase-3e-floor-clarifications.md 5.
 * socialWeight itself is pure: no clock, rng, world, memory, or mutation.
 */

const AXES = [
  'initiative', 'conversationDrive', 'curiosity', 'questionTendency',
  'talkativeness', 'socialInhibition', 'persistence', 'responsiveness',
  'selfDisclosure', 'topicSwitching'
];

const mid = (traits, key) => (typeof traits?.[key] === 'number' ? traits[key] : 0.5);

/**
 * @param situation {{ withStranger, quietRounds, roundIndex, lastSpeakerWasMe }}
 * @returns a number, larger meaning more eligible for an open floor.
 */
export function socialWeight(traits, situation = {}) {
  const {
    withStranger = false, quietRounds = 0, roundIndex = 0, lastSpeakerWasMe = false
  } = situation;

  let w = 100 * mid(traits, 'initiative');
  w += 60 * mid(traits, 'conversationDrive');
  w += 20 * mid(traits, 'talkativeness');

  w -= (withStranger ? 90 : 45) * mid(traits, 'socialInhibition');
  w += Math.min(quietRounds, 3) * 25 * mid(traits, 'conversationDrive');

  if (lastSpeakerWasMe) w -= 30 * (1 - mid(traits, 'persistence'));

  void roundIndex;
  return Math.round(w * 100) / 100;
}

/**
 * Bridge between the Floor's structural situation and the pure weight.
 *
 * Floors deliberately do not know private memory. They pass participant ids;
 * this adapter is the one place allowed to ask whether those people are known
 * to this observer, then reduces that to the boolean socialWeight needs.
 *
 * traitsFor may be a function or a Map. `memory` is optional; without it the
 * adapter makes no stranger claim rather than guessing.
 */
export function createSocialWeigher({ traitsFor, memory = null } = {}) {
  const traits = typeof traitsFor === 'function'
    ? traitsFor
    : (id) => traitsFor?.get?.(id) ?? null;

  return (entityId, situation = {}) => {
    const participants = Array.isArray(situation.participants) ? situation.participants : [];
    const withStranger = memory
      ? participants.some((otherId) => !memory.recall(entityId, otherId))
      : false;

    return socialWeight(traits(entityId), {
      withStranger,
      quietRounds: situation.quietRounds ?? 0,
      roundIndex: situation.roundIndex ?? situation.round ?? 0,
      lastSpeakerWasMe: !!situation.lastSpeakerWasMe
    });
  };
}

export { AXES };
