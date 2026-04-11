import type { ExerciseLog } from "@health-dashboard/shared";

interface Props {
  data: ExerciseLog[];
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "---";
  const totalMin = Math.round(ms / 60_000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
  return `${totalMin}m`;
}

function formatDistance(dist: number | null, unit: string | null): string {
  if (dist == null || dist === 0) return "---";
  return `${dist.toFixed(2)} ${unit ?? ""}`.trim();
}

/** Group exercises by activity name and compute summary stats */
function computeSummary(data: ExerciseLog[]) {
  const byName: Record<
    string,
    { count: number; totalCalories: number; totalDurationMs: number }
  > = {};
  for (const e of data) {
    if (!byName[e.activityName]) {
      byName[e.activityName] = { count: 0, totalCalories: 0, totalDurationMs: 0 };
    }
    const entry = byName[e.activityName];
    entry.count++;
    entry.totalCalories += e.calories ?? 0;
    entry.totalDurationMs += e.durationMs ?? 0;
  }
  return Object.entries(byName)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
}

export function ExerciseLogTable({ data }: Props) {
  const summary = computeSummary(data);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="bg-surface-container rounded-xl p-5">
        <h3 className="text-sm font-headline font-semibold text-on-surface mb-3">
          Exercise Summary
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-surface-container-low rounded-lg px-3 py-2">
            <div className="text-xs text-on-surface-variant">Total Workouts</div>
            <div className="text-xl font-bold text-on-surface">{data.length}</div>
          </div>
          <div className="bg-surface-container-low rounded-lg px-3 py-2">
            <div className="text-xs text-on-surface-variant">Total Calories</div>
            <div className="text-xl font-bold text-on-surface">
              {data
                .reduce((s, e) => s + (e.calories ?? 0), 0)
                .toLocaleString()}
            </div>
          </div>
          <div className="bg-surface-container-low rounded-lg px-3 py-2">
            <div className="text-xs text-on-surface-variant">Total Duration</div>
            <div className="text-xl font-bold text-on-surface">
              {formatDuration(
                data.reduce((s, e) => s + (e.durationMs ?? 0), 0),
              )}
            </div>
          </div>
          <div className="bg-surface-container-low rounded-lg px-3 py-2">
            <div className="text-xs text-on-surface-variant">Unique Activities</div>
            <div className="text-xl font-bold text-on-surface">
              {new Set(data.map((e) => e.activityName)).size}
            </div>
          </div>
        </div>

        {/* Activity type breakdown */}
        {summary.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-outline uppercase tracking-wider mb-2">
              By Activity Type
            </h4>
            <div className="space-y-1.5">
              {summary.map(([name, stats]) => (
                <div
                  key={name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-on-surface">{name}</span>
                  <span className="text-on-surface-variant">
                    {stats.count}x &middot;{" "}
                    {stats.totalCalories.toLocaleString()} cal &middot;{" "}
                    {formatDuration(stats.totalDurationMs)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full log table */}
      <div className="bg-surface-container rounded-xl p-5">
        <h3 className="text-sm font-headline font-semibold text-on-surface mb-3">
          Exercise Log
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/5">
                <th className="text-left py-2 pr-4 text-on-surface-variant font-medium">
                  Date
                </th>
                <th className="text-left py-2 px-2 text-on-surface-variant font-medium">
                  Activity
                </th>
                <th className="text-right py-2 px-2 text-on-surface-variant font-medium">
                  Duration
                </th>
                <th className="text-right py-2 px-2 text-on-surface-variant font-medium">
                  Calories
                </th>
                <th className="text-right py-2 px-2 text-on-surface-variant font-medium">
                  Avg HR
                </th>
                <th className="text-right py-2 px-2 text-on-surface-variant font-medium">
                  Distance
                </th>
                <th className="text-right py-2 px-2 text-on-surface-variant font-medium">
                  Steps
                </th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 50).map((e) => (
                <tr key={e.logId} className="border-b border-outline-variant/5">
                  <td className="py-1.5 pr-4 text-on-surface">{e.date}</td>
                  <td className="py-1.5 px-2 text-on-surface">
                    {e.activityName}
                  </td>
                  <td className="text-right py-1.5 px-2 text-on-surface">
                    {formatDuration(e.durationMs)}
                  </td>
                  <td className="text-right py-1.5 px-2 text-on-surface">
                    {e.calories?.toLocaleString() ?? "---"}
                  </td>
                  <td className="text-right py-1.5 px-2 text-on-surface">
                    {e.averageHeartRate ? `${e.averageHeartRate} bpm` : "---"}
                  </td>
                  <td className="text-right py-1.5 px-2 text-on-surface">
                    {formatDistance(e.distance, e.distanceUnit)}
                  </td>
                  <td className="text-right py-1.5 px-2 text-on-surface">
                    {e.steps?.toLocaleString() ?? "---"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
