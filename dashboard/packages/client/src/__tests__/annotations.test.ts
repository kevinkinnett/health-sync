import { describe, it, expect } from "vitest";
import type { Intervention } from "@health-dashboard/shared";
import { annotationsFor } from "../components/charts/annotations";

/**
 * The filtering rule is load-bearing, not cosmetic. Recharts anchors a
 * `ReferenceLine` to a CATEGORY value on the x-axis, so a date the axis
 * does not contain renders nothing at best and at the wrong position at
 * worst — a marker silently pointing at the wrong day is worse than no
 * marker at all.
 */

function intervention(over: Partial<Intervention> = {}): Intervention {
  return {
    id: 1,
    kind: "period",
    category: "device",
    name: "Eight Sleep Pod",
    startedOn: "2026-05-02",
    endedOn: null,
    source: "manual",
    sourceRef: null,
    detail: null,
    createdAt: "2026-05-02T00:00:00.000Z",
    updatedAt: "2026-05-02T00:00:00.000Z",
    ...over,
  };
}

const DATES = ["2026-05-01", "2026-05-02", "2026-05-03"];

describe("annotationsFor", () => {
  it("marks an intervention whose start is on the axis", () => {
    const out = annotationsFor([intervention()], DATES);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-05-02");
    expect(out[0].label).toBe("Eight Sleep Pod");
  });

  it("drops one that falls outside the plotted range", () => {
    expect(annotationsFor([intervention({ startedOn: "2026-01-01" })], DATES)).toEqual([]);
    expect(annotationsFor([intervention({ startedOn: "2026-12-31" })], DATES)).toEqual([]);
  });

  it("drops a date inside the range but missing from the axis", () => {
    // A gap day — the series has no point there, so there is nothing to
    // anchor to even though the date is between the endpoints.
    const gapped = ["2026-05-01", "2026-05-03"];
    expect(annotationsFor([intervention()], gapped)).toEqual([]);
  });

  it("returns nothing when the chart has no data", () => {
    expect(annotationsFor([intervention()], [])).toEqual([]);
  });

  it("returns nothing when there are no interventions", () => {
    expect(annotationsFor([], DATES)).toEqual([]);
  });

  it("marks several changes on the same axis", () => {
    const out = annotationsFor(
      [
        intervention(),
        intervention({ id: 2, name: "Escitalopram 10 mg", startedOn: "2026-05-03" }),
      ],
      DATES,
    );
    expect(out.map((a) => a.label)).toEqual(["Eight Sleep Pod", "Escitalopram 10 mg"]);
  });

  it("gives markers a chrome colour, never a series colour", () => {
    // An annotation must not be mistakable for a plotted series.
    const [mark] = annotationsFor([intervention()], DATES);
    expect(["#3987e5", "#d95926", "#199e70"]).not.toContain(mark.color);
  });
});
