import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import type { SparklineData } from "@health-dashboard/shared";

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
  color = "#c0c1ff",
  icon,
  badge,
}: StatCardProps) {
  return (
    <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/5">
      <div className="flex justify-between items-start mb-4">
        {icon && (
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${color}15` }}
          >
            <span className="material-symbols-outlined" style={{ color }}>
              {icon}
            </span>
          </div>
        )}
        {badge && (
          <span
            className="text-xs font-bold flex items-center px-2 py-0.5 rounded"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-[10px] text-outline uppercase tracking-widest font-bold mb-1">
        {title}
      </p>
      <div className="flex items-baseline gap-1 mb-4">
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
        <div className="h-8 w-full opacity-60">
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
