import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { HrvDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";

interface Props {
  data: HrvDay[];
}

export function HrvChart({ data }: Props) {
  const ct = useChartTheme();

  const chartData = data.map((d, i) => {
    const window = data.slice(Math.max(0, i - 6), i + 1);
    const validValues = window
      .map((w) => w.dailyRmssd)
      .filter((v): v is number => v != null);
    const ma =
      validValues.length > 0
        ? Math.round(
            (validValues.reduce((a, b) => a + b, 0) / validValues.length) * 10,
          ) / 10
        : null;

    return {
      date: d.date,
      dailyRmssd: d.dailyRmssd != null ? Math.round(d.dailyRmssd * 10) / 10 : null,
      deepRmssd: d.deepRmssd != null ? Math.round(d.deepRmssd * 10) / 10 : null,
      ma7d: ma,
    };
  });

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Heart Rate Variability (RMSSD)
      </h3>
      <p className="text-xs text-outline mb-4">
        Higher HRV generally indicates better cardiovascular fitness and
        recovery. Deep sleep RMSSD reflects parasympathetic activity during
        restorative sleep.
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis
            domain={["dataMin - 5", "dataMax + 10"]}
            tick={ct.tick}
            label={{
              value: "ms",
              position: "insideLeft",
              offset: 10,
              style: { fontSize: 11, fill: ct.tick.fill },
            }}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={{ ...ct.tooltip.labelStyle, fontWeight: 600 }}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value: number) => [`${value} ms`]}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="dailyRmssd"
            stroke="#c0c1ff"
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Daily RMSSD"
          />
          <Line
            type="monotone"
            dataKey="deepRmssd"
            stroke="#4edea3"
            strokeWidth={1.5}
            dot={{ r: 1.5 }}
            connectNulls
            name="Deep Sleep RMSSD"
          />
          <Line
            type="monotone"
            dataKey="ma7d"
            stroke="#9b9dff"
            strokeWidth={2.5}
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
