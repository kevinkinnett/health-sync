import type { SupplementAdherence } from "@health-dashboard/shared";

/**
 * Per-day grid of intake counts for a single item over the analytics
 * window. Cells are coloured by `doses` count (none = empty, ≥1 = ramp
 * from primary-container to primary). Hover tooltip shows the date and
 * dose count via the native `title` attribute — keeps it dependency
 * free and accessible.
 *
 * Wraps to as many rows as needed; on narrow viewports cells shrink to
 * stay legible.
 */
export function AdherenceCalendar({
  daily,
}: {
  daily: SupplementAdherence["daily"];
}) {
  if (daily.length === 0) return null;
  const maxDoses = daily.reduce((acc, d) => Math.max(acc, d.doses), 0) || 1;

  return (
    <div className="bg-surface-container rounded-xl p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-headline font-semibold text-on-surface">
          Daily Intake Calendar
        </h3>
        <div className="flex items-center gap-2 text-[10px] text-outline uppercase tracking-widest font-bold">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-surface-container-highest" />
            <div className="w-3 h-3 rounded-sm bg-primary/30" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <span>More</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {daily.map((d) => {
          const intensity = d.doses === 0 ? 0 : d.doses / maxDoses;
          const bg =
            intensity === 0
              ? "bg-surface-container-highest"
              : intensity < 0.34
                ? "bg-primary/30"
                : intensity < 0.67
                  ? "bg-primary/60"
                  : "bg-primary";
          return (
            <div
              key={d.date}
              className={`w-4 h-4 rounded-sm ${bg}`}
              title={`${d.date}: ${d.doses} ${d.doses === 1 ? "dose" : "doses"}`}
            />
          );
        })}
      </div>
    </div>
  );
}
