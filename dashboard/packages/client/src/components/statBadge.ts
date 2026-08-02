import type { SparklineData } from "@health-dashboard/shared";

/**
 * A one-word verdict for a stat tile: is today's number actually notable,
 * or is it just where this metric normally sits?
 *
 * The bare number on a tile is unreadable without that context — 65 bpm
 * means nothing unless you know your own range. This is the same job the
 * readiness card does properly for recovery signals, but readiness only
 * covers hrv/rhr/sleep/breathing/spo2/skinTemp/restlessness, and two of
 * the four tiles (steps, body mass) are not recovery signals at all. One
 * uniform rule beats badging half the row and leaving the rest bare.
 *
 * SCALED BY THE METRIC'S OWN SPREAD, not by a percentage. A 5% swing is
 * noise in daily steps and alarming in body mass; there is no single
 * percentage that is right for both. Comparing today against the trailing
 * mean in units of the trailing SD makes the threshold self-calibrating —
 * the same instinct as the z-scores behind readiness and the effect sizes
 * behind the experiment reports.
 *
 * Deliberately conservative: below the threshold it says "steady" rather
 * than reaching for a direction. A tile that announces a change every day
 * is one nobody reads.
 */

/** How far from the trailing mean, in SDs, before it is worth a word. */
const NOTABLE_Z = 1;

/** Below this many points, the spread estimate is not worth trusting. */
const MIN_POINTS = 4;

export type BadgeTone = "good" | "bad" | "neutral";

export interface StatBadge {
  label: string;
  tone: BadgeTone;
  /** Signed distance from the trailing mean, in SDs. For the tooltip. */
  z: number;
}

/**
 * @param series  the tile's own sparkline; the LAST point is "today".
 * @param betterDirection which way is an improvement for this metric.
 */
export function statBadge(
  series: SparklineData[],
  betterDirection: "up" | "down",
): StatBadge | null {
  const values = series
    .map((p) => p.value)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (values.length < MIN_POINTS) return null;

  const today = values[values.length - 1];
  const prior = values.slice(0, -1);
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;

  // Population SD over the prior days. A flat series has sd 0, which would
  // make every wobble infinitely significant — treat it as "steady".
  const variance =
    prior.reduce((acc, v) => acc + (v - mean) ** 2, 0) / prior.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return { label: "steady", tone: "neutral", z: 0 };

  const z = (today - mean) / sd;
  if (Math.abs(z) < NOTABLE_Z) {
    return { label: "steady", tone: "neutral", z: round(z) };
  }

  const rising = z > 0;
  const improved = rising === (betterDirection === "up");
  return {
    // Words, never colour alone — the tone is a second channel, not the
    // only one.
    label: rising ? "above usual" : "below usual",
    tone: improved ? "good" : "bad",
    z: round(z),
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
