import type { NutritionWeightReport, WeightEntry } from "@health-dashboard/shared";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { convertWeight, formatWeight, weightUnitLabel } from "../../lib/units";
import { useUnits } from "../../stores/unitsStore";
import { useChartTheme } from "../../stores/themeStore";
import type { ChartAnnotation } from "../charts/annotations";
import { annotationMarkers } from "../charts/annotationMarkers";
import { CHART_CHROME, METRIC_COLOR } from "../charts/chartPalette";

interface Props {
  report: NutritionWeightReport;
  annotations?: ChartAnnotation[];
}

function formatChange(valueKg: number | null, units: "metric" | "imperial"): string {
  const value = convertWeight(valueKg, units);
  if (value == null) return "Collecting data";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} ${weightUnitLabel(units)}`;
}

function observationLabel(entry: WeightEntry): string {
  return entry.time ? `${entry.date} at ${entry.time.slice(0, 5)}` : entry.date;
}

export function WeightTrend({ report, annotations = [] }: Props) {
  const ct = useChartTheme();
  const units = useUnits();
  const unit = weightUnitLabel(units);
  const chartData = report.days.map((day) => ({
    date: day.date,
    dailyMedian: convertWeight(day.dailyWeightMedianKg, units),
    trend: convertWeight(day.weightTrendKg, units),
  }));
  const observations = report.days.flatMap((day) => day.weightObservations);
  const stats = [
    { label: "Latest", value: formatWeight(report.weight.latest?.weightKg, units) },
    { label: "7-day change", value: formatChange(report.weight.change7dKg, units) },
    { label: "30-day change", value: formatChange(report.weight.change30dKg, units) },
    {
      label: "Check-in cadence",
      value: `${report.weight.observedDates} dates`,
      detail: `${report.weight.observationCount} total observations`,
    },
  ];

  return (
    <section aria-labelledby="weight-trend-heading" className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-surface-container rounded-xl p-4 min-w-0">
            <div className="text-lg font-bold font-headline tabular-nums text-on-surface break-words">
              {stat.value}
            </div>
            <div className="text-[11px] font-semibold text-on-surface-variant mt-1">{stat.label}</div>
            {stat.detail && <div className="text-[10px] text-outline mt-0.5">{stat.detail}</div>}
          </div>
        ))}
      </div>

      <div className="bg-surface-container rounded-xl p-5">
        <h2 id="weight-trend-heading" className="text-sm font-headline font-semibold text-on-surface">
          Weight observations and trend
        </h2>
        <p className="text-xs text-outline mt-1 mb-4">
          Dots are each day&apos;s median. The line is a seven-calendar-day rolling median and
          appears only when at least three distinct check-in dates are available in the window.
        </p>
        <ResponsiveContainer width="100%" height={310}>
          <ComposedChart data={chartData} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
            <XAxis dataKey="date" tick={ct.tick} />
            <YAxis
              domain={["dataMin - 1", "dataMax + 1"]}
              tick={ct.tick}
              width={68}
              tickFormatter={(value: number) => `${value.toFixed(1)} ${unit}`}
            />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={(value) =>
                typeof value === "number" ? `${value.toFixed(1)} ${unit}` : "Unknown"
              }
            />
            <Legend />
            {annotationMarkers(annotations)}
            <Line
              type="monotone"
              dataKey="dailyMedian"
              stroke="transparent"
              strokeWidth={0}
              dot={{ r: 4, fill: METRIC_COLOR.weight }}
              connectNulls={false}
              name="Daily median"
            />
            <Line
              type="monotone"
              dataKey="trend"
              stroke={METRIC_COLOR.weight}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              name="7-day rolling median"
            />
          </ComposedChart>
        </ResponsiveContainer>
        {report.weight.reasons.length > 0 && (
          <p className="text-xs text-outline mt-2">{report.weight.reasons.join(" ")}</p>
        )}
      </div>

      <div className="bg-surface-container rounded-xl p-5">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 className="text-sm font-headline font-semibold text-on-surface">Raw observations</h2>
          <span className="text-[11px] text-outline">Source-local measurement time</span>
        </div>
        <div className="max-h-72 overflow-auto rounded-lg border border-outline-variant/10">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-container-high text-outline">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Measured</th>
                <th scope="col" className="px-3 py-2 font-semibold">Weight</th>
                <th scope="col" className="px-3 py-2 font-semibold hidden sm:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {[...observations].reverse().map((entry) => (
                <tr key={entry.logId} className="border-t border-outline-variant/10">
                  <td className="px-3 py-2 text-on-surface-variant tabular-nums">
                    {observationLabel(entry)}
                  </td>
                  <td className="px-3 py-2 text-on-surface font-semibold tabular-nums">
                    {formatWeight(entry.weightKg, units)}
                  </td>
                  <td className="px-3 py-2 text-outline hidden sm:table-cell">
                    {entry.source ?? "Unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {observations.length === 0 && (
            <p className="p-4 text-sm text-outline">No weight observations in this window.</p>
          )}
        </div>
        <p className="text-[11px] text-outline mt-3 flex items-start gap-2">
          <span
            className="block h-2 w-2 rounded-full mt-1"
            style={{ backgroundColor: CHART_CHROME.inactive }}
            aria-hidden="true"
          />
          Multiple measurements on the same local date remain visible here and contribute to that
          date&apos;s median.
        </p>
      </div>
    </section>
  );
}
