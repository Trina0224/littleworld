/**
 * The property that is easy to lose: smoothing must not undo the routing.
 *
 *     node src/engine/nav.test.js
 *
 * A* charges backstage cells a multiplier and walks around them. String pulling
 * asks "can I walk straight from here to there instead", and if it asks only
 * about walkability the answer is yes straight through the cells A* just paid
 * to avoid - a path that looks smoother and ignores the weighting entirely.
 * The check below fails on that and passes on cost-aware smoothing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createNav } from './nav.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function pack(w, h, fn) {
  const bits = new Uint8Array(Math.ceil((w * h) / 8));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!fn(x, y)) continue;
      const i = y * w + x;
      bits[i >> 3] |= 1 << (7 - (i & 7));
    }
  }
  return Buffer.from(bits).toString('base64');
}

const problems = [];

// --- a backstage band with a gap around it, and open ground either side
const W = 48; const H = 24;
const inBand = (x, y) => x >= 16 && x <= 27 && y <= 17;
const nav = createNav({
  w: W, h: H, backstageCost: 4,
  walkable: pack(W, H, () => true),
  backstage: pack(W, H, inBand)
});

const p = nav.path([2, 2], [45, 2]);
if (!p) {
  problems.push('no path across the synthetic grid');
} else {
  let crossed = 0;
  for (let i = 1; i < p.length; i += 1) {
    const [ax, ay] = p[i - 1]; const [bx, by] = p[i];
    const steps = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
    for (let s = 0; s <= steps; s += 1) {
      const t = steps ? s / steps : 0;
      if (inBand(Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t))) crossed += 1;
    }
  }
  console.log(`  synthetic: ${p.length} waypoints, ${crossed} samples inside the backstage band`);
  if (crossed > 0) {
    problems.push('smoothed path walks through backstage that A* routed around');
  }
}

// --- and the real map still produces a route
const grid = JSON.parse(readFileSync(join(HERE, '..', '..', 'docs', 'specs', 'world', 'navgrid.json'), 'utf8'));
const real = createNav(grid);
const route = real.path([200, 250], [492.5, 266]);
console.log(`  real map:  ${route ? `${route.length} waypoints` : 'NO ROUTE'}`);
if (!route || route.length < 2) problems.push('no route from the cafe to the bench');

console.log(problems.length ? `\nFAILED\n  ${problems.join('\n  ')}` : '\nOK  smoothing preserves the weighted route');
process.exitCode = problems.length ? 1 : 0;
