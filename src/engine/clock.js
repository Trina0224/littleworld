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
 *
 * A day is a whole number of ticks, so `day` is integer division and nothing
 * else. It exists because two characters are defined by not being here every
 * day, and absence needs something to be absent from. It is not a calendar:
 * there are no dates, months or weekdays, and adding them would be a decision
 * about the world rather than about time.
 */
export function createClock({ tickDurationMs = 100, ticksPerDay = 0 } = {}) {
  let tick = 0;
  return {
    get tick() {
      return tick;
    },
    /** which day `tick` falls in; always 0 when the world has no days */
    get day() {
      return ticksPerDay > 0 ? Math.floor(tick / ticksPerDay) : 0;
    },
    tickDurationMs,
    ticksPerDay,
    advance() {
      return ++tick;
    },
    /** presentation only - never call this from simulation logic */
    toMillis(atTick = tick) {
      return atTick * tickDurationMs;
    }
  };
}
