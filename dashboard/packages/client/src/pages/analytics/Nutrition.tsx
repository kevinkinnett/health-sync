import type { FoodLogDay } from "@health-dashboard/shared";
import { useFood } from "../../api/queries";
import {
  MetricLineChart,
  type MetricPoint,
} from "../../components/charts/MetricLineChart";
import { EmptyState, QueryBoundary } from "../../components/QueryBoundary";

/**
 * Nutrition / food-intake screen. Calorie + nutrient data rolled up from
 * Google Health's nutrition-log (manual or AI photo logging) by
 * ingest_google_health.
 *
 * Only days the user actually logged food appear — gaps mean "unlogged",
 * not zero intake — so the empty state and the copy lean on that.
 */
export function AnalyticsNutrition() {
  const q = useFood();
  return (
    <div className="space-y-4">
      <p className="text-sm text-on-surface-variant">
        Calorie and macronutrient intake from the days you logged food in
        Google Health / Fitbit (the AI photo logging counts too). Only logged
        days show here — a gap means nothing was logged, not zero.
      </p>
      <QueryBoundary
        query={q}
        empty={
          <EmptyState
            icon="restaurant"
            message="No food logged in this window yet — log a meal (the photo logger is quickest) and it'll appear here."
          />
        }
        isEmpty={(d) => d.length === 0}
      >
        {(data) => <NutritionBody data={data} />}
      </QueryBoundary>
    </div>
  );
}

function NutritionBody({ data }: { data: FoodLogDay[] }) {
  const latest = data[data.length - 1];
  return (
    <div className="space-y-4">
      {latest && <LatestDayCard day={latest} />}

      <MetricLineChart
        title="Calories In"
        description="Total calories logged per day. Pair with your activity / calories-out for energy balance."
        unit="cal"
        color="#ffd479"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.caloriesIn }))}
      />
      <MetricLineChart
        title="Protein"
        description="Grams of protein logged per day."
        unit="g"
        color="#4edea3"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.protein }))}
      />
      <MetricLineChart
        title="Carbohydrates"
        description="Grams of carbohydrate logged per day."
        unit="g"
        color="#7fd1ff"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.carbs }))}
      />
      <MetricLineChart
        title="Fat"
        description="Grams of fat logged per day."
        unit="g"
        color="#ffb2b7"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.fat }))}
      />
      <MetricLineChart
        title="Fiber"
        description="Grams of fiber logged per day."
        unit="g"
        color="#c9b6ff"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.fiber }))}
      />
      <MetricLineChart
        title="Sugar"
        description="Grams of sugar logged per day (a subset of carbohydrates)."
        unit="g"
        color="#ff9ecb"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.sugar }))}
      />
      <MetricLineChart
        title="Sodium"
        description="Milligrams of sodium logged per day."
        unit="mg"
        color="#9fe0ff"
        digits={0}
        data={data.map((d): MetricPoint => ({ date: d.date, value: d.sodium }))}
      />
    </div>
  );
}

function LatestDayCard({ day }: { day: FoodLogDay }) {
  const g = (v: number | null) => (v != null ? `${Math.round(v)} g` : "—");
  const mg = (v: number | null) => (v != null ? `${Math.round(v)} mg` : "—");
  const stats: { label: string; value: string | number }[] = [
    {
      label: "Calories",
      value:
        day.caloriesIn != null
          ? `${Math.round(day.caloriesIn)}${day.calorieGoal ? ` / ${Math.round(day.calorieGoal)}` : ""}`
          : "—",
    },
    { label: "Protein", value: g(day.protein) },
    { label: "Carbs", value: g(day.carbs) },
    { label: "Sugar", value: g(day.sugar) },
    { label: "Fat", value: g(day.fat) },
    { label: "Sat Fat", value: g(day.saturatedFat) },
    { label: "Fiber", value: g(day.fiber) },
    { label: "Sodium", value: mg(day.sodium) },
    { label: "Cholesterol", value: mg(day.cholesterol) },
    { label: "Potassium", value: mg(day.potassium) },
    { label: "Items", value: day.foodCount ?? "—" },
  ];
  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface flex items-baseline justify-between">
        <span className="flex items-center gap-2">
          <span
            className="material-symbols-outlined text-primary text-base"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            restaurant
          </span>
          Last logged day
        </span>
        <span className="text-[11px] text-outline tabular-nums">{day.date}</span>
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-4">
        {stats.map((s) => (
          <div key={s.label}>
            <div className="text-xl font-bold font-headline tabular-nums text-on-surface">
              {s.value}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-outline">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
