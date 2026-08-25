/**
 * One tick, in the order the spec says.
 *
 * phase-3c-perception.md section 2 defines the canonical tick order, and until
 * now nothing implemented it: every scenario open-coded its own loop, and
 * perception was called by hand in a demo or not at all. That is the kind of gap
 * that does not hurt until a later phase quietly builds on a step that never
 * runs, so this is the one place that owns the order.
 *
 *     1  advance the integer world clock
 *     2  advance deterministic movement
 *     3  advance deterministic activities
 *     4  update reservations / occupancy / presence
 *     5  commit the resulting world facts
 *     6  refresh perception for each present agent
 *     7  decide whether any agent needs a Brain wakeup
 *     8  dispatch those requests asynchronously
 *
 * Steps 1-7 never wait for inference. Step 8 belongs to the scheduler in 3F and
 * is not here; `onWakeup` is where it will attach, and the contract is already
 * enforced by the shape - it is handed a list and its return value is ignored,
 * so there is nothing for a future implementer to await.
 *
 * Steps 4 and 5 are not separate calls. Reservations move because an activity
 * step moved them, presence moves because the day rolled over, and facts commit
 * as they happen rather than being flushed at the end of a tick. Naming them
 * anyway is deliberate: they are real stages of the tick even where no line of
 * code corresponds to them.
 *
 * The clock advances at the close rather than the open. That is the same order
 * entered at a different point, and it is the one that lets tick zero be
 * observed before any time passes - which is what makes the first frame of a
 * recording the world as it started rather than the world one tick in.
 *
 * WIRING PERCEPTION IN CANNOT CHANGE A FACT. Perception only reads the fact and
 * audit streams; it appends to neither. So adding step 6 to a loop that already
 * ran is guaranteed not to move a single byte of any recording, and loop.test.js
 * asserts exactly that rather than trusting the claim.
 */

export function createLoop({ world, runtime, perception = null, onWakeup = null }) {
  let seen = 0;

  /** facts committed since the last time anyone asked */
  function fresh() {
    const out = world.log.facts.slice(seen);
    seen = world.log.facts.length;
    return out;
  }

  return {
    /**
     * One tick. `onFrame(freshFacts, tick)` is called after the work and before
     * time moves, so a view fed from it sees the tick it is labelled with.
     */
    step({ onFrame } = {}) {
      world.stepMovement();                       // 2
      runtime.tick();                             // 3, and 4 and 5 as it goes
      if (perception) perception.tick();          // 6

      // 7. Who would need to think? The list is produced synchronously and the
      // return value is discarded, so a scheduler attaching here in 3F cannot
      // make the world wait for one.
      if (onWakeup) onWakeup(world.presentIds(), world.tick);

      if (onFrame) onFrame(fresh(), world.tick);
      world.advance();                            // 1, for the tick about to start
      return world.tick;
    },

    /**
     * Run to `untilTick`, then close the world.
     *
     * `beforeTick(tick)` is where a scenario injects intentions - the script in
     * run-3a, the sit-down rule in days.test. It is the seam between "what the
     * engine does" and "what this particular run is about".
     */
    run(untilTick, { onFrame, beforeTick } = {}) {
      while (world.tick < untilTick) {
        if (beforeTick) beforeTick(world.tick);
        this.step({ onFrame });
      }
      world.stop();
      if (onFrame) onFrame(fresh(), world.tick);
      return world;
    },

    /**
     * Run to the last tick of `untilTick` without stepping past it.
     *
     * Advancing all the way would enter a day the run never plays, log a
     * day_started for it, and leave a trailing frame on a tick that already had
     * one - which replay, driving one frame per tick, would not produce.
     */
    runInclusive(untilTick, { onFrame, beforeTick } = {}) {
      return this.run(untilTick - 1, { onFrame, beforeTick });
    }
  };
}
