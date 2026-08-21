import type { NutritionWeightReport } from "@health-dashboard/shared";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "../../stores/themeStore";
import type { ChartAnnotation } from "../charts/annotations";
import { annotationMarkers } from "../charts/annotationMarkers";
import { METRIC_COLOR, SERIES } from "../charts/chartPalette";

interface Props {
  report: NutritionWeightReport;
  annotations?: ChartAnnotation[];
}

export function EnergyContextChart({ report, annotations = [] }: Props) {
  const ct = useChartTheme();
  const data = report.days.map((day) => ({
    date: day.date,
    caloriesIn: day.food?.caloriesIn ?? null,
    caloriesOut: day.estimatedCaloriesOut,
    trainingLoad: day.trainingLoad,
  }));

  return (
    <section
      aria-labelledby="energy-context-heading"
      className="bg-surface-container rounded-xl p-5"
    >
      <h2 id="energy-context-heading" className="text-sm font-headline font-semibold text-on-surface">
        Intake, estimated output, and training
      </h2>
      <p className="text-xs text-outline mt-1 mb-4">
        Values share a local calendar date. Breaks in the intake series are unlogged days.
        Training load uses the right axis and provides context, not proof of an effect.
      </p>
      <ResponsiveContainer width="100%" height={310}>
        <ComposedChart data={data} accessibilityLayer>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis yAxisId="calories" tick={ct.tick} width={52} />
          <YAxis yAxisId="load" orientation="right" tick={ct.tick} width={42} />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={ct.tooltip.labelStyle}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value) =>
              typeof value === "number" ? Math.round(value).toLocaleString() : "Unknown"
            }
          />
          <Legend />
          {annotationMarkers(annotations)}
          <Bar
            yAxisId="calories"
            dataKey="caloriesIn"
            fill={METRIC_COLOR.caloriesIn}
            fillOpacity={0.55}
            name="Logged intake (kcal)"
          />
          <Line
            yAxisId="calories"
            type="monotone"
            dataKey="caloriesOut"
            stroke={METRIC_COLOR.estimatedCaloriesOut}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
            name="Estimated output (kcal)"
          />
          <Line
            yAxisId="load"
            type="monotone"
            dataKey="trainingLoad"
            stroke={SERIES[5]}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={{ r: 2 }}
            connectNulls={false}
            name="Training load"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
