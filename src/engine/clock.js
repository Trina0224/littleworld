/**
 * World time.
 *
 * Time is an integer tick and nothing else. Seconds exist only where a human or
 * a renderer needs them, never inside simulation logic, and durations are
 * expressed in ticks. See world-engine-2.5.md section 4.0.
 *
 * The clock does not own the loop. Whoever drives the world - a Node timer, a
 * Phaser update, a test running as fast as it can - calls advance(). The clock
 * only counts.
 */
export function createClock({ tickDurationMs = 100 } = {}) {
  let tick = 0;
  return {
    get tick() {
      return tick;
    },
    tickDurationMs,
    advance() {
      return ++tick;
    },
    /** presentation only - never call this from simulation logic */
    toMillis(atTick = tick) {
      return atTick * tickDurationMs;
    }
  };
}
