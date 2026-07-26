/**
 * Tooltip formatter adapters for Recharts.
 *
 * Recharts hands a formatter `ValueType | undefined` — `number | string |
 * ReadonlyArray<number | string>` — because a tooltip entry can be a
 * range or a stacked value. Every chart here only ever plots numbers, so
 * each one declared `(value: number) => …` and relied on v2's looser
 * types. v3 tightened them and all seven call sites broke at once.
 *
 * Rather than widen the signature in seven components (and again the next
 * time the library moves), the charts depend on these two adapters. The
 * chart says what it wants to *display*; the adapter owns the impedance
 * mismatch with the charting library.
 *
 * Deliberately no `recharts` type imports: describing the shape
 * structurally keeps this module decoupled from the library's internal
 * type paths, which are not part of its public API.
 */

/** Mirrors Recharts' `ValueType | undefined` without importing it. */
type ChartValue = number | string | ReadonlyArray<number | string> | undefined;

function toNumber(value: ChartValue): number {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return Number(value[0]);
  return Number(value);
}

/**
 * Adapts a number formatter to Recharts' tooltip `formatter`.
 *
 * Returns a single-element array, matching the previous behaviour: an
 * array result is read as `[value, name]`, so a one-element array renders
 * the formatted value with no name label — which is the look these charts
 * already had.
 */
export function formatNumber(
  format: (value: number) => string,
): (value: ChartValue) => [string] {
  return (value) => [format(toNumber(value))];
}

/** Convenience for the common `123 unit` case. */
export function formatWithUnit(
  unit: string,
  round: (value: number) => number = (v) => v,
): (value: ChartValue) => [string] {
  return formatNumber((value) => `${round(value)} ${unit}`);
}

/**
 * Recharts' `labelFormatter` receives the axis label plus the payload
 * entries. Several charts label the tooltip with the row's own `date`
 * rather than the axis value (which may be a formatted or indexed tick).
 */
export function labelFromPayloadDate(
  _label: unknown,
  payload: readonly unknown[],
): string {
  const first = payload?.[0] as { payload?: { date?: string } } | undefined;
  return first?.payload?.date ?? "";
}
