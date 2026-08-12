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
  return `${s.toLocaleDateString("en-US", opts).toUpperCase()} - ${e.toLocaleDateString("en-US", opts).toUpperCase()}`;
}

/** Full labels for the multi-week weekday aggregates. */
const FULL_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ChangeArrow({ value }: { value: number }) {
  if (value === 0) return <span className="text-outline text-xs">--</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center text-sm font-bold ${up ? "text-secondary" : "text-error"}`}>
      <span className="material-symbols-outlined text-sm">{up ? "arrow_upward" : "arrow_downward"}</span>
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
    <div className="space-y-1">
      <p className="text-[10px] text-outline uppercase tracking-widest font-bold">{label}</p>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-headline font-bold tabular-nums text-on-surface">
          {fmt(metric.current)}
        </span>
      </div>
      <ChangeArrow value={change.changePercent} />
    </div>
  );
}

function DayOfWeekChart({
  data,
  sampleDays,
}: {
  data: DayOfWeekAvg[];
  sampleDays: number;
}) {
  const max = Math.max(...data.map((d) => d.avgSteps), 1);

  return (
    <div className="flex items-end gap-2 h-24 px-2 mt-4">
      {data.map((d) => {
        const pct = (d.avgSteps / max) * 100;
        const isTop = pct > 80;
        const dayLabel = FULL_DAY_NAMES[d.dow];
        const tip = `${dayLabel} · ${d.avgSteps.toLocaleString()} average steps · ${d.samples} days sampled`;
        return (
          <div key={d.dow} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full relative" style={{ height: "80px" }} title={tip}>
              <div
                className={`absolute bottom-0 w-full rounded-t-lg transition-all ${
                  isTop ? "bg-primary" : "bg-surface-container-highest"
                }`}
                style={{ height: `${Math.max(pct, 6)}%` }}
              />
            </div>
            <span
              title={`${dayLabel} average across ${sampleDays} completed days`}
              className={`text-[10px] font-bold uppercase tracking-widest cursor-help ${isTop ? "text-primary" : "text-outline"}`}
            >
              {d.dayName}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HighlightCard({ highlight }: { highlight: Highlight }) {
  const styles = {
    positive: { border: "border-secondary/10", label: "text-secondary", bg: "bg-surface-container-low" },
    negative: { border: "border-error/10", label: "text-error", bg: "bg-surface-container-low" },
    neutral: { border: "border-outline-variant/10", label: "text-primary", bg: "bg-surface-container-low" },
  };
  const s = styles[highlight.kind];

  return (
    <div className={`p-3 rounded-lg ${s.bg} border ${s.border}`}>
      <p className="text-sm text-on-surface-variant leading-relaxed">
        {highlight.text}
      </p>
    </div>
  );
}

export function WeeklyInsights({ data }: { data: WeeklyInsightsData }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-surface-container p-6">
      <div>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-headline font-semibold text-on-surface">
            Weekly Insights
          </h2>
          <span className="bg-surface-container-high px-3 py-1 rounded-full text-[10px] text-on-surface-variant border border-outline-variant/20 tracking-wider font-bold">
            {formatDateRange(data.currentPeriod.start, data.currentPeriod.end)}
          </span>
        </div>

        {/* Key metrics (editorial big numbers) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 mb-6">
          <MetricCard label="Avg Daily Steps" metric={data.steps} />
          {data.sleep && (
            <MetricCard
              label="Sleep Duration"
              metric={data.sleep}
              format={(v) => {
                const h = Math.floor(v / 60);
                const m = v % 60;
                return `${h}h ${m}m`;
              }}
            />
          )}
          {data.restingHr && (
            <MetricCard
              label="Resting HR"
              metric={data.restingHr}
              format={(v) => `${v}`}
              invertColor
            />
          )}
        </div>

        {/* Day-of-week activity bars */}
        <DayOfWeekChart
          data={data.dayOfWeek}
          sampleDays={data.dayOfWeekDays}
        />
        <p className="mt-4 text-[10px] text-outline">
          Weekday pattern across {data.dayOfWeekDays} completed days; today’s running total is excluded.
        </p>

        {/* Highlights */}
        {data.highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            {data.highlights.slice(0, 4).map((h, i) => (
              <HighlightCard key={i} highlight={h} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
