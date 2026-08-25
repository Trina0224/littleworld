/**
 * Which semantic area a position is in.
 *
 * Zone membership is what perception means by "the same area as" - the coarse
 * spatial fact that decides whether two characters are in each other's scene at
 * all. It is world data, authored by docs/specs/world/zones-derive.py and read
 * from zones.json; nothing here invents geometry.
 *
 * The polygons are re-evaluated rather than shipped as a packed map. A byte per
 * cell would be about 300 KB base64 for a file the browser has to load, against
 * a few hundred bytes of polygon - and navgrid.json already pays that cost for
 * the thing that genuinely needs per-cell resolution. Two implementations of one
 * containment rule is exactly where drift hides, so zones.json carries a sample
 * the Python assigned and zones.test.js asserts this file reproduces all of it.
 *
 * Backstage is the exception and comes from the nav grid, because it is painted
 * rather than drawn and is already unpacked there. Drawing it a second time as a
 * polygon is how one region ends up with two answers.
 */

/** Even-odd point in polygon at a cell centre. Must match zones-derive.py exactly. */
function inside(points, x, y) {
  const px = x + 0.5;
  const py = y + 0.5;
  let hit = false;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    if ((y1 > py) !== (y2 > py)) {
      const xx = x1 + ((py - y1) * (x2 - x1)) / (y2 - y1);
      if (px < xx) hit = !hit;
    }
  }
  return hit;
}

export function createZones(spec, nav = null) {
  const polygons = spec.zones.filter((z) => z.shape === 'polygon');
  const masked = spec.zones.filter((z) => z.shape === 'mask');
  const byId = new Map(spec.zones.map((z) => [z.id, z]));
  const { width, height } = spec.coordinateSystem;

  return {
    ids: spec.zones.map((z) => z.id),

    /**
     * @returns {string|null} zone id, or null outside the world.
     *
     * Purely geometric on purpose. A seat surface sits on furniture and is not a
     * walkable cell, so a seated agent still has a zone.
     */
    at(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      if (xi < 0 || yi < 0 || xi >= width || yi >= height) return null;
      // Painted regions win over polygons: they are the source, not a copy.
      if (nav && masked.length && nav.backstageAt(xi, yi)) return masked[0].id;
      for (const z of polygons) if (inside(z.points, xi, yi)) return z.id;
      return null;
    },

    /** true when two zones are the same or listed as neighbours */
    adjacent(a, b) {
      if (!a || !b) return false;
      if (a === b) return true;
      return (byId.get(a)?.neighbors ?? []).includes(b);
    },

    label(id, lang = 'zh') {
      return byId.get(id)?.label?.[lang] ?? id;
    },

    zone(id) {
      return byId.get(id) ?? null;
    }
  };
}
