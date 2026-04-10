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

interface Props {
  data: SleepDay[];
}

export function SleepStagesChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date,
    deep: d.minutesDeep ?? 0,
    light: d.minutesLight ?? 0,
    rem: d.minutesRem ?? 0,
    wake: d.minutesWake ?? 0,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-medium text-gray-500 mb-4">Sleep Stages</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
          <Tooltip />
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
