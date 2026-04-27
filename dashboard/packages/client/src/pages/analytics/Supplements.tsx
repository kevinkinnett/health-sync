import { useEffect, useMemo, useState } from "react";
import {
  useSupplementAdherence,
  useSupplementCorrelations,
  useSupplementIngredientByDay,
  useSupplementIntakeByDay,
  useSupplementItems,
} from "../../api/queries";
import { useDateRangeStore } from "../../stores/dateRangeStore";
import { ScatterPanel } from "../../components/charts/ScatterPanel";
import { AdherenceCalendar } from "../../components/analytics/AdherenceCalendar";
import { IngredientRollupChart } from "../../components/analytics/IngredientRollupChart";

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

export function AnalyticsSupplements() {
  const items = useSupplementItems();
  const { start, end } = useDateRangeStore();

  // Default the picker to whichever item has the most logged intakes in
  // the current window — bootstraps from the intake-by-day rollup so we
  // don't need a separate "most-logged" query.
  const intakeByDay = useSupplementIntakeByDay();
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

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [lagDays, setLagDays] = useState(0);

  // Auto-select the most-logged item once the rollup arrives, but only
  // if the user hasn't already picked one.
  useEffect(() => {
    if (selectedItemId == null && mostLoggedItemId != null) {
      setSelectedItemId(mostLoggedItemId);
    }
  }, [mostLoggedItemId, selectedItemId]);

  const adherence = useSupplementAdherence(selectedItemId);
  const correlations = useSupplementCorrelations(selectedItemId, lagDays);
  const ingredientByDay = useSupplementIngredientByDay();

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
      {/* Item picker + lag selector */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between bg-surface-container rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-outline uppercase font-bold tracking-widest">
            Supplement
          </span>
          <select
            value={selectedItemId ?? ""}
            onChange={(e) =>
              setSelectedItemId(
                e.target.value === "" ? null : Number(e.target.value),
              )
            }
            className="bg-surface-container-low border border-outline-variant/20 text-on-surface rounded-lg px-3 py-2 text-sm font-medium min-w-[14rem]"
          >
            <option value="">Select a supplement…</option>
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
            medication
          </span>
          <p className="text-on-surface-variant mt-2 text-sm">
            Pick a supplement above to see its adherence, ingredient
            rollup, and lag-aware correlations with your health metrics.
          </p>
        </div>
      )}

      {selectedItemId != null && adherence.data && (
        <>
          {/* Adherence summary */}
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

          {/* Ingredient rollup */}
          <section>
            <h2 className="text-lg font-headline font-semibold text-on-surface mb-3">
              Ingredient Intake
            </h2>
            {ingredientByDay.data && (
              <IngredientRollupChart rows={ingredientByDay.data} />
            )}
          </section>

          {/* Correlations */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-lg font-headline font-semibold text-on-surface">
                Correlations With Health Metrics
              </h2>
              <span className="text-xs text-outline tabular-nums">
                {lagDays === 0
                  ? "same day"
                  : `${lagDays}-day lag`}
              </span>
            </div>
            {correlations.data && correlations.data.pairs.length === 0 && (
              <div className="bg-surface-container rounded-xl p-6 text-center text-sm text-on-surface-variant">
                Insufficient overlapping data to compute correlations
                yet. Log this supplement on more days to populate this
                view.
              </div>
            )}
            {correlations.data && correlations.data.pairs.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {correlations.data.pairs.map((pair) => (
                  <ScatterPanel
                    key={pair.metric}
                    title={`Took ${correlations.data!.itemName} vs ${pair.metricLabel}`}
                    insight={pair.insight}
                    correlation={pair.correlation}
                    n={pair.n}
                    points={pair.points}
                    xAxisLabel="Took (1) / Skipped (0)"
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
