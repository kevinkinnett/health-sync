import type { DayOfWeekHeatmapData, DayOfWeekHeatmapMetric } from "@health-dashboard/shared";
import { useUnits } from "../stores/unitsStore";
import {
  convertDistance,
  distanceUnitLabel,
  type UnitSystem,
} from "../lib/units";

// Map metric type to accent color hue for the heatmap
function getColorForMetric(metric: string): { r0: number; g0: number; b0: number; r1: number; g1: number; b1: number } {
  // Activity metrics -> primary (indigo)
  if (metric.includes("step") || metric.includes("active") || metric.includes("calor") || metric.includes("dist"))
    return { r0: 23, g0: 31, b0: 51, r1: 192, g1: 193, b1: 255 }; // surface-container -> primary
  // Sleep metrics -> secondary (emerald)
  if (metric.includes("sleep") || metric.includes("deep") || metric.includes("rem") || metric.includes("eff"))
    return { r0: 23, g0: 31, b0: 51, r1: 78, g1: 222, b1: 163 }; // -> secondary
  // HR metrics -> tertiary (rose)
  if (metric.includes("heart") || metric.includes("hr") || metric.includes("resting"))
    return { r0: 23, g0: 31, b0: 51, r1: 255, g1: 178, b1: 183 }; // -> tertiary
  // Default -> primary
  return { r0: 23, g0: 31, b0: 51, r1: 192, g1: 193, b1: 255 };
}

function interpolateColor(t: number, metric: string): string {
  const c = getColorForMetric(metric);
  const r = Math.round(c.r0 + t * (c.r1 - c.r0));
  const g = Math.round(c.g0 + t * (c.g1 - c.g0));
  const b = Math.round(c.b0 + t * (c.b1 - c.b0));
  return `rgb(${r}, ${g}, ${b})`;
}

function CellValue({
  row,
  dayIndex,
  units,
}: {
  row: DayOfWeekHeatmapMetric;
  dayIndex: number;
  units: UnitSystem;
}) {
  const val = row.values[dayIndex];
  if (val == null) {
    return (
      <td
        className="px-4 py-4 text-center text-outline"
        title={`No ${row.label.toLowerCase()} readings for this weekday`}
      >
        --
      </td>
    );
  }

  // Color interpolation uses a normalized ratio, which is invariant
  // under unit conversion — so we don't need to convert min/max.
  const range = row.max - row.min;
  const t = range === 0 ? 0.5 : (val - row.min) / range;
  const bg = interpolateColor(t, row.metric);
  const isBold = t > 0.8;

  const displayUnit = row.unit === "km" ? distanceUnitLabel(units) : row.unit;
  const displayVal =
    row.unit === "km" ? (convertDistance(val, units) ?? val) : val;

  const formatted =
    row.unit === "km"
      ? displayVal.toFixed(1)
      : row.unit === "min" && val >= 60
        ? `${Math.floor(val / 60)}h${val % 60}m`
        : val.toLocaleString();
  const samples = row.samples?.[dayIndex];

  return (
    <td
      className={`px-4 py-4 text-center tabular-nums ${isBold ? "font-bold" : ""}`}
      style={{ backgroundColor: bg }}
      title={`${row.label} weekday average: ${formatted} ${displayUnit}${samples != null ? ` · n=${samples}` : ""}`}
    >
      {formatted}
    </td>
  );
}

export function DayOfWeekHeatmap({ data }: { data: DayOfWeekHeatmapData }) {
  const units = useUnits();
  return (
    <div className="bg-surface-container rounded-xl overflow-hidden">
      <div className="p-6 border-b border-outline-variant/10 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-headline font-semibold text-lg text-on-surface">
            Typical Weekday Patterns
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-outline">
            Long-term averages grouped by weekday across {data.totalDays} completed days—not readings
            from one calendar week. Today’s in-progress data is excluded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-primary/20 rounded-sm" />
            <div className="w-3 h-3 bg-primary/50 rounded-sm" />
            <div className="w-3 h-3 bg-primary/80 rounded-sm" />
            <div className="w-3 h-3 bg-primary rounded-sm" />
          </div>
          <span className="text-xs text-outline tabular-nums ml-2">
            {data.totalDays} completed days
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-surface-container-low">
              <th className="px-6 py-4 font-semibold text-outline">METRIC</th>
              {data.dayNames.map((name, i) => (
                <th
                  key={name}
                  title={`${data.dayCounts[i] ?? 0} completed ${name} samples`}
                  className="px-4 py-4 font-semibold text-outline text-center cursor-help"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.rows.map((row) => (
              <tr key={row.metric} className="border-b border-outline-variant/5">
                <td className="px-6 py-4 font-medium text-on-surface">
                  {row.label}
                  <span className="text-outline ml-1 text-xs">
                    {row.unit === "km" ? distanceUnitLabel(units) : row.unit}
                  </span>
                </td>
                {data.dayNames.map((_, i) => (
                  <CellValue
                    key={i}
                    row={row}
                    dayIndex={i}
                    units={units}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.measurementRegimes?.sleep && (
        <p className="px-6 py-3 text-[10px] text-outline border-t border-outline-variant/10">
          Sleep rows use the latest like-for-like method: {data.measurementRegimes.sleep}.
        </p>
      )}
    </div>
  );
}
