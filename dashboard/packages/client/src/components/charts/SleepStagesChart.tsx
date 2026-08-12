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
import type { ChartAnnotation } from "./annotations";
import { annotationMarkers } from "./annotationMarkers";
import { movingAverage } from "../../utils/movingAverage";
import { SLEEP_STAGE_COLOR } from "./chartPalette";

interface Props {
  data: SleepDay[];
  /** Vertical markers for dated changes (see `annotations.ts`). */
  annotations?: ChartAnnotation[];
}

export function SleepStagesChart({ data, annotations = [] }: Props) {
  const ct = useChartTheme();
  const ma7 = movingAverage(data, (d) => d.totalMinutesAsleep, 7);
  const chartData = data.map((d, i) => ({
    date: d.date,
    // Null is unknown, not zero. Leaving the gap visible prevents a missing
    // stage breakdown from looking like a physiologically impossible night.
    deep: d.minutesDeep,
    light: d.minutesLight,
    rem: d.minutesRem,
    wake: d.minutesWake,
    sleepMA: ma7[i],
  }));

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">Sleep Stages</h3>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData}>
          {annotationMarkers(annotations)}
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis tick={ct.tick} label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: ct.tick.fill } }} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Legend />
          <Bar dataKey="deep" stackId="sleep" fill={SLEEP_STAGE_COLOR.deep} name="Deep" />
          <Bar dataKey="light" stackId="sleep" fill={SLEEP_STAGE_COLOR.light} name="Light" />
          <Bar dataKey="rem" stackId="sleep" fill={SLEEP_STAGE_COLOR.rem} name="REM" />
          <Bar dataKey="wake" stackId="sleep" fill={SLEEP_STAGE_COLOR.wake} name="Wake" />
          <Line
            type="monotone"
            dataKey="sleepMA"
            stroke="#0a5e49"
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
            name="7-day avg time asleep"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
