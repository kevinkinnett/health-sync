import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { HeartRateDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { movingAverage } from "../../utils/movingAverage";

interface Props {
  data: HeartRateDay[];
}

export function HeartRateChart({ data }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.restingHeartRate, 7);

  const chartData = data.map((d, i) => ({
    date: d.date,
    rhr: d.restingHeartRate,
    ma7d: ma7[i],
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Resting Heart Rate</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tick={ct.tick} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Line
            type="monotone"
            dataKey="rhr"
            stroke="#ef4444"
            strokeWidth={1.5}
            dot={{ r: 2 }}
            connectNulls
            name="RHR"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            name="7-day avg"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
