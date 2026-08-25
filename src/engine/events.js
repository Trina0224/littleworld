/**
 * Two streams, and the difference between them is load-bearing.
 *
 * FACTS are committed world state transitions - seat_reserved, seat_occupied.
 * The renderer and replay read this stream and nothing else. A fact carries
 * what a viewer needs, so replay is playback rather than re-simulation.
 *
 * AUDIT is why - intentions, proposals, refusals, anything that explains a
 * decision without being one. Debugging reads it. The renderer may not.
 *
 * Perception has exactly one narrow claim on it, and only from 3C onward: an agent
 * may learn that its OWN attempt failed, because a failed attempt changed nothing
 * and so is not a fact. That reaches the acting agent alone and never another
 * observer, and it does not widen what the renderer or replay may read by one
 * field. See phase-3c-perception.md 12.1.
 *
 * Keeping both in one stream looks harmless and leaves replay quietly undecided
 * between re-executing commands and playing back what happened. Those are
 * different systems, and the ambiguity only surfaces once a command would
 * produce a different result than when it was recorded. See section 8.2.
 */
export const EVENT_SCHEMA_VERSION = 1;

export function createRecorder() {
  const facts = [];
  const audit = [];
  return {
    facts,
    audit,
    /** a committed world state transition */
    fact(t, type, data = {}) {
      const e = { v: EVENT_SCHEMA_VERSION, t, type, ...data };
      facts.push(e);
      return e;
    },
    /** why something was attempted, refused, or chosen */
    note(t, type, data = {}) {
      const e = { v: EVENT_SCHEMA_VERSION, t, type, ...data };
      audit.push(e);
      return e;
    },
    /** what a replay reads: facts only, plus what it needs to trust them */
    recording() {
      return { v: EVENT_SCHEMA_VERSION, facts };
    }
  };
}
