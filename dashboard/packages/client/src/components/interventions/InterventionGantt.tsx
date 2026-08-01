import type { Intervention, InterventionCategory } from "@health-dashboard/shared";
import { SERIES, CHART_CHROME } from "../charts/chartPalette";

/**
 * The timeline as an actual timeline: every change as a bar on one shared
 * date axis.
 *
 * The list above it answers "what did I change". Only this answers "what
 * was I doing at the same time" — and that is the question the confounds
 * section keeps raising in prose. "Escitalopram 20 mg ended 2 days from
 * this change" is a sentence you have to hold in your head; two bars that
 * visibly abut are not.
 *
 * Deliberately HTML and not a charting library. A Gantt is awkward in
 * Recharts, and more to the point Recharts renders NOTHING under jsdom, so
 * a charted version could only be tested in a browser. Percentage-
 * positioned divs are testable, screen-readable, and reflow for free.
 */

/** Categories take fixed slots so a colour always means the same thing. */
const CATEGORY_COLOR: Record<InterventionCategory, string> = {
  device: SERIES[0],
  medication: SERIES[1],
  supplement: SERIES[2],
  training: SERIES[3],
  diet: SERIES[4],
  habit: SERIES[5],
  other: SERIES[6],
};

const DAY_MS = 86_400_000;

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export interface GanttSpan {
  intervention: Intervention;
  /** 0-100, left edge as a percentage of the plotted range. */
  leftPct: number;
  /** 0-100. Events get a hairline width so they stay visible. */
  widthPct: number;
  ongoing: boolean;
}

/**
 * Lays every intervention out on a shared domain.
 *
 * The domain runs from the earliest start to the latest end, with `today`
 * as the right edge whenever something is still running — otherwise an
 * ongoing regimen would stop at whatever date it was last logged, which
 * reads as "this ended" when it did not.
 *
 * Exported for testing: the arithmetic is the part that can be wrong in a
 * way nobody notices, since a mispositioned bar still looks like a chart.
 */
export function layoutSpans(
  interventions: Intervention[],
  today: string,
): { spans: GanttSpan[]; start: string; end: string } {
  if (interventions.length === 0) {
    return { spans: [], start: today, end: today };
  }

  const startMs = Math.min(...interventions.map((i) => toMs(i.startedOn)));
  const endMs = Math.max(
    ...interventions.map((i) =>
      i.kind === "period" && i.endedOn == null
        ? toMs(today)
        : toMs(i.endedOn ?? i.startedOn),
    ),
    toMs(today),
  );

  // A single-day domain would divide by zero; give it one day of width.
  const span = Math.max(endMs - startMs, DAY_MS);

  const spans = [...interventions]
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn))
    .map((intervention) => {
      const ongoing =
        intervention.kind === "period" && intervention.endedOn == null;
      const from = toMs(intervention.startedOn);
      const to = ongoing
        ? toMs(today)
        : toMs(intervention.endedOn ?? intervention.startedOn);

      return {
        intervention,
        leftPct: ((from - startMs) / span) * 100,
        // A one-day event has zero width; floor it so it stays clickable
        // and visible rather than collapsing to nothing.
        widthPct: Math.max(((to - from) / span) * 100, 1.2),
        ongoing,
      };
    });

  return {
    spans,
    start: new Date(startMs).toISOString().slice(0, 10),
    end: new Date(endMs).toISOString().slice(0, 10),
  };
}

export function InterventionGantt({
  interventions,
  today,
  selectedId,
  onSelect,
}: {
  interventions: Intervention[];
  today: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const { spans, start, end } = layoutSpans(interventions, today);
  if (spans.length === 0) return null;

  return (
    <div className="bg-surface-container rounded-xl p-5" data-testid="intervention-gantt">
      <h3 className="text-sm font-headline font-semibold text-on-surface">
        Overlap
      </h3>
      <p className="text-xs text-on-surface-variant mt-1 mb-4 max-w-prose">
        What was running at the same time. Where two bars overlap, a
        before/after across that stretch cannot separate them — which is
        exactly what the caveats on a report are about.
      </p>

      <div className="space-y-1.5">
        {spans.map((s) => (
          <GanttRow
            key={s.intervention.id}
            span={s}
            selected={s.intervention.id === selectedId}
            onSelect={() => onSelect(s.intervention.id)}
          />
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-outline tabular-nums mt-2 pt-2 border-t border-outline-variant/10">
        <span>{start}</span>
        <span>{end}</span>
      </div>
    </div>
  );
}

function GanttRow({
  span,
  selected,
  onSelect,
}: {
  span: GanttSpan;
  selected: boolean;
  onSelect: () => void;
}) {
  const { intervention: i, leftPct, widthPct, ongoing } = span;
  const color = CATEGORY_COLOR[i.category] ?? CHART_CHROME.inactive;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      /* The accessible name carries the dates, because a bar's position
         communicates nothing to a screen reader. */
      aria-label={`${i.name}, ${i.startedOn} to ${ongoing ? "now" : (i.endedOn ?? i.startedOn)}`}
      className="w-full text-left group"
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-on-surface-variant w-32 shrink-0 truncate">
          {i.name}
        </span>
        <span className="relative flex-1 h-4 rounded bg-surface-container-high overflow-hidden">
          <span
            className="absolute top-0 bottom-0 rounded transition-opacity"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: color,
              opacity: selected ? 1 : 0.55,
            }}
          />
        </span>
      </div>
    </button>
  );
}
