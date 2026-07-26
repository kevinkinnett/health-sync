/**
 * The one source of truth for data-series colour.
 *
 * Before this module, 77 hex literals were scattered across 25 files and
 * the same value meant different things in different places (`#4edea3`
 * was deep sleep here, body weight there, wake-time somewhere else). That
 * made the palette impossible to change and impossible to audit — and it
 * did not survive an audit: run against the real chart surface
 * (`#171f33`), the old set failed three of five checks. Every colour sat
 * in the pastel band (L 0.81–0.89), two read as grey, and `#ffb2b7` vs
 * `#c0c1ff` measured ΔE 12.7 — below the 15 floor, i.e. hard to tell
 * apart *with full colour vision*.
 *
 * These slots are validated for this surface in both the 8-slot and
 * 4-slot runs: lightness band, chroma floor, colour-vision separation,
 * normal-vision separation and 3:1 contrast all pass.
 *
 * RULES when adding a series:
 *  - Colour follows the ENTITY, never its position in a filtered list —
 *    a filter that drops a series must not repaint the survivors. Add a
 *    key to {@link METRIC_COLOR}; don't index SERIES at the call site.
 *  - Multi-series charts take consecutive SERIES slots; that ordering is
 *    what the adjacency check validated.
 *  - Status (good/warn/bad) is NOT a series colour. Use {@link STATUS},
 *    and always pair it with a label or icon.
 */

/** Validated categorical slots, in fixed order. Never reorder. */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#9085e9", // 6 violet
  "#008300", // 7 green
  "#e66767", // 8 red
] as const;

/**
 * Reserved state colours. Deliberately distinct from the series slots so
 * a status can never impersonate a series. Always ship with a label or
 * icon — never colour alone.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
} as const;

/** Recessive chrome: gridlines, inactive marks, baselines. */
export const CHART_CHROME = {
  grid: "#2d3449",
  axis: "#908fa0",
  inactive: "#464554",
} as const;

/**
 * Per-metric identity. One entry per thing we plot, so the same metric
 * keeps its colour everywhere it appears.
 */
export const METRIC_COLOR: Record<string, string> = {
  // Activity
  steps: SERIES[0],
  activeMinutes: SERIES[1],
  distance: SERIES[2],
  calories: SERIES[3],
  floors: SERIES[5],
  minutesInCar: SERIES[1],

  // Sleep
  sleepMin: SERIES[5],
  deepMin: SERIES[2],
  remMin: SERIES[4],
  efficiency: SERIES[0],
  tnt: SERIES[1],

  // Cardio / recovery
  restingHr: SERIES[7],
  dailyRmssd: SERIES[3],
  hrv: SERIES[3],
  spo2: SERIES[0],
  breathingRate: SERIES[2],
  skinTemp: SERIES[1],
  readiness: SERIES[5],

  // Body / intake
  weight: SERIES[1],
  caloriesIn: SERIES[3],
  protein: SERIES[2],
  carbs: SERIES[0],
  fat: SERIES[4],
  fiber: SERIES[5],
  sugar: SERIES[4],
  sodium: SERIES[0],
};

/** Fallback for a metric with no assigned identity. */
export const DEFAULT_SERIES = SERIES[0];

export function metricColor(metric: string): string {
  return METRIC_COLOR[metric] ?? DEFAULT_SERIES;
}

/** Stacked sleep stages — consecutive slots, so adjacency is validated. */
export const SLEEP_STAGE_COLOR = {
  deep: SERIES[0],
  light: SERIES[1],
  rem: SERIES[2],
  wake: SERIES[3],
} as const;

/** Heart-rate zones, ordered low → high intensity. */
export const HR_ZONE_COLOR = {
  outOfRange: SERIES[0],
  fatBurn: SERIES[1],
  cardio: SERIES[2],
  peak: SERIES[3],
} as const;

/**
 * Readiness bands are STATE, not identity — so they take status colours
 * (each already ships beside its own text label in the UI).
 */
export const READINESS_BAND_COLOR = {
  primed: STATUS.good,
  balanced: SERIES[0],
  compromised: STATUS.critical,
  insufficient: CHART_CHROME.inactive,
} as const;

/**
 * An ORDINAL ramp (low → high magnitude), not a categorical set: one hue,
 * stepping lighter as magnitude rises so it reads as "more" against the
 * dark surface. Steps stay above the 2:1 floor for the darkest end.
 */
export const MAGNITUDE_RAMP_3 = ["#184f95", "#3987e5", "#86b6ef"] as const;
