import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import type { SparklineData } from "@health-dashboard/shared";
import { DEFAULT_SERIES } from "./charts/chartPalette";

interface StatCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  sparkline: SparklineData[];
  color?: string;
  icon?: string;
  badge?: string;
}

export function StatCard({
  title,
  value,
  unit,
  sparkline,
  color = DEFAULT_SERIES,
  icon,
  badge,
}: StatCardProps) {
  return (
    /*
     * The icon sits on the title row rather than on a line of its own.
     * Stacked, this card spent ~190px on a number and a 32px sparkline and
     * read as half-empty — most of its height was two mb-4 gaps and a
     * 40px icon block with nothing beside it.
     */
    <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && (
            <span
              className="material-symbols-outlined text-base shrink-0"
              style={{ color }}
            >
              {icon}
            </span>
          )}
          <p className="text-[10px] text-outline uppercase tracking-widest font-bold truncate">
            {title}
          </p>
        </div>
        {badge && (
          <span
            className="text-xs font-bold flex items-center px-2 py-0.5 rounded shrink-0"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-2xl font-headline font-bold tabular-nums text-on-surface">
          {value ?? "---"}
        </span>
        {unit && (
          <span className="text-on-surface-variant text-sm font-medium">
            {unit}
          </span>
        )}
      </div>
      {sparkline.length > 0 && (
        /* Was opacity-60, which on a 32px line read as "nothing here". */
        <div className="h-10 w-full opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
