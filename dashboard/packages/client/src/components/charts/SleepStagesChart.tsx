import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { SleepDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { movingAverage } from "../../utils/movingAverage";

interface Props {
  data: SleepDay[];
}

export function SleepStagesChart({ data }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.totalMinutesAsleep, 7);
  const chartData = data.map((d, i) => ({
    date: d.date,
    deep: d.minutesDeep ?? 0,
    light: d.minutesLight ?? 0,
    rem: d.minutesRem ?? 0,
    wake: d.minutesWake ?? 0,
    sleepMA: ma7[i],
  }));

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Sleep Stages</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis tick={ct.tick} label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: ct.tick.fill } }} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Legend />
          <Bar dataKey="deep" stackId="sleep" fill="#0d7a5f" name="Deep" />
          <Bar dataKey="light" stackId="sleep" fill="#4edea3" name="Light" />
          <Bar dataKey="rem" stackId="sleep" fill="#80ebc2" name="REM" />
          <Bar dataKey="wake" stackId="sleep" fill="#ffb2b7" name="Wake" />
          <Line
            type="monotone"
            dataKey="sleepMA"
            stroke="#0a5e49"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            name="7-day avg"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
