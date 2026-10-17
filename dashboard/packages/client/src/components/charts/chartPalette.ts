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
 * These slots are validated per mode (see {@link SERIES_HEX}) in both the
 * 8-slot and 4-slot runs: lightness band, chroma floor, colour-vision separation,
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

export type ChartMode = "dark" | "light";

/**
 * The validated hex values, per mode. These are the numbers the validator
 * was run on and the numbers index.css ships as `--chart-*`; the test
 * suite fails if the two drift. Components never read these — they use
 * the `var(--chart-*)` references below, which resolve per mode in CSS,
 * so a metric keeps the SAME SLOT (and so the same hue family) in both
 * modes while the tone is stepped for that mode's surface.
 *
 *  - dark: validated against the dark card (8-slot and 4-slot runs).
 *  - light: `validate_palette.js --mode light --surface #ffffff`, 8-slot
 *    adjacent run: every check PASS with no WARN (worst adjacent CVD 8.1,
 *    normal-vision 17.7, all ≥3:1); the first three slots also pass
 *    `--pairs all`.
 */
export const SERIES_HEX: Record<ChartMode, readonly string[]> = {
  dark: [
    "#3987e5", // 1 blue
    "#d95926", // 2 orange
    "#199e70", // 3 aqua
    "#c98500", // 4 yellow
    "#d55181", // 5 magenta
    "#9085e9", // 6 violet
    "#008300", // 7 green
    "#e66767", // 8 red
  ],
  light: [
    "#2a78d6", // 1 blue
    "#eb6834", // 2 orange
    "#01a772", // 3 aqua
    "#c58506", // 4 yellow
    "#db6f99", // 5 magenta
    "#6250d6", // 6 violet
    "#008300", // 7 green
    "#d94a4a", // 8 red
  ],
};

/**
 * Status per mode. The dark warning is 1.83:1 on white, so light steps
 * every status to ≥3:1 while keeping it ≥7.8 ΔE from the nearest series
 * slot.
 */
export const STATUS_HEX: Record<ChartMode, { good: string; warning: string; critical: string }> = {
  dark: { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b" },
  light: { good: "#0ca30c", warning: "#a8701a", critical: "#b42318" },
};

export const CHROME_HEX: Record<
  ChartMode,
  { grid: string; axis: string; inactive: string; overlay: string }
> = {
  dark: { grid: "#2a2f36", axis: "#8b929c", inactive: "#444b55", overlay: "#0a5e49" },
  light: { grid: "#e2e5e9", axis: "#5f6670", inactive: "#b9bec6", overlay: "#0a5e49" },
};

/** Ordinal low → high; lighter = more on dark, darker = more on light. */
export const MAGNITUDE_RAMP_HEX: Record<ChartMode, readonly string[]> = {
  dark: ["#184f95", "#3987e5", "#86b6ef"],
  light: ["#86b6ef", "#2a78d6", "#104281"],
};

/** Validated categorical slots, in fixed order. Never reorder. */
export const SERIES = [
  "var(--chart-1)", // 1 blue
  "var(--chart-2)", // 2 orange
  "var(--chart-3)", // 3 aqua
  "var(--chart-4)", // 4 yellow
  "var(--chart-5)", // 5 magenta
  "var(--chart-6)", // 6 violet
  "var(--chart-7)", // 7 green
  "var(--chart-8)", // 8 red
] as const;

/**
 * Reserved state colours. Deliberately distinct from the series slots so
 * a status can never impersonate a series. Always ship with a label or
 * icon — never colour alone.
 */
export const STATUS = {
  good: "var(--chart-status-good)",
  warning: "var(--chart-status-warning)",
  critical: "var(--chart-status-critical)",
} as const;

/** Recessive chrome: gridlines, inactive marks, baselines. */
export const CHART_CHROME = {
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  inactive: "var(--chart-inactive)",
  /** A reference line drawn over filled marks (e.g. a moving average). */
  overlay: "var(--chart-overlay)",
} as const;

/**
 * A translucent tint of a palette colour. Palette values are CSS
 * variables, so the old `${hex}22` alpha-suffix trick no longer applies.
 */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

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
  estimatedCaloriesOut: SERIES[0],
  protein: SERIES[2],
  carbs: SERIES[0],
  fat: SERIES[4],
  fiber: SERIES[5],
  sugar: SERIES[4],
  sodium: SERIES[0],
};

/** Fallback for a metric with no assigned identity. */
export const DEFAULT_SERIES = SERIES[0];

/** Physical-source identity for paired sensor charts. */
export const SOURCE_COLOR = {
  fitbit: SERIES[0],
  eightSleep: SERIES[2],
} as const;

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
 * stepping away from the surface as magnitude rises so it reads as "more"
 * in either mode (lighter on dark, darker on light). The step nearest each
 * surface stays above the 2:1 floor.
 */
export const MAGNITUDE_RAMP_3 = [
  "var(--chart-ramp-1)",
  "var(--chart-ramp-2)",
  "var(--chart-ramp-3)",
] as const;
