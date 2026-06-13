/** Shared dark-theme defaults so Observable Plot figures match recharts. */
export const PLOT_STYLE = {
  background: "transparent",
  color: "#908fa0",
  fontFamily: "Manrope, system-ui, sans-serif",
  fontSize: "11px",
  overflow: "visible",
} as const;

/** Stable per-metric colors shared across the Plot figures. */
export const METRIC_COLOR: Record<string, string> = {
  steps: "#8083ff",
  sleepMin: "#c0c1ff",
  deepMin: "#4edea3",
  restingHr: "#ffb2b7",
  dailyRmssd: "#ffd479",
};
