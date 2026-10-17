import type { DayOfWeekHeatmapData, DayOfWeekHeatmapMetric } from "@health-dashboard/shared";
import { useUnits } from "../stores/unitsStore";
import {
  convertDistance,
  distanceUnitLabel,
  type UnitSystem,
} from "../lib/units";
import { MAGNITUDE_RAMP_3 } from "./charts/chartPalette";
import { heatmapBucket, inkFor } from "../lib/heatmapScale";

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
  const bucket = heatmapBucket(t);
  const bg = MAGNITUDE_RAMP_3[bucket];
  const isBold = bucket === MAGNITUDE_RAMP_3.length - 1;

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
      style={{ backgroundColor: bg, color: inkFor(bg) }}
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
          <div
            className="flex items-center gap-1 text-[10px] text-outline"
            aria-label="Shading runs from lower to higher, relative to each metric's own weekday range"
            role="img"
          >
            <span aria-hidden="true">Lower</span>
            {MAGNITUDE_RAMP_3.map((fill) => (
              <div key={fill} className="w-3 h-3 rounded-sm" style={{ backgroundColor: fill }} />
            ))}
            <span aria-hidden="true">Higher</span>
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
