import { MAGNITUDE_RAMP_3 } from "../components/charts/chartPalette";

/**
 * Cells are binned onto the validated sequential ramp rather than
 * interpolated per metric. Each row is normalised to its own min/max, so
 * one ramp reads the same for every metric ("lower/higher than this
 * metric's typical weekday") and every fill is a colour the palette
 * validator actually checked — the old per-metric lerp produced
 * thousands of unvalidated in-between tints and its pastel peaks put
 * light text at ~1.5:1.
 */
export function heatmapBucket(t: number): number {
  const steps = MAGNITUDE_RAMP_3.length;
  return Math.min(steps - 1, Math.max(0, Math.floor(t * steps)));
}

/**
 * The fills run dark → light, so no single text colour works on all of
 * them. Pick whichever ink contrasts more with this fill; the test suite
 * asserts every ramp step clears 4.5:1 with its chosen ink.
 */
const INK_LIGHT = "#f1f3f5";
const INK_DARK = "#07101c";

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function inkFor(fill: string): string {
  return contrastRatio(fill, INK_LIGHT) >= contrastRatio(fill, INK_DARK) ? INK_LIGHT : INK_DARK;
}
