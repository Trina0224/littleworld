/**
 * Seeded random numbers.
 *
 * Nothing in the simulation may call Math.random. A run has one seed, the seed
 * is written into the fact stream, and re-running from it reproduces the run
 * exactly - which is what makes a bug reproducible and lets a test assert on a
 * whole run rather than on one step. See world-engine-2.5.md section 8.3.
 */
export function createRng(seed) {
  let state = seed >>> 0;
  return {
    seed,
    /** float in [0, 1) */
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    /** integer in [lo, hi] */
    int(lo, hi) {
      return lo + Math.floor(this.next() * (hi - lo + 1));
    },
    pick(list) {
      return list[this.int(0, list.length - 1)];
    }
  };
}
