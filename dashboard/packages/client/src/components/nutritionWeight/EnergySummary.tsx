import type { NutritionWeightReport } from "@health-dashboard/shared";

interface Props {
  report: NutritionWeightReport;
}

function mean(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

function formatCalories(value: number | null): string {
  return value == null ? "Not enough data" : `${Math.round(value).toLocaleString()} kcal`;
}

export function EnergySummary({ report }: Props) {
  const completed = report.days.filter((day) => !day.provisional);
  const overlap = completed.filter(
    (day) => day.food?.caloriesIn != null && day.estimatedCaloriesOut != null,
  );
  const stats = [
    {
      label: "Food logging coverage",
      value:
        report.foodCoverage.percent == null
          ? "Not enough data"
          : `${Math.round(report.foodCoverage.percent)}%`,
      detail: `${report.foodCoverage.loggedDays} of ${report.foodCoverage.completedDays} completed days`,
    },
    {
      label: "Average logged intake",
      value: formatCalories(mean(completed.map((day) => day.food?.caloriesIn ?? null))),
      detail: "Logged days only",
    },
    {
      label: "Average estimated output",
      value: formatCalories(mean(overlap.map((day) => day.estimatedCaloriesOut))),
      detail: `${overlap.length} matched ${overlap.length === 1 ? "day" : "days"}`,
    },
    {
      label: "Average estimated gap",
      value: formatCalories(mean(overlap.map((day) => day.estimatedEnergyGap))),
      detail: "Intake minus estimated output",
    },
  ];

  return (
    <section
      aria-labelledby="energy-summary-heading"
      className="bg-surface-container rounded-xl p-5 border border-outline-variant/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2
            id="energy-summary-heading"
            className="text-sm font-headline font-semibold text-on-surface"
          >
            Energy and logging summary
          </h2>
          <p className="text-xs text-outline mt-1">
            Missing food logs remain unknown. They are never counted as zero intake.
          </p>
        </div>
        {report.window.completedThrough < report.window.end && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            Today is provisional
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-surface-container-high p-3 min-w-0">
            <div className="text-lg font-bold font-headline tabular-nums text-on-surface break-words">
              {stat.value}
            </div>
            <div className="text-[11px] font-semibold text-on-surface-variant mt-1">
              {stat.label}
            </div>
            <div className="text-[10px] text-outline mt-0.5">{stat.detail}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-outline mt-4">
        Calories out is a wearable estimate, not a measured metabolic result. The gap is useful
        context for trends, but it does not establish cause and effect.
      </p>
    </section>
  );
}
