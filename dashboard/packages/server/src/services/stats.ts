/**
 * Tiny stats helpers shared by HealthDataService and AnalyticsService.
 *
 * Kept dependency-free and pure so they're trivial to test and reuse from
 * any new analytical workload.
 */

/**
 * Average of a list of values, treating `null`/`undefined` as missing
 * (skipped). Returns 0 when nothing is present so callers can keep
 * arithmetic flowing without branching.
 */
export function avg(values: (number | null | undefined)[]): number {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return 0;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Pearson correlation coefficient. Rounded to 3 decimals to match the
 * resolution we display in the UI. Returns 0 for degenerate inputs
 * (n < 2 or zero variance) so chart code never sees NaN.
 */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

/**
 * Add `days` to a `YYYY-MM-DD` date string and return the same shape.
 * Negative values shift backwards. Uses UTC arithmetic to avoid DST
 * surprises on the boundary.
 */
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Plain-English summary of a Pearson r value used as the `insight`
 * field on a correlation pair. Thresholds match the badge cutoffs the
 * UI uses (Strong ≥0.7, Moderate ≥0.4, Weak ≥0.2).
 */
export function describeCorrelation(
  r: number,
  xName: string,
  yName: string,
): string {
  const abs = Math.abs(r);
  let strength: string;
  if (abs >= 0.7) strength = "strong";
  else if (abs >= 0.4) strength = "moderate";
  else if (abs >= 0.2) strength = "weak";
  else return `No meaningful correlation between ${xName} and ${yName}`;

  const direction = r > 0 ? "positive" : "negative";
  const meaning =
    r > 0
      ? `more ${xName} tends to go with more ${yName}`
      : `more ${xName} tends to go with less ${yName}`;
  return `${strength.charAt(0).toUpperCase() + strength.slice(1)} ${direction} correlation (r=${r.toFixed(2)}): ${meaning}`;
}
