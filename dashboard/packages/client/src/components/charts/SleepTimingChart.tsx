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
import { useUserTimezone } from "../../api/queries";

// Internal Y-axis units: minutes since 6:00 PM in the user's timezone.
// 0   = 6:00 PM
// 360 = 12:00 AM (midnight)
// 720 = 6:00 AM
// 1080 = noon (rare for sleep — reserved for late-day naps)
//
// The 6 PM anchor places typical bedtimes (8 PM – 1 AM = 120–420)
// and wake times (5 AM – 9 AM = 660–900) on a single non-wrapping
// continuous axis, so the chart never has to render two cross-midnight
// labels at the same numeric position. This was the cause of the
// "two hours off" wraparound in the previous implementation.
const ANCHOR_HOUR = 18; // 6 PM
const MINUTES_IN_DAY = 1440;

interface WallClock {
  hour: number;
  minute: number;
}

function getWallClock(timeStr: string, tz: string): WallClock | null {
  if (!timeStr) return null;
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return null;
  // `Intl.DateTimeFormat` resolves the wall-clock value in the IANA
  // zone Fitbit's profile is set to (configured server-side and exposed
  // via /api/config). Using `getUTCHours()` here only worked by accident
  // when the server stored naive timestamps as UTC; the new ingest path
  // stores correct instants, so we must extract the correct wall-clock
  // here.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const hStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const mStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const hour = parseInt(hStr, 10);
  const minute = parseInt(mStr, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function wallClockToAnchored(wc: WallClock): number {
  // Map (hour, minute) → minutes since 6 PM, wrapping forward only.
  const raw = wc.hour * 60 + wc.minute;
  const anchored = raw - ANCHOR_HOUR * 60;
  return anchored >= 0 ? anchored : anchored + MINUTES_IN_DAY;
}

function anchoredToLabel(mins: number): string {
  // Convert "minutes since 6 PM" back to a 12-hour wall-clock label.
  // We deliberately do NOT modulo MINUTES_IN_DAY again — the input
  // is already in [0, MINUTES_IN_DAY) by construction, so the label
  // is unambiguous within a single sleep cycle.
  const wallclock = (mins + ANCHOR_HOUR * 60) % MINUTES_IN_DAY;
  const h = Math.floor(wallclock / 60);
  const m = wallclock % 60;
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
  const tz = useUserTimezone();

  const bedtimes: { date: string; time: number }[] = [];
  const waketimes: { date: string; time: number }[] = [];

  for (const d of data) {
    if (d.mainSleepStartTime) {
      const wc = getWallClock(d.mainSleepStartTime, tz);
      if (wc) bedtimes.push({ date: d.date, time: wallClockToAnchored(wc) });
    }
    if (d.mainSleepEndTime) {
      const wc = getWallClock(d.mainSleepEndTime, tz);
      if (wc) waketimes.push({ date: d.date, time: wallClockToAnchored(wc) });
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
        <span>Avg bedtime: <span className="font-medium text-on-surface">{anchoredToLabel(Math.round(avgBedtime))}</span></span>
        {avgWaketime != null && (
          <span>Avg wake: <span className="font-medium text-on-surface">{anchoredToLabel(Math.round(avgWaketime))}</span></span>
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
            tickFormatter={(v: number) => anchoredToLabel(Math.round(v))}
            width={65}
          />
          <Tooltip
            contentStyle={ct.tooltip.contentStyle}
            labelStyle={ct.tooltip.labelStyle}
            itemStyle={ct.tooltip.itemStyle}
            formatter={(value: number) => [anchoredToLabel(Math.round(value))]}
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
