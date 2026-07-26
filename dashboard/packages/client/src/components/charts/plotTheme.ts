import { CHART_CHROME } from "./chartPalette";

/** Shared dark-theme defaults so Observable Plot figures match recharts. */
export const PLOT_STYLE = {
  background: "transparent",
  color: CHART_CHROME.axis,
  fontFamily: "Manrope, system-ui, sans-serif",
  fontSize: "11px",
  overflow: "visible",
} as const;

/**
 * Re-exported so the Plot figures and the Recharts components draw from
 * exactly one palette. The definition lives in `chartPalette.ts`; this
 * alias keeps existing `plotTheme` imports working.
 */
export { METRIC_COLOR } from "./chartPalette";
