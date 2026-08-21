import type { FoodLogDay, NutritionWeightReport } from "@health-dashboard/shared";
import { useNutritionWeight } from "../../api/queries";
import { useChartAnnotations } from "../../components/charts/annotations";
import { METRIC_COLOR } from "../../components/charts/chartPalette";
import {
  MetricLineChart,
  type MetricPoint,
} from "../../components/charts/MetricLineChart";
import { CollectionReadiness } from "../../components/nutritionWeight/CollectionReadiness";
import { EnergyContextChart } from "../../components/nutritionWeight/EnergyContextChart";
import { EnergySummary } from "../../components/nutritionWeight/EnergySummary";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

export function AnalyticsNutrition() {
  const query = useNutritionWeight();
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant max-w-4xl">
        Logged nutrition alongside estimated energy output and training on the same local calendar
        dates. Missing food days remain unknown, and today stays provisional until it is complete.
      </p>
      <QueryBoundary
        query={query}
        empty={
          <EmptyState
            icon="restaurant"
            message="No food logs in this window yet. Log a meal and it will appear here after the next sync."
          />
        }
        isEmpty={(report) => !report.days.some((day) => day.food != null)}
      >
        {(report) => <NutritionBody report={report} />}
      </QueryBoundary>
    </div>
  );
}

function NutritionBody({ report }: { report: NutritionWeightReport }) {
  const foodDays = report.days.filter(
    (day): day is typeof day & { food: FoodLogDay } => day.food != null,
  );
  const latest = foodDays.at(-1)?.food;
  const marks = useChartAnnotations(report.days.map((day) => day.date));
  const points = (read: (food: FoodLogDay) => number | null): MetricPoint[] =>
    report.days.map((day) => ({ date: day.date, value: day.food ? read(day.food) : null }));

  return (
    <div className="space-y-4">
      <EnergySummary report={report} />
      <EnergyContextChart report={report} annotations={marks} />

      {latest && <LatestDayCard day={latest} />}

      <div className="grid xl:grid-cols-2 gap-4">
        <MetricLineChart
          annotations={marks}
          title="Protein"
          description="Logged protein per day. Gaps are unlogged days."
          unit="g"
          color={METRIC_COLOR.protein}
          digits={0}
          data={points((food) => food.protein)}
        />
        <MetricLineChart
          annotations={marks}
          title="Fiber"
          description="Logged fiber per day. Gaps are unlogged days."
          unit="g"
          color={METRIC_COLOR.fiber}
          digits={0}
          data={points((food) => food.fiber)}
        />
      </div>

      <details className="group bg-surface-container rounded-xl border border-outline-variant/10">
        <summary className="list-none cursor-pointer p-5 flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-headline font-semibold text-on-surface">
              More nutrient detail
            </span>
            <span className="block text-xs text-outline mt-1">
              Carbohydrates, fat, sugar, and sodium
            </span>
          </span>
          <span
            className="material-symbols-outlined text-outline transition-transform group-open:rotate-180"
            aria-hidden="true"
          >
            expand_more
          </span>
        </summary>
        <div className="grid xl:grid-cols-2 gap-4 p-4 pt-0">
          <MetricLineChart
            annotations={marks}
            title="Carbohydrates"
            unit="g"
            color={METRIC_COLOR.carbs}
            digits={0}
            data={points((food) => food.carbs)}
          />
          <MetricLineChart
            annotations={marks}
            title="Fat"
            unit="g"
            color={METRIC_COLOR.fat}
            digits={0}
            data={points((food) => food.fat)}
          />
          <MetricLineChart
            annotations={marks}
            title="Sugar"
            unit="g"
            color={METRIC_COLOR.sugar}
            digits={0}
            data={points((food) => food.sugar)}
          />
          <MetricLineChart
            annotations={marks}
            title="Sodium"
            unit="mg"
            color={METRIC_COLOR.sodium}
            digits={0}
            data={points((food) => food.sodium)}
          />
        </div>
      </details>

      <CollectionReadiness readiness={report.readiness} />
    </div>
  );
}

function LatestDayCard({ day }: { day: FoodLogDay }) {
  const g = (value: number | null) => (value != null ? `${Math.round(value)} g` : "Unknown");
  const mg = (value: number | null) => (value != null ? `${Math.round(value)} mg` : "Unknown");
  const stats: Array<{ label: string; value: string | number }> = [
    {
      label: "Calories",
      value:
        day.caloriesIn != null
          ? `${Math.round(day.caloriesIn)}${day.calorieGoal ? ` / ${Math.round(day.calorieGoal)}` : ""}`
          : "Unknown",
    },
    { label: "Protein", value: g(day.protein) },
    { label: "Fiber", value: g(day.fiber) },
    { label: "Carbs", value: g(day.carbs) },
    { label: "Fat", value: g(day.fat) },
    { label: "Sugar", value: g(day.sugar) },
    { label: "Saturated fat", value: g(day.saturatedFat) },
    { label: "Sodium", value: mg(day.sodium) },
    { label: "Cholesterol", value: mg(day.cholesterol) },
    { label: "Potassium", value: mg(day.potassium) },
    { label: "Items", value: day.foodCount ?? "Unknown" },
  ];
  return (
    <section aria-labelledby="latest-food-heading" className="bg-surface-container rounded-xl p-5">
      <h2
        id="latest-food-heading"
        className="text-sm font-headline font-semibold text-on-surface flex items-baseline justify-between"
      >
        <span className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden="true"
          >
            restaurant
          </span>
          Last logged day
        </span>
        <span className="text-[11px] text-outline tabular-nums">{day.date}</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-6 gap-3 mt-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <div className="text-lg font-bold font-headline tabular-nums text-on-surface break-words">
              {stat.value}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-outline">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
