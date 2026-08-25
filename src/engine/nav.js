/**
 * Walking.
 *
 * A* over the painted walkable map, with backstage cells charged the multiplier
 * the world spec gives them - crossable, but an agent would rather not, which is
 * what "walkable but effectively out of sight" means in movement terms.
 *
 * The path is computed once, when the move starts, and written into the fact
 * that starts it. Replay follows the recorded path and never runs this file
 * (section 8.2).
 */
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];

function unpack(b64, n) {
  const bin = typeof atob === 'function'
    ? atob(b64)
    : Buffer.from(b64, 'base64').toString('binary');
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    bits[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1;
  }
  return bits;
}

/** A tiny binary heap - a sorted array is fine until it isn't, and 230k cells is when */
function heap() {
  const a = [];
  return {
    get size() { return a.length; },
    push(node) {
      a.push(node);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= a[i].f) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    },
    pop() {
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1; const r = l + 1;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
  };
}

export function createNav(grid) {
  const { w, h, backstageCost } = grid;
  const n = w * h;
  const walkable = unpack(grid.walkable, n);
  const backstage = unpack(grid.backstage, n);
  const cost = (i) => (backstage[i] ? backstageCost : 1);

  const at = (x, y) => y * w + x;
  const ok = (x, y) => x >= 0 && y >= 0 && x < w && y < h && walkable[at(x, y)] === 1;

  /** nearest walkable cell to a point that may sit on furniture */
  function nearestWalkable(x, y, radius = 24) {
    x = Math.round(x); y = Math.round(y);
    if (ok(x, y)) return [x, y];
    for (let r = 1; r <= radius; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (ok(x + dx, y + dy)) return [x + dx, y + dy];
        }
      }
    }
    return null;
  }

  /**
   * What a straight walk from a to b would cost, under the same weighting A*
   * used - or null if it crosses something unwalkable.
   *
   * Checking only walkability is not enough. A* charges backstage cells the
   * multiplier and routes around them; a shortcut that is merely walkable can
   * cut straight back through the cells it just paid to avoid, which silently
   * undoes the preference. Smoothing has to be cost-aware or it is not
   * smoothing the path A* found.
   */
  function lineCost(a, b) {
    const span = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
    const steps = Math.ceil(span);
    if (steps === 0) return 0;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const per = length / steps;
    let total = 0;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(a[0] + (b[0] - a[0]) * t);
      const y = Math.round(a[1] + (b[1] - a[1]) * t);
      if (!ok(x, y)) return null;
      if (i > 0) total += per * cost(at(x, y));
    }
    return total;
  }

  return {
    w, h,
    walkableAt: (x, y) => ok(Math.round(x), Math.round(y)),
    /** the same painted region zones.json calls `backstage`, already unpacked here */
    backstageAt: (x, y) => {
      const xi = Math.round(x); const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= w || yi >= h) return false;
      return backstage[at(xi, yi)] === 1;
    },
    nearestWalkable,

    /** @returns {[number,number][] | null} corner points from start to goal, inclusive */
    path(start, goal) {
      const s = nearestWalkable(start[0], start[1]);
      const g = nearestWalkable(goal[0], goal[1]);
      if (!s || !g) return null;
      if (s[0] === g[0] && s[1] === g[1]) return [s];

      const gi = at(g[0], g[1]);
      const dist = new Float64Array(n).fill(Infinity);
      const from = new Int32Array(n).fill(-1);
      const done = new Uint8Array(n);
      const open = heap();
      const hx = (x, y) => Math.hypot(x - g[0], y - g[1]);

      dist[at(s[0], s[1])] = 0;
      open.push({ i: at(s[0], s[1]), x: s[0], y: s[1], f: hx(s[0], s[1]) });

      while (open.size) {
        const cur = open.pop();
        if (done[cur.i]) continue;
        done[cur.i] = 1;
        if (cur.i === gi) break;
        for (const [dx, dy, step] of DIRS) {
          const x = cur.x + dx; const y = cur.y + dy;
          if (!ok(x, y)) continue;
          // no cutting a diagonal past a corner
          if (dx && dy && (!ok(cur.x + dx, cur.y) || !ok(cur.x, cur.y + dy))) continue;
          const i = at(x, y);
          if (done[i]) continue;
          const d = dist[cur.i] + step * cost(i);
          if (d < dist[i]) {
            dist[i] = d;
            from[i] = cur.i;
            open.push({ i, x, y, f: d + hx(x, y) });
          }
        }
      }
      if (from[gi] === -1 && gi !== at(s[0], s[1])) return null;

      const cells = [];
      for (let i = gi; i !== -1; i = from[i]) cells.push([i % w, (i / w) | 0]);
      cells.reverse();

      // String pull: drop a corner only when walking straight past it is both
      // clear and no more expensive than the route A* actually chose. dist[]
      // still holds the accumulated weighted cost, so the comparison is against
      // the real thing rather than against distance.
      const out = [cells[0]];
      let anchor = 0;
      const idx = (c) => at(c[0], c[1]);
      for (let i = 2; i < cells.length; i += 1) {
        const straight = lineCost(cells[anchor], cells[i]);
        const along = dist[idx(cells[i])] - dist[idx(cells[anchor])];
        if (straight === null || straight > along + 1e-6) {
          out.push(cells[i - 1]);
          anchor = i - 1;
        }
      }
      out.push(cells[cells.length - 1]);
      return out;
    }
  };
}

/** length of a polyline, in world units */
export function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i += 1) {
    d += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return d;
}

/** where a walker is along a polyline after covering `travelled` units */
export function pointAlong(points, travelled) {
  let left = travelled;
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (left <= seg || i === points.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 1;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    left -= seg;
  }
  return [...points[points.length - 1]];
}
