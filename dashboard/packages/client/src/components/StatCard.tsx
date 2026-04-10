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
}

export function StatCard({ title, value, unit, sparkline, color = "#6366f1" }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <div className="flex items-end justify-between mt-1">
        <div>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {value ?? "---"}
          </span>
          {unit && <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">{unit}</span>}
        </div>
        {sparkline.length > 0 && (
          <div className="w-24 h-10">
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
    </div>
  );
}
