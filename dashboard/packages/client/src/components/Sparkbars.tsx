import type { SparklineData } from "@health-dashboard/shared";

/**
 * A tile-sized trend, drawn as bars.
 *
 * Replaces a 1.5px Recharts line that read as an empty strip at this size
 * — the tiles looked half-finished and the trend went unread. Bars survive
 * being 40px tall; a hairline does not.
 *
 * Plain SVG rather than a charting library, for the same reason the Gantt
 * and the effect plot are: Recharts renders NOTHING under jsdom, so a
 * sparkline built with it cannot be asserted on at all. Here the geometry
 * is a handful of rects this component computes itself, which is both
 * testable and considerably less machinery than a ResponsiveContainer for
 * a strip this size.
 */

/** viewBox units. Rendered via CSS so the actual pixel size is the caller's. */
const H = 100;
const GAP = 0.18; // fraction of each slot left as breathing room

export function Sparkbars({
  data,
  color,
  className,
}: {
  data: SparklineData[];
  color: string;
  className?: string;
}) {
  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  if (values.length === 0) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  // Anchor the scale at zero for counts, but at the data floor for series
  // that never approach it (resting HR, body mass) — otherwise every bar
  // is the same height and the trend is invisible.
  const base = min > 0 && min / max > 0.5 ? min - (max - min) * 0.6 : 0;
  const span = max - base || 1;

  const slot = 100 / values.length;
  const width = slot * (1 - GAP);

  return (
    <svg
      viewBox={`0 0 100 ${H}`}
      preserveAspectRatio="none"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      {values.map((v, i) => {
        const h = Math.max(((v - base) / span) * H, 2);
        return (
          <rect
            key={i}
            x={i * slot}
            y={H - h}
            width={width}
            height={h}
            fill={color}
            /* The most recent day is the one being read; the rest are
               context. */
            opacity={i === values.length - 1 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}
