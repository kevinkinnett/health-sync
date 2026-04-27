import { useState } from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import type {
  CorrelationsData,
  ActivityBucket,
} from "@health-dashboard/shared";
import { useChartTheme } from "../stores/themeStore";
import { ScatterPanel } from "./charts/ScatterPanel";

const BUCKET_COLORS = ["#464554", "#c0c1ff", "#4edea3"];
const BUCKET_BORDERS = [
  "border-outline-variant",
  "border-primary",
  "border-secondary",
];

function ActivitySleepBuckets({ buckets }: { buckets: ActivityBucket[] }) {
  const ct = useChartTheme();
  const validBuckets = buckets.filter((b) => b.days > 0);
  if (validBuckets.length === 0) return null;

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Sleep After Active Days
      </h3>
      <p className="text-xs text-on-surface-variant mb-4">
        How next-night sleep varies by activity level
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {validBuckets.map((b, i) => (
          <div
            key={b.label}
            className={`rounded-xl bg-surface-container-low p-4 border-t-4 ${BUCKET_BORDERS[i] ?? "border-outline-variant"}`}
          >
            <span className="text-[10px] text-outline uppercase font-bold tracking-widest">
              {b.label}
            </span>
            <div className="text-2xl font-headline font-bold tabular-nums text-on-surface mt-1">
              {Math.floor(b.avgSleepMin / 60)}h {b.avgSleepMin % 60}m
            </div>
            <p className="text-xs text-on-surface-variant mt-1">
              Avg. Sleep Duration
            </p>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-outline">Deep Sleep</span>
                <span className="tabular-nums text-on-surface">
                  {b.avgDeepMin}m
                </span>
              </div>
              <div className="w-full h-1 bg-surface-container-highest rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (b.avgDeepMin / (b.avgSleepMin || 1)) * 100)}%`,
                    backgroundColor: BUCKET_COLORS[i],
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={validBuckets}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <CartesianGrid
              stroke={ct.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="label" tick={ct.tick} />
            <YAxis tick={ct.tick} width={40} />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
            />
            <Bar dataKey="avgSleepMin" name="Avg Sleep" radius={[6, 6, 0, 0]}>
              {validBuckets.map((_, i) => (
                <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Cross-metric correlation grid. The Dashboard view caps the visible
 * pairs at two with an expand-to-reveal toggle, while the dedicated
 * `/analytics/correlations` page passes `expandedByDefault` so all
 * pairs render up-front.
 */
export function Correlations({
  data,
  expandedByDefault = false,
}: {
  data: CorrelationsData;
  expandedByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandedByDefault);

  const sortedPairs = [...data.pairs].sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
  );
  const visiblePairs = expanded ? sortedPairs : sortedPairs.slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-headline font-semibold text-on-surface">
          Cross-Metric Correlations
        </h2>
        <span className="text-xs text-outline tabular-nums">
          Based on {data.dataPoints} days of data
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visiblePairs.map((pair) => (
          <ScatterPanel
            key={`${pair.xMetric}-${pair.yMetric}`}
            title={`${pair.xLabel} vs ${pair.yLabel}`}
            insight={pair.insight}
            correlation={pair.correlation}
            points={pair.points}
            xAxisLabel={pair.xLabel}
            yAxisLabel={pair.yLabel}
          />
        ))}
      </div>

      {!expandedByDefault && sortedPairs.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary hover:text-primary-container font-bold uppercase tracking-wider"
        >
          {expanded ? "Show fewer" : `Show ${sortedPairs.length - 2} more`}
        </button>
      )}

      <ActivitySleepBuckets buckets={data.activitySleepBuckets} />
    </div>
  );
}
