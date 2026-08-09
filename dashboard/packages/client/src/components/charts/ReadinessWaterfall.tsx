import type { ReadinessScore } from "@health-dashboard/shared";

/**
 * "What's driving today's score" — a horizontal waterfall that decomposes
 * the readiness number into the per-signal points that pushed it off the
 * 50 baseline, ranked biggest-impact-first so the lever to pull is obvious.
 *
 * Honesty note: `contribution` is documented as the APPROXIMATE points a
 * signal moved the score, and it's the pre-tanh linear term — the score
 * itself is tanh-compressed (50 + 50·tanh(z/1.5)), so the raw contributions
 * overshoot the real offset at the extremes and don't sum to the score. We
 * rescale them proportionally to land exactly on the displayed score; the
 * relative magnitudes (which signal mattered most — the only actionable
 * part) are preserved, and the bars stay truthful to the headline number.
 */
export function ReadinessWaterfall({ data }: { data: ReadinessScore }) {
  if (data.score == null) return null;
  const score = data.score;

  const present = data.components.filter(
    (c) => c.z != null && Math.abs(c.contribution) > 0.01,
  );
  if (present.length === 0) return null;

  const rawSum = present.reduce((s, c) => s + c.contribution, 0);
  const target = score - 50;
  // In real data Σcontribution and (score−50) always share weightedZ's sign,
  // so this ratio is positive (the tanh compression just shrinks magnitude).
  // Guard anyway: a negative ratio would FLIP every bar's direction, and a
  // ~0 sum (drivers cancel at score≈50) would blow up — fall back to raw
  // contributions, which keeps every signal's true sign.
  const ratio = Math.abs(rawSum) > 0.01 ? target / rawSum : 1;
  const k = ratio > 0 ? ratio : 1;

  const drivers = present
    .map((c) => ({ label: c.label, metric: c.metric, points: c.contribution * k }))
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  // Cumulative path: 50 → … → score.
  const steps = drivers.reduce<
    Array<(typeof drivers)[number] & { from: number; to: number }>
  >((result, driver) => {
    const from = result.at(-1)?.to ?? 50;
    result.push({ ...driver, from, to: from + driver.points });
    return result;
  }, []);

  // Shared horizontal scale across baseline, score and every step edge.
  const xsAll = [50, score, ...steps.flatMap((s) => [s.from, s.to])];
  let lo = Math.min(...xsAll);
  let hi = Math.max(...xsAll);
  const pad = Math.max((hi - lo) * 0.15, 4);
  lo -= pad;
  hi += pad;
  if (hi - lo < 1) hi = lo + 1;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;

  const drags = steps.filter((s) => s.points < 0).sort((a, b) => a.points - b.points);
  const lifts = steps.filter((s) => s.points > 0).sort((a, b) => b.points - a.points);
  const biggestDrag = drags[0];
  const biggestLift = lifts[0];

  const fmtPts = (v: number) => {
    const r = Math.round(v);
    return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)} pt${Math.abs(r) === 1 ? "" : "s"}`;
  };

  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <h3 className="font-headline font-semibold text-on-surface mb-1">
        What's driving today's score
      </h3>
      <p className="text-xs text-outline mb-3">
        Starting from your 50 baseline, here's the points each signal added or
        took away — biggest mover first.
      </p>

      {/* Actionable headline: the lever to pull */}
      <p className="text-sm mb-4">
        {biggestDrag && (
          <span className="text-error font-semibold">
            Biggest drag: {biggestDrag.label} ({fmtPts(biggestDrag.points)})
          </span>
        )}
        {biggestDrag && biggestLift && <span className="text-outline"> · </span>}
        {biggestLift && (
          <span className="text-secondary font-semibold">
            Biggest lift: {biggestLift.label} ({fmtPts(biggestLift.points)})
          </span>
        )}
      </p>

      {/* Waterfall rows */}
      <div className="relative">
        <ul className="space-y-1.5">
          {steps.map((s) => {
            const left = Math.min(x(s.from), x(s.to));
            const width = Math.max(Math.abs(x(s.to) - x(s.from)), 1.5);
            const positive = s.points >= 0;
            return (
              <li
                key={s.metric}
                className="grid grid-cols-[8rem_1fr] items-center gap-3 h-7"
                aria-label={`${s.label} ${fmtPts(s.points)}`}
              >
                <span className="text-xs text-on-surface-variant truncate text-right">
                  {s.label}
                </span>
                <div className="relative h-full">
                  {/* baseline (50) marker — rendered INSIDE the track cell so
                      it shares the bars' coordinate space exactly (the outer
                      grid's 8rem label column + gap-3 gutter would otherwise
                      offset it). −top/−bottom bridge the row gap so the
                      per-row segments read as one continuous line. */}
                  <div
                    className="absolute w-px bg-outline-variant/40"
                    style={{ left: `${x(50)}%`, top: -3, bottom: -3 }}
                    aria-hidden
                  />
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-3.5 rounded-sm ${
                      positive ? "bg-secondary" : "bg-error"
                    }`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 text-[10px] tabular-nums font-semibold ${
                      positive ? "text-secondary" : "text-error"
                    }`}
                    style={
                      positive
                        ? { left: `calc(${x(s.to)}% + 4px)` }
                        : { right: `calc(${100 - x(s.to)}% + 4px)` }
                    }
                  >
                    {fmtPts(s.points)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Total row */}
        <div className="grid grid-cols-[8rem_1fr] items-center gap-3 h-8 mt-2 border-t border-outline-variant/15 pt-2">
          <span className="text-xs font-semibold text-on-surface text-right">
            Today
          </span>
          <div className="relative h-full">
            <div
              className="absolute top-1/2 -translate-y-1/2 h-5 w-1 rounded bg-on-surface"
              style={{ left: `${x(score)}%` }}
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 text-sm font-headline font-bold tabular-nums text-on-surface"
              style={{ left: `calc(${x(score)}% + 6px)` }}
            >
              {score}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-outline mt-3">
        50 = exactly your own baseline. Points are approximate and rescaled to
        sum to today's score.
      </p>
    </div>
  );
}
