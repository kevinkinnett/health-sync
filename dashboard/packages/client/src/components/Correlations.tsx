import { useState } from "react";
import {
  ScatterChart,
  Scatter,
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
  CorrelationPair,
  ActivityBucket,
} from "@health-dashboard/shared";
import { useChartTheme } from "../stores/themeStore";

function CorrelationBadge({ r }: { r: number }) {
  const abs = Math.abs(r);
  let label: string;
  let color: string;
  if (abs >= 0.7) {
    label = "Strong";
    color = "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300";
  } else if (abs >= 0.4) {
    label = "Moderate";
    color = "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300";
  } else if (abs >= 0.2) {
    label = "Weak";
    color = "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300";
  } else {
    label = "None";
    color = "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500";
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      r = {r.toFixed(2)} ({label})
    </span>
  );
}

function ScatterPanel({ pair }: { pair: CorrelationPair }) {
  const ct = useChartTheme();

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {pair.xLabel} vs {pair.yLabel}
        </h3>
        <CorrelationBadge r={pair.correlation} />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {pair.insight}
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 5, right: 5, bottom: 20, left: 5 }}>
            <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="x"
              name={pair.xLabel}
              tick={ct.tick}
              label={{ value: pair.xLabel, position: "bottom", offset: 5, ...ct.tick }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={pair.yLabel}
              tick={ct.tick}
              width={45}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
              formatter={(value: number) => [value.toLocaleString()]}
              labelFormatter={() => ""}
            />
            <Scatter
              data={pair.points}
              fill="#6366f1"
              fillOpacity={0.6}
              r={3}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const BUCKET_COLORS = ["#94a3b8", "#6366f1", "#10b981"];

function ActivitySleepBuckets({ buckets }: { buckets: ActivityBucket[] }) {
  const ct = useChartTheme();
  const validBuckets = buckets.filter((b) => b.days > 0);
  if (validBuckets.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
        Sleep After Active Days
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        How next-night sleep varies by activity level
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {validBuckets.map((b) => (
          <div
            key={b.label}
            className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 text-center"
          >
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {b.label}
            </span>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">
              {Math.floor(b.avgSleepMin / 60)}h {b.avgSleepMin % 60}m
            </div>
            <div className="flex justify-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span>{b.avgDeepMin}m deep</span>
              <span>{b.avgEfficiency}% eff</span>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {b.days} days
            </span>
          </div>
        ))}
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={validBuckets} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid stroke={ct.grid} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={ct.tick}
            />
            <YAxis
              tick={ct.tick}
              width={40}
              label={{ value: "min", angle: -90, position: "insideLeft", ...ct.tick }}
            />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
            />
            <Bar dataKey="avgSleepMin" name="Avg Sleep" radius={[4, 4, 0, 0]}>
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

export function Correlations({ data }: { data: CorrelationsData }) {
  const [expanded, setExpanded] = useState(false);

  // Show top 2 by absolute correlation, expand shows all
  const sortedPairs = [...data.pairs].sort(
    (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
  );
  const visiblePairs = expanded ? sortedPairs : sortedPairs.slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Cross-Metric Correlations
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Based on {data.dataPoints} days of data
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visiblePairs.map((pair) => (
          <ScatterPanel key={`${pair.xMetric}-${pair.yMetric}`} pair={pair} />
        ))}
      </div>

      {sortedPairs.length > 2 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium"
        >
          {expanded
            ? "Show fewer"
            : `Show ${sortedPairs.length - 2} more correlation${sortedPairs.length - 2 > 1 ? "s" : ""}`}
        </button>
      )}

      <ActivitySleepBuckets buckets={data.activitySleepBuckets} />
    </div>
  );
}
