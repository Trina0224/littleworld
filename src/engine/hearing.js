/**
 * How far a voice carries.
 *
 * This is physics, not perception policy, and the difference decides where it
 * lives. Whether an utterance reached somebody is a property of the world at the
 * moment it was said; what that person made of it is theirs. So the predicate
 * belongs to the World Engine, and every consumer asks the same object.
 *
 * It was perception's private function until 3E needed it in two more places -
 * committing the audience onto the speech fact, and rendering a conversation
 * transcript per observer. Two implementations of one audibility test is where
 * drift hides, the same way it would have with zone containment, so there is
 * exactly one (phase-3e-floor-clarifications.md 7, 8.1).
 *
 * THE ANSWER IS COMMITTED, NOT RECOMPUTED. `world.say` stamps `heardBy` onto the
 * fact while everyone is still standing where they were standing. Nothing can
 * work it out afterwards: it depends on positions at that tick, and recovering
 * those means replaying movement, which is re-simulation and is forbidden. So
 * the fact carries it and perception reads it rather than asking again.
 */

export const HEARING_DEFAULTS = {
  // Checked against the real anchors: the counter to the near table is 48 units
  // and audible; the counter to the far table is 78 and is not, which is what
  // makes a carrying voice worth having.
  hearingRange: 70,
  soundRange: 140          // far enough to notice a voice, not to make out words
};

/**
 * @param scene  { present(id), positionOf(id), ids() } - the world's own view of
 *               who is here and where. Not the world object, so this module
 *               cannot grow a dependency on anything but position and presence.
 */
export function createHearing(scene, config = {}) {
  const cfg = { ...HEARING_DEFAULTS };
  // Explicit rather than a spread: a caller passing `{ hearingRange: undefined }`
  // because its own parameter was omitted must not erase the default.
  for (const [k, v] of Object.entries(config)) if (v !== undefined) cfg[k] = v;

  function gap(a, b) {
    const pa = scene.positionOf(a);
    const pb = scene.positionOf(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  }

  return {
    config: cfg,

    /**
     * Pure query. Same inputs, same answer, no side effects, no clock, no rng.
     *
     * `scope` is a transport mode derived from the social act, never chosen by a
     * model (phase-3c-venue-interactions.md 2).
     */
    canHear(observerId, speakerId, scope) {
      if (observerId === speakerId) return false;      // heardBy is who ELSE heard
      if (!scene.present(observerId)) return false;
      if (!scene.present(speakerId)) return false;
      if (scope === 'broadcast') return true;          // scene-wide, for this small venue
      return gap(observerId, speakerId) <= cfg.hearingRange;
    },

    /** Everyone who heard it, sorted - order must never change a result. */
    audience(speakerId, scope) {
      return scene.ids().filter((id) => this.canHear(id, speakerId, scope)).sort();
    }
  };
}
