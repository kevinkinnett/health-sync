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

const ZONE_COLORS = {
  outOfRange: "#94a3b8",
  fatBurn: "#22c55e",
  cardio: "#f59e0b",
  peak: "#ef4444",
};

interface Props {
  data: HeartRateDay[];
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

  const avgPerDay = data.length > 0
    ? Math.round(activeTotal / data.length)
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
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
                  formatter={(value: number) => [`${value} min`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center mt-1">
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {avgPerDay} min/day
            </div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500">
              Avg active zone minutes
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
              className="rounded-lg border border-gray-100 dark:border-gray-700 p-3 text-center"
            >
              <div
                className="w-2 h-2 rounded-full mx-auto mb-1"
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {zone.label}
              </span>
              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {zone.total} min
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">
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
