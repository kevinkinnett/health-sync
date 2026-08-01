import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { HeartRateDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";
import { formatWithUnit } from "./tooltipFormat";
import { HR_ZONE_COLOR } from "./chartPalette";

const ZONE_COLORS = HR_ZONE_COLOR;

interface Props {
  data: HeartRateDay[];
}

interface ZoneTotals {
  fatBurn: number;
  cardio: number;
  peak: number;
}

/**
 * Fitbit's Active Zone Minutes: a minute in the fat-burn zone earns 1, a
 * minute in cardio or peak earns 2. (Confirmed against the raw per-minute
 * points, which carry the credit alongside the zone.)
 *
 * This card used to add the raw minute counts together and label the result
 * "active zone minutes", which is a different, smaller number — it undercounts
 * exactly the hard sessions AZM exists to reward, and it never matched what
 * the watch reported.
 */
export function activeZoneMinutes(z: ZoneTotals): number {
  return z.fatBurn + 2 * z.cardio + 2 * z.peak;
}

export function HrZoneChart({ data }: Props) {
  const ct = useChartTheme();

  const chartData = data.map((d) => ({
    date: d.date,
    outOfRange: d.zoneOutOfRangeMin ?? 0,
    fatBurn: d.zoneFatBurnMin ?? 0,
    cardio: d.zoneCardioMin ?? 0,
    peak: d.zonePeakMin ?? 0,
  }));

  // Aggregate for donut
  const totals = chartData.reduce(
    (acc, d) => ({
      outOfRange: acc.outOfRange + d.outOfRange,
      fatBurn: acc.fatBurn + d.fatBurn,
      cardio: acc.cardio + d.cardio,
      peak: acc.peak + d.peak,
    }),
    { outOfRange: 0, fatBurn: 0, cardio: 0, peak: 0 },
  );

  const activeTotal = totals.fatBurn + totals.cardio + totals.peak;
  const donutData = [
    { name: "Fat Burn", value: totals.fatBurn, color: ZONE_COLORS.fatBurn },
    { name: "Cardio", value: totals.cardio, color: ZONE_COLORS.cardio },
    { name: "Peak", value: totals.peak, color: ZONE_COLORS.peak },
  ].filter((d) => d.value > 0);

  const avgMinPerDay = data.length > 0
    ? Math.round(activeTotal / data.length)
    : 0;
  const avgAzmPerDay = data.length > 0
    ? Math.round(activeZoneMinutes(totals) / data.length)
    : 0;

  // Days can carry a resting HR but no zone minutes at all — that is what the
  // whole screen looked like for the seven weeks the rollup was missing. An
  // empty donut and three zeroes read as "you did nothing", so say which it is.
  if (activeTotal === 0) {
    return (
      <div className="bg-surface-container rounded-xl p-5">
        <h3 className="text-sm font-headline font-semibold text-on-surface mb-2">
          Heart Rate Zones
        </h3>
        <p className="text-sm text-on-surface-variant" data-testid="hr-zone-empty">
          No zone minutes recorded in this window. Zone time comes from the
          watch&apos;s active-zone-minutes stream — if you were wearing it and
          training, this is a data gap rather than a rest week.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-4">
        Heart Rate Zones
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Donut */}
        <div className="flex flex-col items-center">
          <div className="h-36 w-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={ct.tooltip.contentStyle}
                  labelStyle={ct.tooltip.labelStyle}
                  itemStyle={ct.tooltip.itemStyle}
                  formatter={formatWithUnit("min")}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center mt-1">
            <div className="text-lg font-bold text-on-surface" data-testid="hr-azm-per-day">
              {avgAzmPerDay} AZM/day
            </div>
            <div className="text-[10px] text-outline">
              Active Zone Minutes — cardio &amp; peak count double
            </div>
            <div className="text-xs text-on-surface-variant mt-1 tabular-nums">
              {avgMinPerDay} min/day in zone
            </div>
          </div>
        </div>

        {/* Zone breakdown cards */}
        <div className="lg:col-span-2 grid grid-cols-3 gap-2">
          {[
            { label: "Fat Burn", total: totals.fatBurn, color: ZONE_COLORS.fatBurn },
            { label: "Cardio", total: totals.cardio, color: ZONE_COLORS.cardio },
            { label: "Peak", total: totals.peak, color: ZONE_COLORS.peak },
          ].map((zone) => (
            <div
              key={zone.label}
              className="rounded-lg bg-surface-container-high p-3 text-center"
            >
              <div
                className="w-2 h-2 rounded-full mx-auto mb-1"
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-xs text-on-surface-variant">
                {zone.label}
              </span>
              <div className="text-lg font-bold text-on-surface">
                {zone.total} min
              </div>
              <div className="text-[10px] text-outline">
                {data.length > 0 ? Math.round(zone.total / data.length) : 0} min/day
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stacked bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} vertical={false} />
          <XAxis dataKey="date" tick={ct.tick} />
          <YAxis tick={ct.tick} label={{ value: "min", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: ct.tick.fill } }} />
          <Tooltip contentStyle={ct.tooltip.contentStyle} labelStyle={ct.tooltip.labelStyle} itemStyle={ct.tooltip.itemStyle} />
          <Legend />
          <Bar dataKey="fatBurn" stackId="zones" fill={ZONE_COLORS.fatBurn} name="Fat Burn" />
          <Bar dataKey="cardio" stackId="zones" fill={ZONE_COLORS.cardio} name="Cardio" />
          <Bar dataKey="peak" stackId="zones" fill={ZONE_COLORS.peak} name="Peak" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
