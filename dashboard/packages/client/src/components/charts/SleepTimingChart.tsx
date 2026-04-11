import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { SleepDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";

function timeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return null;
  let mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  // Normalize bedtimes: if before noon, add 24h (e.g., 1am = 25*60)
  if (mins < 720) mins += 1440;
  return mins;
}

function minutesToTimeLabel(mins: number): string {
  const normalized = mins % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function computeConsistency(values: number[]): { score: number; stdDev: number } {
  if (values.length < 2) return { score: 100, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  // Score: 100 = perfect consistency, 0 = 2+ hours std dev
  const score = Math.max(0, Math.round(100 - (stdDev / 120) * 100));
  return { score, stdDev };
}

interface Props {
  data: SleepDay[];
}

export function SleepTimingChart({ data }: Props) {
  const ct = useChartTheme();

  const bedtimes: { date: string; time: number }[] = [];
  const waketimes: { date: string; time: number }[] = [];

  for (const d of data) {
    if (d.mainSleepStartTime) {
      const mins = timeToMinutes(d.mainSleepStartTime);
      if (mins != null) bedtimes.push({ date: d.date, time: mins });
    }
    if (d.mainSleepEndTime) {
      const mins = timeToMinutes(d.mainSleepEndTime);
      if (mins != null) {
        // Wake times are typically morning, normalize to 0-1440
        const wakeMins = mins >= 1440 ? mins - 1440 : mins;
        waketimes.push({ date: d.date, time: wakeMins });
      }
    }
  }

  if (bedtimes.length === 0) return null;

  const bedConsistency = computeConsistency(bedtimes.map((b) => b.time));
  const wakeConsistency = computeConsistency(waketimes.map((w) => w.time));

  const avgBedtime = bedtimes.reduce((a, b) => a + b.time, 0) / bedtimes.length;
  const avgWaketime = waketimes.length > 0
    ? waketimes.reduce((a, b) => a + b.time, 0) / waketimes.length
    : null;

  // Combined for the chart — use index as X axis
  const chartBedtimes = bedtimes.map((b, i) => ({ index: i, time: b.time, date: b.date }));
  const chartWaketimes = waketimes.map((w, i) => ({ index: i, time: w.time, date: w.date }));

  const allTimes = [
    ...bedtimes.map((b) => b.time),
    ...waketimes.map((w) => w.time),
  ];
  const minTime = Math.min(...allTimes) - 30;
  const maxTime = Math.max(...allTimes) + 30;

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-headline font-semibold text-on-surface">Sleep Timing</h3>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-lg font-bold text-on-surface">
              {bedConsistency.score}
            </div>
            <div className="text-[10px] text-outline">Bedtime Score</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-on-surface">
              {wakeConsistency.score}
            </div>
            <div className="text-[10px] text-outline">Wake Score</div>
          </div>
        </div>
      </div>

      {/* Avg times */}
      <div className="flex gap-4 mb-3 text-xs text-on-surface-variant">
        <span>Avg bedtime: <span className="font-medium text-on-surface">{minutesToTimeLabel(Math.round(avgBedtime))}</span></span>
        {avgWaketime != null && (
          <span>Avg wake: <span className="font-medium text-on-surface">{minutesToTimeLabel(Math.round(avgWaketime))}</span></span>
        )}
        <span>Bedtime spread: <span className="font-medium text-on-surface">{Math.round(bedConsistency.stdDev)} min</span></span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="index"
            tick={false}
            label={{ value: "Days", position: "bottom", ...ct.tick }}
          />
          <YAxis
            type="number"
            dataKey="time"
            domain={[minTime, maxTime]}
            tick={ct.tick}
            tickFormatter={(v: number) => minutesToTimeLabel(Math.round(v))}
            width={65}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={ct.tooltip.labelStyle}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value: number) => [minutesToTimeLabel(Math.round(value))]}
            labelFormatter={(_: unknown, payload: Array<{ payload?: { date?: string } }>) =>
              payload?.[0]?.payload?.date ?? ""
            }
          />
          <Legend />
          <ReferenceLine
            y={avgBedtime}
            stroke="#c0c1ff"
            strokeDasharray="5 5"
            strokeOpacity={0.5}
          />
          {avgWaketime != null && (
            <ReferenceLine
              y={avgWaketime}
              stroke="#4edea3"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
          )}
          <Scatter name="Bedtime" data={chartBedtimes} fill="#c0c1ff" r={3} />
          <Scatter name="Wake" data={chartWaketimes} fill="#4edea3" r={3} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
