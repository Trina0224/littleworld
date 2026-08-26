/**
 * The social vector, turned into a number.
 *
 * Implements social-personality.md 6.1 and phase-3e-floor-clarifications.md 5.
 * Pure: no clock, no rng, no world, no memory, no mutation. Its consumers are
 * the offer ranking and the test that proves the cast stays asymmetric.
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

  // High inhibition suppresses unsolicited approaches, and more so with someone
  // the character does not know. A low value is a permission not to act, never
  // a defect to be repaired (social-personality.md 6.1).
  w -= (withStranger ? 90 : 45) * mid(traits, 'socialInhibition');

  // A silence somebody has to rescue is where conversationDrive earns its place.
  w += Math.min(quietRounds, 3) * 25 * mid(traits, 'conversationDrive');

  // Having just spoken makes you a little less eligible, unless persistence says
  // one weak response is not a reason to stop.
  if (lastSpeakerWasMe) w -= 30 * (1 - mid(traits, 'persistence'));

  void roundIndex;
  return Math.round(w * 100) / 100;
}

export { AXES };
