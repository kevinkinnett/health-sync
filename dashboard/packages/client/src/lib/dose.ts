/**
 * Tiny dose/amount formatters shared across the supplement and
 * medication UIs. Previously these existed as three copies:
 *
 *   - `components/supplements/SupplementLog.tsx:formatDose/formatAmount`
 *   - `components/supplements/SupplementLibrary.tsx:formatAmount`
 *   - `components/medications/MedicationLog.tsx:formatDose`
 *
 * The character-identical bodies meant the supplement/medication UIs
 * were one bug-fix away from "fixed in one, not the other." Both now
 * call into this module.
 */

/**
 * Drops trailing zeros from non-integer amounts (so `1.0` shows as
 * `"1"` and `1.500` as `"1.5"`). Integer inputs render verbatim.
 */
export function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
}

/**
 * Renders an `{amount, unit}` pair as a one-line dose label, with `"—"`
 * standing in for a missing amount. Used on every intake card and
 * library row.
 */
export function formatDose(amount: number | null, unit: string): string {
  if (amount == null) return `— ${unit}`;
  return `${formatAmount(amount)} ${unit}`;
}
