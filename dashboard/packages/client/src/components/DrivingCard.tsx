import { ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import type { DrivingSummary } from "@health-dashboard/shared";

/** Minutes → "1h 45m" / "45m". */
function fmtHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "May 29" from a YYYY-MM-DD. */
function shortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Header() {
  return (
    <h2 className="text-sm font-headline font-semibold text-on-surface uppercase tracking-widest flex items-center gap-2">
      <span
        className="material-symbols-outlined text-primary text-base"
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        directions_car
      </span>
      Time in Car
    </h2>
  );
}

/**
 * Compact dashboard stat for driving time (TeslaMate). Shows the last-7-
 * day total, the most recent day, and a short daily trend. "Time in car"
 * is drive time — TeslaMate can't see idle/parked time.
 */
export function DrivingCard({ data }: { data: DrivingSummary }) {
  if (!data || data.latestDate == null) {
    return (
      <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
        <Header />
        <p className="text-on-surface-variant text-sm mt-3">
          No driving data yet — syncing from TeslaMate.
        </p>
      </div>
    );
  }

  const max = Math.max(...data.trend.map((d) => d.minutes), 1);

  return (
    <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/10">
      <Header />
      <div className="mt-3 flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold font-headline tabular-nums text-on-surface">
            {fmtHm(data.weekMinutes)}
          </div>
          <p className="text-xs text-outline mt-1">
            last 7 days · {data.weekDrives} {data.weekDrives === 1 ? "drive" : "drives"}
          </p>
        </div>
        {data.trend.length > 1 && (
          <div className="h-12 w-32 shrink-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} barCategoryGap={1}>
                <Bar dataKey="minutes" radius={[2, 2, 0, 0]}>
                  {data.trend.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d.minutes >= max * 0.8 ? "#c0c1ff" : "#3a3b52"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {data.latestMinutes != null && (
        <p className="text-[11px] text-outline mt-3">
          Most recent · {shortDate(data.latestDate)}: {fmtHm(data.latestMinutes)} driving
        </p>
      )}
    </div>
  );
}
