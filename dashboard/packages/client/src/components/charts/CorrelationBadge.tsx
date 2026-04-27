/**
 * Pill-style label that summarises a Pearson r value with a band-based
 * colour ramp. Shared by the cross-metric correlation grid on
 * `/analytics/correlations` and the per-supplement / per-medication
 * correlation panels on `/analytics/supplements` and
 * `/analytics/medications`.
 *
 * Thresholds match the cutoffs used in `services/stats.ts` so the
 * server-side `insight` text and the visual badge always agree:
 *   |r| ≥ 0.7  → Strong
 *   |r| ≥ 0.4  → Moderate
 *   |r| ≥ 0.2  → Weak
 *   otherwise  → None
 */
export function CorrelationBadge({ r }: { r: number }) {
  const abs = Math.abs(r);
  let label: string;
  let color: string;
  if (abs >= 0.7) {
    label = "Strong";
    color = "bg-secondary/10 text-secondary";
  } else if (abs >= 0.4) {
    label = "Moderate";
    color = "bg-primary/10 text-primary";
  } else if (abs >= 0.2) {
    label = "Weak";
    color = "bg-surface-container-highest text-on-surface-variant";
  } else {
    label = "None";
    color = "bg-surface-container-high text-outline";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tabular-nums ${color}`}
    >
      r = {r.toFixed(2)} ({label})
    </span>
  );
}
