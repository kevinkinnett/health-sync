import type {
  WeeklyInsights as WeeklyInsightsData,
  MetricComparison,
  DayOfWeekAvg,
  Highlight,
} from "@health-dashboard/shared";

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${s.toLocaleDateString("en-US", opts)} - ${e.toLocaleDateString("en-US", opts)}`;
}

function ChangeArrow({ value }: { value: number }) {
  if (value === 0) return <span className="text-gray-400 dark:text-gray-500 text-xs">--</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center text-xs font-medium ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
      <svg className="w-3 h-3 mr-0.5" viewBox="0 0 12 12" fill="none">
        <path
          d={up ? "M6 2L10 7H2L6 2Z" : "M6 10L2 5H10L6 10Z"}
          fill="currentColor"
        />
      </svg>
      {Math.abs(value)}%
    </span>
  );
}

function MetricCard({
  label,
  metric,
  format,
  invertColor,
}: {
  label: string;
  metric: MetricComparison;
  format?: (v: number) => string;
  invertColor?: boolean;
}) {
  const fmt = format ?? ((v: number) => v.toLocaleString());
  const change = invertColor
    ? { ...metric, changePercent: -metric.changePercent }
    : metric;

  return (
    <div className="flex flex-col">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
        {fmt(metric.current)}
      </span>
      <div className="flex items-center gap-1.5 mt-0.5">
        <ChangeArrow value={change.changePercent} />
        <span className="text-xs text-gray-400 dark:text-gray-500">
          was {fmt(metric.previous)}
        </span>
      </div>
    </div>
  );
}

function DayOfWeekChart({ data }: { data: DayOfWeekAvg[] }) {
  const max = Math.max(...data.map((d) => d.avgSteps), 1);

  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map((d) => {
        const pct = (d.avgSteps / max) * 100;
        return (
          <div key={d.dow} className="flex flex-col items-center flex-1 gap-1">
            <div className="w-full relative" style={{ height: "48px" }}>
              <div
                className="absolute bottom-0 w-full rounded-sm bg-indigo-400 dark:bg-indigo-500 transition-all"
                style={{ height: `${Math.max(pct, 4)}%` }}
                title={`${d.dayName}: ${d.avgSteps.toLocaleString()} avg steps`}
              />
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
              {d.dayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HighlightPill({ highlight }: { highlight: Highlight }) {
  const colors = {
    positive: "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
    negative: "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
    neutral: "bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${colors[highlight.kind]}`}>
      {highlight.text}
    </span>
  );
}

export function WeeklyInsights({ data }: { data: WeeklyInsightsData }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Weekly Insights
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatDateRange(data.currentPeriod.start, data.currentPeriod.end)}
          {" vs "}
          {formatDateRange(data.previousPeriod.start, data.previousPeriod.end)}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 mb-5">
        <MetricCard label="Avg Steps" metric={data.steps} />
        <MetricCard
          label="Active Min"
          metric={data.activeMinutes}
          format={(v) => `${v} min`}
        />
        <MetricCard
          label="Distance"
          metric={data.distance}
          format={(v) => `${v.toFixed(1)} km`}
        />
        <MetricCard
          label="Calories"
          metric={data.calories}
        />
        {data.sleep && (
          <MetricCard
            label="Sleep"
            metric={data.sleep}
            format={(v) => {
              const h = Math.floor(v / 60);
              const m = v % 60;
              return `${h}h ${m}m`;
            }}
          />
        )}
        {data.sleepEfficiency && (
          <MetricCard
            label="Sleep Eff."
            metric={data.sleepEfficiency}
            format={(v) => `${v}%`}
          />
        )}
        {data.restingHr && (
          <MetricCard
            label="Resting HR"
            metric={data.restingHr}
            format={(v) => `${v} bpm`}
            invertColor
          />
        )}
      </div>

      {/* Bottom row: day-of-week chart + highlights */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="sm:w-48 shrink-0">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-2">
            Day-of-Week Pattern
          </span>
          <DayOfWeekChart data={data.dayOfWeek} />
        </div>
        <div className="flex-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium block mb-2">
            Highlights
          </span>
          <div className="flex flex-wrap gap-2">
            {data.highlights.map((h, i) => (
              <HighlightPill key={i} highlight={h} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
