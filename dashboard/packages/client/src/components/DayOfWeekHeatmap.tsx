import type { DayOfWeekHeatmapData, DayOfWeekHeatmapRow } from "@health-dashboard/shared";

function interpolateColor(t: number, isDark: boolean): string {
  // t is 0..1 where 0 = low, 1 = high
  // Light: white -> indigo-100 -> indigo-500
  // Dark:  gray-800 -> indigo-900 -> indigo-400
  if (isDark) {
    const r = Math.round(30 + t * (99 - 30));
    const g = Math.round(41 + t * (102 - 41));
    const b = Math.round(59 + t * (241 - 59));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const r = Math.round(255 - t * (255 - 99));
  const g = Math.round(255 - t * (255 - 102));
  const b = Math.round(255 - t * (255 - 241));
  return `rgb(${r}, ${g}, ${b})`;
}

function CellValue({
  row,
  dayIndex,
  isDark,
}: {
  row: DayOfWeekHeatmapRow;
  dayIndex: number;
  isDark: boolean;
}) {
  const val = row.values[dayIndex];
  if (val == null) {
    return (
      <td className="p-1.5">
        <div className="rounded-md h-10 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
          <span className="text-[10px] text-gray-300 dark:text-gray-600">--</span>
        </div>
      </td>
    );
  }

  const range = row.max - row.min;
  const t = range === 0 ? 0.5 : (val - row.min) / range;
  const bg = interpolateColor(t, isDark);
  // High contrast text: dark text on light bg, light text on dark bg
  const textColor = t > 0.5 ? "text-white" : isDark ? "text-gray-200" : "text-gray-700";

  const formatted =
    row.unit === "km"
      ? val.toFixed(1)
      : row.unit === "min" && val >= 60
        ? `${Math.floor(val / 60)}h${val % 60}m`
        : val.toLocaleString();

  return (
    <td className="p-1.5">
      <div
        className={`rounded-md h-10 flex flex-col items-center justify-center ${textColor}`}
        style={{ backgroundColor: bg }}
        title={`${row.label}: ${formatted} ${row.unit}`}
      >
        <span className="text-xs font-semibold leading-tight">{formatted}</span>
      </div>
    </td>
  );
}

export function DayOfWeekHeatmap({ data }: { data: DayOfWeekHeatmapData }) {
  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Day-of-Week Patterns
        </h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Based on {data.totalDays} days of data
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 pr-3 w-28">
                Metric
              </th>
              {data.dayNames.map((name, i) => (
                <th
                  key={name}
                  className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 pb-2 px-1"
                >
                  <div>{name}</div>
                  <div className="text-[10px] text-gray-300 dark:text-gray-600 font-normal">
                    {data.dayCounts[i]}d
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.metric}>
                <td className="text-xs text-gray-600 dark:text-gray-300 pr-3 py-0.5 whitespace-nowrap">
                  {row.label}
                  <span className="text-gray-400 dark:text-gray-500 ml-1 text-[10px]">
                    {row.unit}
                  </span>
                </td>
                {data.dayNames.map((_, i) => (
                  <CellValue key={i} row={row} dayIndex={i} isDark={isDark} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center justify-end gap-2 mt-3">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">Low</span>
        <div className="flex h-2 rounded-full overflow-hidden w-24">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1"
              style={{ backgroundColor: interpolateColor(i / 9, isDark) }}
            />
          ))}
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">High</span>
      </div>
    </div>
  );
}
