/**
 * The small amount of statistics the experiment engine needs.
 *
 * Pure functions over number arrays — no domain knowledge, no clock, no
 * I/O — so the arithmetic can be pinned exactly and reused.
 *
 * On what is deliberately absent: there is no t-test and no p-value here.
 * Daily health metrics are strongly autocorrelated, so the independence
 * assumption behind those tests does not hold, and a naive p-value would
 * read as far more decisive than the evidence supports. Effect size plus
 * honest sample counts communicate the same thing without the false
 * precision.
 */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample standard deviation (n−1). Zero for fewer than two points. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Cohen's d against the pooled standard deviation.
 *
 * Null when either side has fewer than two points (no spread to estimate)
 * or when both sides are perfectly constant — an infinite effect size is
 * not a useful thing to render.
 */
export function cohensD(before: number[], after: number[]): number | null {
  if (before.length < 2 || after.length < 2) return null;
  const sdBefore = stdDev(before);
  const sdAfter = stdDev(after);
  const pooled = Math.sqrt(
    ((before.length - 1) * sdBefore ** 2 + (after.length - 1) * sdAfter ** 2) /
      (before.length + after.length - 2),
  );
  if (pooled === 0) return null;
  return (mean(after) - mean(before)) / pooled;
}

/** Rounds to `digits`, avoiding `-0` in output. */
export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  const result = Math.round(value * factor) / factor;
  return result === 0 ? 0 : result;
}
