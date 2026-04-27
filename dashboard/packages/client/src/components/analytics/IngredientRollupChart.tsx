import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import type { IngredientByDay } from "@health-dashboard/shared";
import { useChartTheme } from "../../stores/themeStore";

const STACK_COLORS = [
  "#c0c1ff",
  "#4edea3",
  "#ffb2b7",
  "#ffd166",
  "#a78bfa",
  "#34d399",
  "#f472b6",
  "#60a5fa",
];

/**
 * Stacked area chart of per-ingredient daily totals. The server returns
 * one row per `(date, ingredient)` so we pivot client-side into a wide
 * `{ date, [ingredientName]: totalAmount }` shape that recharts can
 * stack directly.
 *
 * Defaults to the top six ingredients by total amount in the window —
 * more than that and the legend starts to compete with the chart.
 */
export function IngredientRollupChart({
  rows,
  topN = 6,
}: {
  rows: IngredientByDay[];
  topN?: number;
}) {
  const ct = useChartTheme();

  const { data, ingredients } = useMemo(() => {
    if (rows.length === 0) {
      return { data: [], ingredients: [] as string[] };
    }
    // Aggregate totals to pick top-N ingredients.
    const totalByName = new Map<string, number>();
    for (const r of rows) {
      totalByName.set(
        r.ingredientName,
        (totalByName.get(r.ingredientName) ?? 0) + r.totalAmount,
      );
    }
    const topNames = [...totalByName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([name]) => name);
    const topSet = new Set(topNames);

    // Pivot into one row per date.
    const byDate = new Map<string, Record<string, number | string>>();
    for (const r of rows) {
      if (!topSet.has(r.ingredientName)) continue;
      let row = byDate.get(r.date);
      if (!row) {
        row = { date: r.date };
        byDate.set(r.date, row);
      }
      row[r.ingredientName] =
        ((row[r.ingredientName] as number | undefined) ?? 0) + r.totalAmount;
    }
    const wide = [...byDate.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
    return { data: wide, ingredients: topNames };
  }, [rows, topN]);

  if (data.length === 0) {
    return (
      <div className="bg-surface-container rounded-xl p-5">
        <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
          Ingredient Intake Over Time
        </h3>
        <p className="text-xs text-on-surface-variant">
          No ingredient data in this window.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <h3 className="text-sm font-headline font-semibold text-on-surface mb-1">
        Ingredient Intake Over Time
      </h3>
      <p className="text-xs text-on-surface-variant mb-4">
        Top {ingredients.length} ingredients across all supplements
      </p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
            <CartesianGrid
              stroke={ct.grid}
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="date" tick={ct.tick} />
            <YAxis tick={ct.tick} width={50} />
            <Tooltip
              contentStyle={ct.tooltip.contentStyle}
              labelStyle={ct.tooltip.labelStyle}
              itemStyle={ct.tooltip.itemStyle}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {ingredients.map((name, i) => (
              <Area
                key={name}
                type="monotone"
                dataKey={name}
                stackId="1"
                stroke={STACK_COLORS[i % STACK_COLORS.length]}
                fill={STACK_COLORS[i % STACK_COLORS.length]}
                fillOpacity={0.55}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
