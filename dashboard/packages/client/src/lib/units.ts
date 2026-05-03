/**
 * Unit conversion + display formatting.
 *
 * The canonical storage units across the database and the API responses
 * are SI / metric (kg, km, °C). The dashboard exposes a user preference
 * that flips display formatting between those metric values and US
 * imperial equivalents. Conversions live here as pure functions so the
 * unit-toggle test can pin them down without spinning up React.
 *
 * Convention:
 * - `convert*` returns a number in the requested system, or null if
 *   given null (so callers can keep their `?? "---"` fallbacks).
 * - `format*` returns a display string with unit suffix, e.g.
 *   "84.5 kg" or "186.3 lb".
 * - Conversions use the WHO-published exact factors (1 kg = 2.2046226
 *   lb, 1 km = 0.6213712 mi). Display strings round at the call site.
 */

export type UnitSystem = "metric" | "imperial";

const KG_TO_LB = 2.2046226218;
const KM_TO_MI = 0.6213711922;

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

export function convertWeight(
  kg: number | null | undefined,
  units: UnitSystem,
): number | null {
  if (kg == null) return null;
  return units === "imperial" ? kg * KG_TO_LB : kg;
}

export function weightUnitLabel(units: UnitSystem): "kg" | "lb" {
  return units === "imperial" ? "lb" : "kg";
}

export function formatWeight(
  kg: number | null | undefined,
  units: UnitSystem,
  digits = 1,
): string {
  const v = convertWeight(kg, units);
  if (v == null) return "---";
  return `${v.toFixed(digits)} ${weightUnitLabel(units)}`;
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

export function convertDistance(
  km: number | null | undefined,
  units: UnitSystem,
): number | null {
  if (km == null) return null;
  return units === "imperial" ? km * KM_TO_MI : km;
}

export function distanceUnitLabel(units: UnitSystem): "km" | "mi" {
  return units === "imperial" ? "mi" : "km";
}

export function formatDistance(
  km: number | null | undefined,
  units: UnitSystem,
  digits = 1,
): string {
  const v = convertDistance(km, units);
  if (v == null) return "---";
  return `${v.toFixed(digits)} ${distanceUnitLabel(units)}`;
}

/**
 * The exercise log endpoint returns `distance` already paired with a
 * `distanceUnit` string (Fitbit reports either "km" or "mi"). When
 * imperial is the active preference but the source unit is "km", we
 * still need to convert; if the source already says "mi", we pass it
 * through. This helper normalises the input then re-formats.
 */
export function formatDistanceWithSourceUnit(
  value: number | null | undefined,
  sourceUnit: string | null | undefined,
  units: UnitSystem,
  digits = 2,
): string {
  if (value == null || value === 0) return "---";
  const km =
    sourceUnit === "mi" || sourceUnit === "miles"
      ? value / KM_TO_MI
      : value; // assume km otherwise (Fitbit's default for SI users)
  return formatDistance(km, units, digits);
}

// ---------------------------------------------------------------------------
// Browser-locale default detection
// ---------------------------------------------------------------------------

/**
 * Best-effort default for first-time users: imperial for the three
 * countries that still use it (US, Liberia, Myanmar), metric otherwise.
 * The user can flip in Settings any time — this only seeds the initial
 * preference in localStorage.
 */
export function defaultUnitsForLocale(locale?: string | undefined): UnitSystem {
  const lang = locale ?? (typeof navigator !== "undefined" ? navigator.language : "en-US");
  const region = lang.split("-")[1]?.toUpperCase();
  if (region === "US" || region === "LR" || region === "MM") return "imperial";
  return "metric";
}
