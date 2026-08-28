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
 * How hard it is for this person to sit through an exchange they are not part
 * of. Not a fairness dial and NOT a ranking term: it decides only how long
 * somebody waits before the Floor offers them a chance to come in at an
 * exchange boundary. See phase-3e-brain-grounding-and-interject.md 2.
 */
const PATIENCE_MIN = 2;
const PATIENCE_SPAN = 28;

export function eagerness(traits) {
  const e = 0.6 * mid(traits, 'initiative')
          + 0.4 * mid(traits, 'conversationDrive')
          - 0.5 * mid(traits, 'socialInhibition');
  return Math.max(0, Math.min(1, e));
}

/**
 * Rounds this person can sit through an exchange before they would want in.
 * 星さん 5, 澄子 20, 渡辺 30 - the asymmetry the cast is written for. The floor
 * of 2 is deliberate: 2.2 says being quiet must be the character's decision,
 * so even the most withdrawn character is eventually ASKED. What they do with
 * the chance is theirs.
 */
export function interjectPatience(traits) {
  return Math.round(PATIENCE_MIN + PATIENCE_SPAN * (1 - eagerness(traits)));
}

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

  // No waiting term. It used to live here and was able to overtake a direct
  // addressee, which is conversational causality rather than a score - see
  // phase-3e-brain-grounding-and-interject.md 1.2. Waiting is now an
  // eligibility signal for interjection at an exchange boundary, and nothing
  // this function returns can move somebody across a class boundary.
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
