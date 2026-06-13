import { useEffect, useRef } from "react";
import * as Plot from "@observablehq/plot";

/**
 * Thin React wrapper around Observable Plot. Plot is imperative (it returns
 * a detached DOM node) and NOT responsive on its own — it falls back to a
 * fixed 640px. We measure the container and (re-)plot at its width so the
 * figure fills the card, re-plotting on resize. A caller-supplied
 * `options.width` still wins.
 *
 * `options` MUST be memoized by the caller (useMemo); it's the effect dep.
 *
 * Used for the statistical charts recharts is awkward at: box-plot
 * distributions and the lag-correlation curve.
 */
export function PlotFigure({
  options,
  className,
}: {
  options: Plot.PlotOptions;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let chart: (Element & { remove: () => void }) | null = null;
    let lastWidth = -1;

    const render = () => {
      const width = Math.floor(el.clientWidth);
      // Skip zero (pre-layout) and no-op re-fires (guards a resize loop:
      // re-plotting at the same width must not retrigger the observer).
      if (width <= 0 || width === lastWidth) return;
      lastWidth = width;
      chart?.remove();
      chart = Plot.plot({ width, ...options }) as Element & { remove: () => void };
      el.append(chart);
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart?.remove();
    };
  }, [options]);

  return <div ref={ref} className={className} />;
}
