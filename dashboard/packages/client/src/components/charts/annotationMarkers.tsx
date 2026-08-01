import { ReferenceLine } from "recharts";
import type { ReactElement } from "react";
import type { ChartAnnotation } from "./annotations";

/**
 * The dated-change markers, as a reusable array of `ReferenceLine`s.
 *
 * A FUNCTION returning elements, not a component wrapping them. Recharts
 * discovers its children by inspecting their element types, so a
 * `<AnnotationMarkers />` wrapper would be silently ignored — the lines
 * would never draw and nothing would error. An array spread into the chart
 * is the only shape Recharts recognises.
 *
 * Exists because five charts needed the same markers and the rendering has
 * two non-obvious rules that must not be re-derived (and re-broken) at each
 * call site: the render-function label, and the chrome-only colour.
 */
export function annotationMarkers(
  annotations: ChartAnnotation[],
  opts: { labels?: boolean } = {},
): ReactElement[] {
  const { labels = true } = opts;

  return annotations.map((a) => (
    <ReferenceLine
      key={`${a.date}-${a.label}`}
      x={a.date}
      stroke={a.color}
      strokeDasharray="3 3"
      strokeWidth={1}
      /*
       * A render function, not `label="text"` and not a <Label> child.
       * Both of those typecheck and draw NOTHING: a vertical reference
       * line's viewBox has zero width, so every position keyword resolves
       * to nowhere. This cost a deploy to find once already.
       */
      label={
        labels
          ? ({ viewBox }: { viewBox: { x: number; y: number } }) => (
              <text x={viewBox.x + 4} y={viewBox.y + 11} fill={a.color} fontSize={10}>
                {a.label}
              </text>
            )
          : undefined
      }
    />
  ));
}
