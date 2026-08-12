import type { SparklineData } from "@health-dashboard/shared";
import { DEFAULT_SERIES, STATUS, CHART_CHROME } from "./charts/chartPalette";
import { Sparkbars } from "./Sparkbars";
import { statBadge, type BadgeTone } from "./statBadge";

interface StatCardProps {
  title: string;
  value: string | number | null;
  unit?: string;
  sparkline: SparklineData[];
  color?: string;
  icon?: string;
  /**
   * Which way is an improvement for this metric. Supplying it turns on the
   * derived "above usual / below usual / steady" verdict; omitting it
   * leaves the tile as a bare number, which is right for anything the app
   * has no opinion about.
   */
  betterDirection?: "up" | "down";
  /** Escape hatch for a caller-supplied verdict. Wins over the derived one. */
  badge?: string;
}

const TONE_COLOR: Record<BadgeTone, string> = {
  good: STATUS.good,
  bad: STATUS.critical,
  neutral: CHART_CHROME.axis,
};

export function StatCard({
  title,
  value,
  unit,
  sparkline,
  color = DEFAULT_SERIES,
  icon,
  betterDirection,
  badge,
}: StatCardProps) {
  const derived = betterDirection ? statBadge(sparkline, betterDirection) : null;

  return (
    /*
     * The icon sits on the title row rather than on a line of its own.
     * Stacked, this card spent ~190px on a number and a 32px sparkline and
     * read as half-empty — most of its height was two mb-4 gaps and a
     * 40px icon block with nothing beside it.
     */
    <div
      className="rounded-xl bg-surface-container-low p-5"
      data-testid="stat-card"
    >
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

        {badge ? (
          <span
            className="text-xs font-bold flex items-center px-2 py-0.5 rounded shrink-0"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {badge}
          </span>
        ) : (
          derived && (
            /*
             * A bare number is unreadable without a sense of your own
             * range — 65 bpm means nothing on its own. The verdict is
             * always WORDS; the dot is a second channel, never the only
             * one.
             */
            <span
              className="text-[10px] flex items-center gap-1 shrink-0 text-on-surface-variant"
              data-testid="stat-badge"
              title={`${derived.z > 0 ? "+" : ""}${derived.z} SD vs recent days`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: TONE_COLOR[derived.tone] }}
              />
              {derived.label}
            </span>
          )
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
        <Sparkbars data={sparkline} color={color} className="h-10 w-full" />
      )}
    </div>
  );
}
