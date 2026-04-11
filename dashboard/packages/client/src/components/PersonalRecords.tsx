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
    <div className="flex items-center gap-3 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 dark:text-gray-400">{record.label}</div>
        <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {formatValue(record)}
          {record.unit !== "min" && record.unit !== "km" && (
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1 font-normal">
              {record.unit}
            </span>
          )}
        </div>
      </div>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
        {record.date}
      </div>
    </div>
  );
}

function StreakBar({ streak }: { streak: Streak }) {
  const pct = streak.best > 0 ? Math.round((streak.current / streak.best) * 100) : 0;

  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{streak.label}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          Best: {streak.best} {streak.unit}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all bg-indigo-500"
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-12 text-right">
          {streak.current}
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal ml-0.5">
            {streak.unit}
          </span>
        </span>
      </div>
    </div>
  );
}

export function PersonalRecords({ data }: { data: RecordsData }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Personal Records & Streaks
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        {data.records.map((r) => (
          <RecordCard key={r.metric} record={r} />
        ))}
      </div>

      <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
        Current Streaks
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {data.streaks.map((s) => (
          <StreakBar key={s.label} streak={s} />
        ))}
      </div>
    </div>
  );
}
