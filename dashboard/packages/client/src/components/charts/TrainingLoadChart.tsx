import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExerciseType, TrainingSummary } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { SERIES } from "./chartPalette";
import { formatNumber } from "./tooltipFormat";

/**
 * Daily training load, stacked by exercise type.
 *
 * The reason this chart exists: every other activity view in the app is
 * step-derived, so resistance work — which produces no steps — showed up
 * as an empty day. Here a 50-minute session at 124 bpm is a bar.
 *
 * Stacked in a fixed type order, taking consecutive palette slots, which
 * is the ordering the colour adjacency check validated.
 */

/** Fixed order so a colour always means the same kind of work. */
const TYPE_ORDER: ExerciseType[] = ["strength", "cardio", "walk", "chore", "other"];

const TYPE_LABEL: Record<ExerciseType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  walk: "Walk",
  chore: "Chores",
  other: "Other",
};

const TYPE_COLOR: Record<ExerciseType, string> = {
  strength: SERIES[0],
  cardio: SERIES[1],
  walk: SERIES[2],
  chore: SERIES[3],
  other: SERIES[4],
};

export function TrainingLoadChart({ data }: { data: TrainingSummary }) {
  const ct = useChartTheme();

  const rows = data.days.map((day) => ({
    date: day.date,
    ...Object.fromEntries(TYPE_ORDER.map((t) => [t, day.byType[t] ?? 0])),
  }));

  // Only stack the types actually present, so the legend doesn't advertise
  // categories this window has none of.
  const present = TYPE_ORDER.filter((t) =>
    data.days.some((d) => (d.byType[t] ?? 0) > 0),
  );

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface">
        Training load
      </h3>
      <p className="text-xs text-on-surface-variant mt-1 mb-4 max-w-prose">
        Effort weighted by heart rate and duration, so work that produces no
        steps still counts. A self-relative index — compare your days to each
        other, not to an absolute scale.
      </p>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
            <XAxis dataKey="date" tick={ct.tick} tickLine={false} />
            <YAxis tick={ct.tick} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={formatNumber((v) => String(Math.round(v)))}
            />
            <Legend />
            {present.map((type) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="load"
                fill={TYPE_COLOR[type]}
                name={TYPE_LABEL[type]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <Stat label="Sessions / week" value={data.sessionsPerWeek.toFixed(1)} />
        <Stat label="Sessions" value={String(data.sessions.length)} />
        <Stat
          label="Strength load"
          value={String(Math.round(data.totalByType.strength ?? 0))}
        />
        <Stat
          label="Total load"
          value={String(
            Math.round(
              Object.values(data.totalByType).reduce((a, b) => a + b, 0),
            ),
          )}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-bold font-headline tabular-nums text-on-surface">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-outline">
        {label}
      </div>
    </div>
  );
}
