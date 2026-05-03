import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { WeightEntry } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { useUnits } from "../../stores/unitsStore";
import { convertWeight, weightUnitLabel } from "../../lib/units";

interface Props {
  data: WeightEntry[];
}

export function WeightChart({ data }: Props) {
  const ct = useChartTheme();
  const units = useUnits();

  if (data.length === 0) {
    return (
      <div className="bg-surface-container rounded-xl p-5">
        <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Weight</h3>
        <div className="h-[280px] flex items-center justify-center text-outline text-sm">
          No weight data yet
        </div>
      </div>
    );
  }

  // Convert each row's weight up front so the chart axis, tooltip, and
  // line label all stay in the user's preferred system.
  const chartData = data.map((d) => ({
    date: d.date,
    weight: convertWeight(d.weightKg, units),
  }));
  const unitLabel = weightUnitLabel(units);

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Weight</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} type="category" />
          <YAxis
            domain={["dataMin - 1", "dataMax + 1"]}
            tick={ct.tick}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={ct.tooltip.labelStyle}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value: number) => [`${value.toFixed(1)} ${unitLabel}`]}
          />
          <Line
            type="monotone"
            dataKey="weight"
            stroke="#4edea3"
            strokeWidth={2}
            dot={{ r: 3, fill: "#4edea3" }}
            connectNulls
            name={`Weight (${unitLabel})`}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
