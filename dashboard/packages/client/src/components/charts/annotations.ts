import type { Intervention } from "@health-dashboard/shared";
import { useInterventions } from "../../api/queries";
import { CHART_CHROME } from "./chartPalette";

/**
 * Vertical markers drawn on a time series to show what changed, and when.
 *
 * Once interventions exist as data, this is the cheapest way to make every
 * existing chart more informative: a sleep series with "Eight Sleep, 2 May"
 * drawn on it answers a question the same series without the marker cannot
 * even pose.
 *
 * Deliberately a plain data shape rather than a chart component. The charts
 * stay presentational — they render whatever annotations they are handed
 * and need no query client to be tested — while the hook below owns the
 * fetching. That separation is why `MetricLineChart` still renders in a
 * bare `render()` with no provider.
 */
export interface ChartAnnotation {
  /** The x-axis value to draw at — a `YYYY-MM-DD` date key. */
  date: string;
  label: string;
  color: string;
}

/**
 * Annotations for the given x-axis domain.
 *
 * Only interventions whose start falls INSIDE the plotted dates are
 * returned: Recharts anchors a `ReferenceLine` to a category value, so a
 * date the axis doesn't contain would silently draw nothing (or worse,
 * at the wrong edge). Filtering here makes that explicit.
 */
export function annotationsFor(
  interventions: Intervention[],
  plottedDates: string[],
): ChartAnnotation[] {
  if (plottedDates.length === 0) return [];
  const present = new Set(plottedDates);

  return interventions
    .filter((i) => present.has(i.startedOn))
    .map((i) => ({
      date: i.startedOn,
      label: i.name,
      color: CHART_CHROME.axis,
    }));
}

/**
 * Convenience for screens: fetch interventions and narrow them to the
 * dates a chart is actually plotting.
 *
 * Returns an empty list while loading or on error — an annotation is
 * decoration on someone else's chart, so it must never be the thing that
 * makes the chart fail to render.
 */
export function useChartAnnotations(plottedDates: string[]): ChartAnnotation[] {
  const { data } = useInterventions();
  return annotationsFor(data ?? [], plottedDates);
}
