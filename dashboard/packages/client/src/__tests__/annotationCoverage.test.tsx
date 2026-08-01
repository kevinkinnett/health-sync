import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import type { ChartAnnotation } from "../components/charts/annotations";
import { annotationMarkers } from "../components/charts/annotationMarkers";

const PAGES_DIR = join(__dirname, "..", "pages", "analytics");
const CHARTS_DIR = join(__dirname, "..", "components", "charts");

/**
 * Every daily time-series screen must draw dated-change markers.
 *
 * The audit asked for this and it was reported as done while only three of
 * eight screens had it — the kind of gap no runtime test catches, because
 * a chart without markers renders perfectly happily. So this asserts on
 * the wiring itself.
 *
 * Screens are listed explicitly rather than globbed. A new screen should
 * force a deliberate decision here (does "what changed" apply to it?)
 * instead of silently joining an exempt set.
 */
const SERIES_SCREENS = [
  "Activity.tsx",
  "Sleep.tsx",
  "Weight.tsx",
  "HeartRate.tsx",
  "Hrv.tsx",
  "Vitals.tsx",
  "Nutrition.tsx",
  "EightSleep.tsx",
  "Exercises.tsx",
];

/**
 * Screens with no single date axis to anchor a vertical line to. Listed so
 * the exemption is a stated decision, not an omission.
 */
const EXEMPT = {
  "Correlations.tsx": "scatter of metric pairs, no date axis",
  "Records.tsx": "all-time bests, not a series",
  "Overview.tsx": "composed of other screens' cards",
  "Medications.tsx": "adherence calendar, own date rendering",
  "Supplements.tsx": "adherence calendar, own date rendering",
};

describe("intervention annotation coverage", () => {
  it("wires annotations into every daily time-series screen", () => {
    const missing = SERIES_SCREENS.filter((f) => {
      const src = readFileSync(join(PAGES_DIR, f), "utf8");
      return !src.includes("useChartAnnotations");
    });
    expect(missing, `screens with no dated-change markers: ${missing.join(", ")}`).toEqual([]);
  });

  it("passes the annotations through to a chart, not just fetching them", () => {
    // Calling the hook and dropping the result would pass the check above
    // while drawing nothing.
    const notPassed = SERIES_SCREENS.filter((f) => {
      const src = readFileSync(join(PAGES_DIR, f), "utf8");
      return !/annotations=\{(marks|annotations)\}/.test(src);
    });
    expect(notPassed, `fetched but never rendered: ${notPassed.join(", ")}`).toEqual([]);
  });

  it("accounts for every analytics screen as either covered or exempt", () => {
    const all = readdirSync(PAGES_DIR).filter((f) => f.endsWith(".tsx"));
    const accounted = new Set([...SERIES_SCREENS, ...Object.keys(EXEMPT)]);
    const unaccounted = all.filter((f) => !accounted.has(f));
    expect(
      unaccounted,
      `new screen(s) must be listed as series or exempt: ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the marker rendering in one place", () => {
    // The label has to be a render function — a vertical reference line's
    // viewBox has zero width, so the object and <Label> forms typecheck
    // and draw nothing. A chart that loops over annotations building its
    // own ReferenceLine will rediscover that the hard way.
    //
    // Scoped to that loop specifically: a chart may still hand-roll a
    // ReferenceLine for something that ISN'T an intervention (HrvChart
    // marks the 2026-06-12 source change), and that is not duplication.
    const handRolled = readdirSync(CHARTS_DIR)
      .filter((f) => f.endsWith(".tsx") && f !== "annotationMarkers.tsx")
      .filter((f) => {
        const src = readFileSync(join(CHARTS_DIR, f), "utf8");
        return /annotations\.map\(/.test(src) && src.includes("<ReferenceLine");
      });
    expect(
      handRolled,
      `should use annotationMarkers(): ${handRolled.join(", ")}`,
    ).toEqual([]);
  });
});

describe("annotationMarkers", () => {
  const one: ChartAnnotation[] = [
    { date: "2026-05-02", label: "Eight Sleep Pod", color: "#908fa0" },
  ];

  it("returns one element per annotation, keyed", () => {
    const out = annotationMarkers(one);
    expect(out).toHaveLength(1);
    expect(out[0].key).toContain("2026-05-02");
  });

  it("returns nothing for no annotations", () => {
    expect(annotationMarkers([])).toEqual([]);
  });

  /** React types `ReactElement["props"]` as unknown; narrow it here. */
  type LabelRenderer = (a: { viewBox: { x: number; y: number } }) => ReactElement;
  const labelOf = (el: ReactElement): LabelRenderer | undefined =>
    (el.props as { label?: LabelRenderer }).label;

  it("renders the label text through the render-function form", () => {
    // Calling the label prop directly is the only way to check this in
    // jsdom, where Recharts draws no chart geometry at all.
    const label = labelOf(annotationMarkers(one)[0]);
    expect(typeof label).toBe("function");
    render(<svg>{label!({ viewBox: { x: 10, y: 20 } })}</svg>);
    expect(screen.getByText("Eight Sleep Pod")).toBeInTheDocument();
  });

  it("omits the label when asked, for charts that caption them elsewhere", () => {
    expect(labelOf(annotationMarkers(one, { labels: false })[0])).toBeUndefined();
  });
});
