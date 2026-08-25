/**
 * Semantic destination in, physical position out.
 *
 *     LLM chooses social destination; World Engine chooses physical placement.
 *
 * A Brain proposes "go to the near table" or "approach that person". It never
 * names a seat id and never produces a coordinate. This resolves the intention
 * against the real geometry - occupancy, walkability, personal space - and
 * returns one legal place to stand.
 *
 * Two things this is careful about.
 *
 * ARRIVING IS NOT SITTING. `go_to_area` returns a standing position even when
 * seats are free, because whether to sit is a separate decision the character
 * gets to make. The consequence that matters is the other direction: when every
 * seat at a table is taken, joining the people at it is still legal, so a full
 * table does not silently become a closed room.
 *
 * SAME STATE, SAME ANSWER. Candidates are enumerated in a fixed order and scored
 * with no clock and no rng, so re-running a scenario from the same state puts
 * the character in the same spot. This is what lets a placement appear in a
 * recording and replay identically.
 */

const MAX_PERSONAL_SPACE_RELAX = 3;      // steps of loosening before giving up

export function createPlacement(world, zones, nav, { personalSpace = 6 } = {}) {
  // Walkable cells per zone, enumerated once in row-major order so every later
  // scan starts from the same list.
  const cells = new Map();
  for (let y = 0; y < nav.h; y += 1) {
    for (let x = 0; x < nav.w; x += 1) {
      if (!nav.walkableAt(x, y)) continue;
      const z = zones.at(x, y);
      if (!z || z === 'backstage') continue;
      if (!cells.has(z)) cells.set(z, []);
      cells.get(z).push([x, y]);
    }
  }

  const centroid = new Map();
  for (const [z, list] of cells) {
    const sx = list.reduce((a, c) => a + c[0], 0) / list.length;
    const sy = list.reduce((a, c) => a + c[1], 0) / list.length;
    centroid.set(z, [sx, sy]);
  }

  /** Who else is standing about, so we do not place someone on top of them. */
  function others(exceptId) {
    return world.presentIds()
      .filter((id) => id !== exceptId)
      .map((id) => world.agents.get(id)?.at)
      .filter(Boolean);
  }

  function clearOf(point, crowd, space) {
    for (const p of crowd) {
      if (Math.hypot(point[0] - p[0], point[1] - p[1]) < space) return false;
    }
    return true;
  }

  /** Cells a seat or station currently sits on, so nobody stands inside furniture. */
  function taken() {
    const spots = [];
    for (const id of world.resourceIds()) {
      const r = world.resource(id);
      if (r.state !== 'available') spots.push(r.at);
    }
    return spots;
  }

  function pick(candidates, toward, agentId) {
    const crowd = others(agentId).concat(taken());
    const ordered = candidates
      .map((c) => ({ c, d: Math.hypot(c[0] - toward[0], c[1] - toward[1]) }))
      .sort((a, b) => (a.d - b.d) || (a.c[0] - b.c[0]) || (a.c[1] - b.c[1]));
    // Loosen personal space rather than fail outright: a busy corner should
    // still admit someone, just closer than they would otherwise stand.
    for (let step = 0; step <= MAX_PERSONAL_SPACE_RELAX; step += 1) {
      const space = personalSpace * (1 - step / (MAX_PERSONAL_SPACE_RELAX + 1));
      for (const { c } of ordered) {
        if (clearOf(c, crowd, space)) return { at: c, personalSpace: space };
      }
    }
    return null;
  }

  return {
    zonesWithSpace: () => [...cells.keys()].sort(),
    cellCount: (zoneId) => (cells.get(zoneId) ?? []).length,

    /**
     * "go to the near table" - a standing place inside that area.
     * @returns {{at:[number,number], zone:string}|null} null when nothing legal exists
     */
    goToArea(agentId, zoneId) {
      const list = cells.get(zoneId);
      if (!list || !list.length) return null;
      const got = pick(list, centroid.get(zoneId), agentId);
      return got ? { at: got.at, zone: zoneId } : null;
    },

    /**
     * "approach that person" - a standing place beside them, not on them.
     *
     * Candidates come from the target's own zone and its neighbours, so joining
     * someone at a table you cannot stand inside still works from the edge.
     */
    approachPerson(agentId, targetId) {
      const target = world.agents.get(targetId)?.at;
      if (!target) return null;
      const home = zones.at(target[0], target[1]);
      const pool = [];
      for (const [z, list] of cells) {
        if (!zones.adjacent(home, z)) continue;
        for (const c of list) {
          const d = Math.hypot(c[0] - target[0], c[1] - target[1]);
          if (d <= personalSpace * 4) pool.push(c);
        }
      }
      if (!pool.length) return null;
      const got = pick(pool, target, agentId);
      return got ? { at: got.at, zone: zones.at(got.at[0], got.at[1]) } : null;
    }
  };
}
