import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SleepDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";

interface Props {
  data: SleepDay[];
}

export function SleepStagesChart({ data }: Props) {
  const ct = useChartTheme();
  const chartData = data.map((d) => ({
    date: d.date,
    deep: d.minutesDeep ?? 0,
    light: d.minutesLight ?? 0,
    rem: d.minutesRem ?? 0,
    wake: d.minutesWake ?? 0,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Sleep Stages</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis tick={ct.tick} label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: ct.tick.fill } }} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Legend />
          <Bar dataKey="deep" stackId="sleep" fill="#1e40af" name="Deep" />
          <Bar dataKey="light" stackId="sleep" fill="#60a5fa" name="Light" />
          <Bar dataKey="rem" stackId="sleep" fill="#a78bfa" name="REM" />
          <Bar dataKey="wake" stackId="sleep" fill="#fbbf24" name="Wake" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
