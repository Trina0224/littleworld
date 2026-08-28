/**
 * The kind of day this run is.
 *
 * Implements docs/specs/engine/phase-3f.md §1, §2 and §9. One small public
 * bootstrap, chosen once at the start of a run and then authoritative: the
 * weather, the temperature, and the fact that it is daylight.
 *
 * Two rules that look like restrictions and are actually the point:
 *
 * NO DAY/NIGHT. LittleWorld has none in the MVP. `ticksPerDay` is attendance
 * bookkeeping, not the sun, and a daypart derived from tick fraction is a clock
 * the world does not have - a long run must never make a character conclude that
 * darkness arrived. The daypart is authored.
 *
 * NOT A MEMORY. This is background a person standing there would simply have.
 * Writing 「I remember that today was 24°C」 into private memory so the model
 * keeps seeing it would be a lie about what remembering is (§2.2).
 */

export const DEFAULTS = {
  daylight: true,
  daypart: '午後',
  // Deterministic from the world seed unless a director supplies one. Two runs
  // of the same seed are the same afternoon, which is what replay needs.
  weathers: [
    { weatherType: '晴れ', feltCondition: '暖かい', surfaceCondition: '地面は乾いている' },
    { weatherType: '薄曇り', feltCondition: '過ごしやすい', surfaceCondition: '地面は乾いている' },
    { weatherType: '曇り', feltCondition: '涼しい', surfaceCondition: '地面は乾いている' },
    { weatherType: '小雨', feltCondition: '肌寒い', surfaceCondition: '地面が濡れている' }
  ],
  tempRange: [18, 27]
};

function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16; h = Math.imul(h, 2246822507);
  h ^= h >>> 13; h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * @param world   for the seed and the recording
 * @param config  `{ weather: {...} }` to author it outright, or overrides
 * @returns a frozen ambient state; call `.state` for the object handed to Brains
 */
export function createAmbient(world, { config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };
  const seed = String(world.seed ?? 0);

  let chosen = cfg.weather;
  if (!chosen) {
    const w = cfg.weathers[Math.floor(hash01(`${seed}:weather`) * cfg.weathers.length)];
    const [lo, hi] = cfg.tempRange;
    chosen = { ...w, ambientTempC: lo + Math.floor(hash01(`${seed}:temp`) * (hi - lo + 1)) };
  }

  const state = Object.freeze({
    daylight: cfg.daylight,
    daypart: cfg.daypart,
    weatherType: chosen.weatherType,
    ambientTempC: chosen.ambientTempC,
    ...(chosen.feltCondition ? { feltCondition: chosen.feltCondition } : {}),
    ...(chosen.surfaceCondition ? { surfaceCondition: chosen.surfaceCondition } : {})
  });

  return {
    state,

    /**
     * Put it in the recording. Anything that can change the history has to be
     * recoverable from the recording or the config snapshot (§9), and the
     * weather is the clearest case: a character mentions it, so it is in the
     * committed speech, so replay has to know what the run was told.
     */
    record(extra = {}) {
      world.log.fact(world.tick, 'ambient_set', { ...state, ...extra });
      return state;
    }
  };
}
