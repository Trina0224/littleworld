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
 * How long a line this character is allowed. A rule, replaced by a fact: 240
 * characters for everybody truncated 星さん mid-word on her first real turn and
 * would never have bound on 渡辺 at all. Derived from `talkativeness`, so the
 * budget IS the difference between somebody who runs on and somebody who says
 * one sentence. 0.5 lands on 240, which is what the old flat limit really was:
 * the average person's budget applied to the whole cast.
 */
export const SPEECH = { min: 30, span: 420 };

export function speechBudget(traits, config = {}) {
  const { min, span } = { ...SPEECH, ...config };
  return Math.round(min + span * mid(traits, 'talkativeness'));
}

/**
 * How hard it is for this person to sit through a conversation without being
 * asked. Not a fairness dial: it is what decides whether waiting ever becomes
 * enough to cut into an exchange between two other people.
 */
// Measured over five 3000-tick runs of the full cast. The sweep shows a plateau
// rather than a peak: anywhere from 140 to 420 gives the same flattened voice
// distribution (top3 0.57 against 0.62 with no waiting at all) and the same
// loudest-quietest-character. 280 sits in the middle of it. Bigger is NOT
// better - by 840 the room is measurably LESS fair than with no term at all
// (top3 0.66), because the term scales with eagerness, so a large step
// amplifies whoever was already talking instead of rescuing whoever was not.
const WAIT_STEP = 280;
const WAIT_CAP = 20;

function eagerness(traits) {
  const e = 0.6 * mid(traits, 'initiative')
          + 0.4 * mid(traits, 'conversationDrive')
          - 0.5 * mid(traits, 'socialInhibition');
  return Math.max(0, Math.min(1, e));
}

/**
 * @param situation {{ withStranger, quietRounds, roundIndex, roundsWaited,
 *                     lastSpeakerWasMe }}
 * @returns a number, larger meaning more eligible for an open floor.
 */
export function socialWeight(traits, situation = {}) {
  const {
    withStranger = false, quietRounds = 0, roundIndex = 0, roundsWaited = 0,
    lastSpeakerWasMe = false
  } = situation;

  let w = 100 * mid(traits, 'initiative');
  w += 60 * mid(traits, 'conversationDrive');
  w += 20 * mid(traits, 'talkativeness');

  w -= (withStranger ? 90 : 45) * mid(traits, 'socialInhibition');
  w += Math.min(quietRounds, 3) * 25 * mid(traits, 'conversationDrive');

  if (lastSpeakerWasMe) w -= 30 * (1 - mid(traits, 'persistence'));

  // Rounds spent in this conversation without once being asked. Large enough to
  // overtake a direct addressee eventually, and scaled by the character's own
  // eagerness - so 星さん cuts in after a few exchanges, 澄子 after many, and
  // 渡辺 not at all. The first real Brain run had a man sit through six rounds
  // at the same table without being asked a single time, because two people
  // answering each other restarts the round forever. Being asked and saying no
  // is the design; never being asked is not silence, it is absence.
  w += Math.min(roundsWaited, WAIT_CAP) * WAIT_STEP * eagerness(traits);

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
      roundsWaited: situation.roundsWaited ?? 0,
      lastSpeakerWasMe: !!situation.lastSpeakerWasMe
    });
  };
}

export { AXES, WAIT_STEP, WAIT_CAP, eagerness };
