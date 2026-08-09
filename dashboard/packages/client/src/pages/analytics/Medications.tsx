import { useMemo, useState } from "react";
import type { DoseResponseSummary } from "@health-dashboard/shared";
import {
  useMedicationAdherence,
  useMedicationCorrelations,
  useMedicationDoseResponse,
  useMedicationLagProfile,
  useMedicationIntakeByDay,
  useMedicationItems,
} from "../../api/queries";
import { useDateRangeStore } from "../../stores/dateRangeStore";
import { ScatterPanel } from "../../components/charts/ScatterPanel";
import { DoseDistribution } from "../../components/charts/DoseDistribution";
import { LagCurve } from "../../components/charts/LagCurve";
import { AdherenceCalendar } from "../../components/analytics/AdherenceCalendar";

const LAG_OPTIONS = [
  { value: 0, label: "Same day" },
  { value: 1, label: "+1 day" },
  { value: 2, label: "+2 days" },
  { value: 3, label: "+3 days" },
];

function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
      <span className="text-[10px] text-outline uppercase font-bold tracking-widest">
        {label}
      </span>
      <div className="text-2xl font-headline font-bold tabular-nums text-on-surface mt-1">
        {value}
        {unit && (
          <span className="text-sm text-on-surface-variant font-medium ml-1">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Long-horizon dose-level comparison: one column per daily-dose level
 * (0 = skipped days), one row per metric, each cell the average across
 * every day spent at that level. This is the view that suits
 * slow-acting medications — day-lag correlations can't see effects
 * that build over weeks, but a 20mg-era vs 10mg-era average can.
 */
function DoseLevelTable({ data }: { data: DoseResponseSummary }) {
  const unit = data.xLabel.match(/\((.+)\)/)?.[1] ?? "";
  // Mixed-unit items fall back to per-day intake counts server-side —
  // "2 count" is not a dose, so phrase those columns as frequencies.
  const isCount = unit === "count";
  // A day-set at one level can be scattered (skipped days interleave with
  // dose eras), so the range is a span, not a contiguous block — and it
  // can cross years, so keep the year visible.
  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  const fmtRange = (a: string, b: string) =>
    a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`;
  // "Thin data" keys off how many days actually carried metric values
  // at this level — the calendar day-count can be much larger (e.g. a
  // long not-taken tail with no wearable data).
  const metricN = (dose: number) =>
    Math.max(
      0,
      ...data.metrics.map(
        (m) => m.byLevel.find((b) => b.dose === dose)?.n ?? 0,
      ),
    );
  const levelHeader = (dose: number) => {
    if (dose === 0) return "Not taken";
    if (isCount) return `${dose}× per day`;
    return `${dose} ${unit}`;
  };
  return (
    <div className="bg-surface-container rounded-xl p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="pb-2 pr-4 text-[10px] text-outline uppercase font-bold tracking-widest">
              Metric
            </th>
            {data.levels.map((l) => (
              <th key={l.dose} className="pb-2 pr-4">
                <div className="font-headline font-bold text-on-surface tabular-nums">
                  {levelHeader(l.dose)}
                </div>
                <div className="text-[10px] text-outline font-normal tabular-nums">
                  {l.days} {l.days === 1 ? "day" : "days"}
                  {metricN(l.dose) < 7 ? " · thin data" : ""} ·{" "}
                  {fmtRange(l.firstDay, l.lastDay)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.metrics.map((m) => (
            <tr key={m.metric} className="border-t border-outline-variant/10">
              <td className="py-2 pr-4 text-on-surface-variant">{m.metricLabel}</td>
              {data.levels.map((l) => {
                const cell = m.byLevel.find((b) => b.dose === l.dose);
                return (
                  <td key={l.dose} className="py-2 pr-4 tabular-nums">
                    {cell ? (
                      <span className={cell.n < 7 ? "text-outline" : "text-on-surface font-semibold"}>
                        {cell.mean.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-outline">--</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-outline mt-3">
        Averages over every day at each dose level (days at one level can
        be scattered across the timeline). This isn't a randomized
        experiment — differences can also reflect seasons or habit
        changes — so treat them as leads, not verdicts.
      </p>
    </div>
  );
}

export function AnalyticsMedications() {
  const items = useMedicationItems();
  const { start, end } = useDateRangeStore();

  const intakeByDay = useMedicationIntakeByDay();
  const mostLoggedItemId = useMemo(() => {
    if (!intakeByDay.data || intakeByDay.data.length === 0) return null;
    const totals = new Map<number, number>();
    for (const row of intakeByDay.data) {
      totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.count);
    }
    let bestId: number | null = null;
    let bestCount = 0;
    for (const [id, n] of totals) {
      if (n > bestCount) {
        bestCount = n;
        bestId = id;
      }
    }
    return bestId;
  }, [intakeByDay.data]);

  const [chosenItemId, setChosenItemId] = useState<number | null>(null);
  const selectedItemId = chosenItemId ?? mostLoggedItemId;
  const [lagDays, setLagDays] = useState(0);

  const adherence = useMedicationAdherence(selectedItemId);
  const correlations = useMedicationCorrelations(selectedItemId, lagDays);
  const doseResponse = useMedicationDoseResponse(selectedItemId);
  const lagProfile = useMedicationLagProfile(selectedItemId);

  const peakDow = useMemo(() => {
    if (!adherence.data) return null;
    let best = adherence.data.byDayOfWeek[0];
    for (const row of adherence.data.byDayOfWeek) {
      if (row.avgDoses > (best?.avgDoses ?? -1)) best = row;
    }
    return best ?? null;
  }, [adherence.data]);

  const adherencePct = adherence.data
    ? Math.round(
        (adherence.data.daysWithIntake /
          Math.max(1, adherence.data.daysInWindow)) *
          100,
      )
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between bg-surface-container rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-outline uppercase font-bold tracking-widest">
            Medication
          </span>
          <select
            value={selectedItemId ?? ""}
            onChange={(e) =>
              setChosenItemId(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="bg-surface-container-low border border-outline-variant/20 text-on-surface rounded-lg px-3 py-2 text-sm font-medium min-w-[14rem]"
          >
            <option value="">Select a medication…</option>
            {items.data?.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
                {it.brand ? ` · ${it.brand}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 bg-surface-container-low px-1.5 py-1 rounded-xl border border-outline-variant/10">
          {LAG_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setLagDays(opt.value)}
              className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                lagDays === opt.value
                  ? "bg-primary text-on-primary-fixed"
                  : "text-outline hover:text-on-surface"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {selectedItemId == null && (
        <div className="bg-surface-container rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-outline">
            prescriptions
          </span>
          <p className="text-on-surface-variant mt-2 text-sm">
            Pick a medication above to see its adherence and lag-aware
            correlations with your health metrics.
          </p>
        </div>
      )}

      {selectedItemId != null && adherence.data && (
        <>
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-headline font-semibold text-on-surface">
                Adherence
              </h2>
              <span className="text-[10px] text-outline uppercase tracking-widest font-bold">
                {start} → {end}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <StatTile
                label="Current Streak"
                value={String(adherence.data.currentStreak)}
                unit={
                  adherence.data.currentStreak === 1 ? "day" : "days"
                }
              />
              <StatTile
                label="Best Streak"
                value={String(adherence.data.bestStreak)}
                unit={adherence.data.bestStreak === 1 ? "day" : "days"}
              />
              <StatTile
                label="% Days Taken"
                value={`${adherencePct ?? 0}%`}
              />
              <StatTile
                label="Peak Day"
                value={peakDow?.dayName ?? "--"}
                unit={
                  peakDow ? `${peakDow.avgDoses.toFixed(1)} avg` : undefined
                }
              />
            </div>
            <AdherenceCalendar daily={adherence.data.daily} />
          </section>

          {doseResponse.data &&
            doseResponse.data.levels.length >= 2 &&
            doseResponse.data.metrics.length > 0 && (
              <section>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="text-lg font-headline font-semibold text-on-surface">
                    Dose Levels Over Time
                  </h2>
                  <span className="text-xs text-outline">
                    long-horizon comparison
                  </span>
                </div>
                <DoseLevelTable data={doseResponse.data} />
                <DoseDistribution data={doseResponse.data} />
              </section>
            )}

          {lagProfile.data &&
            lagProfile.data.metrics.some((m) =>
              m.points.some((p) => p.r != null),
            ) && (
            <section>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-lg font-headline font-semibold text-on-surface">
                  Effect Timing (Lag)
                </h2>
                <span className="text-xs text-outline">
                  correlation across day-lags
                </span>
              </div>
              <LagCurve data={lagProfile.data} />
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-headline font-semibold text-on-surface">
                Correlations With Health Metrics
              </h2>
              <span className="text-xs text-outline tabular-nums">
                {lagDays === 0 ? "same day" : `${lagDays}-day lag`}
              </span>
            </div>
            {correlations.data && correlations.data.pairs.length === 0 && (
              <div className="bg-surface-container rounded-xl p-6 text-center text-sm text-on-surface-variant">
                Insufficient overlapping data to compute correlations
                yet. Log this medication on more days to populate this
                view.
              </div>
            )}
            {correlations.data && correlations.data.pairs.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {correlations.data.pairs.map((pair) => (
                  <ScatterPanel
                    key={pair.metric}
                    title={`${correlations.data!.itemName} vs ${pair.metricLabel}`}
                    insight={pair.insight}
                    correlation={pair.correlation}
                    n={pair.n}
                    points={pair.points}
                    xAxisLabel={pair.xLabel}
                    yAxisLabel={pair.metricLabel}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
