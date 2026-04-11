import type { RecordsData, PersonalRecord, Streak } from "@health-dashboard/shared";

function formatValue(record: PersonalRecord): string {
  if (record.unit === "min" && record.value >= 60) {
    const h = Math.floor(record.value / 60);
    const m = record.value % 60;
    return `${h}h ${m}m`;
  }
  if (record.unit === "km") return `${record.value} km`;
  return record.value.toLocaleString();
}

function RecordCard({ record }: { record: PersonalRecord }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-container-low p-3">
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-outline uppercase tracking-widest font-bold">
          {record.label}
        </div>
        <div className="text-lg font-bold font-headline tabular-nums text-on-surface">
          {formatValue(record)}
          {record.unit !== "min" && record.unit !== "km" && (
            <span className="text-xs text-outline ml-1 font-normal">
              {record.unit}
            </span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-outline shrink-0 tabular-nums">
        {record.date}
      </div>
    </div>
  );
}

function StreakBar({ streak }: { streak: Streak }) {
  const pct = streak.best > 0 ? Math.round((streak.current / streak.best) * 100) : 0;

  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[10px] text-outline uppercase tracking-widest font-bold">
          {streak.label}
        </span>
        <span className="text-[10px] text-outline tabular-nums">
          Best: {streak.best} {streak.unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-primary"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="text-sm font-bold tabular-nums text-on-surface w-12 text-right">
          {streak.current}
          <span className="text-[10px] text-outline font-normal ml-0.5">
            {streak.unit}
          </span>
        </span>
      </div>
    </div>
  );
}

export function PersonalRecords({ data }: { data: RecordsData }) {
  return (
    <div className="bg-surface-container rounded-xl p-6">
      <h2 className="text-lg font-headline font-semibold text-on-surface mb-4">
        Personal Records & Streaks
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {data.records.map((r) => (
          <RecordCard key={r.metric} record={r} />
        ))}
      </div>

      <h3 className="text-[10px] font-bold text-outline uppercase tracking-widest mb-3">
        Current Streaks
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {data.streaks.map((s) => (
          <StreakBar key={s.label} streak={s} />
        ))}
      </div>
    </div>
  );
}
