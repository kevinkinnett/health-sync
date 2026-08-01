import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Intervention, MetricEffect } from "@health-dashboard/shared";
import {
  InterventionGantt,
  layoutSpans,
} from "../components/interventions/InterventionGantt";
import {
  EffectSizePlot,
  effectDomain,
} from "../components/interventions/EffectSizePlot";

const TODAY = "2026-08-01";

function period(over: Partial<Intervention> = {}): Intervention {
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

function effect(over: Partial<MetricEffect> = {}): MetricEffect {
  return {
    metric: "sleepEfficiency",
    label: "Sleep efficiency",
    unit: "%",
    betterDirection: "up",
    before: { n: 30, mean: 79.8, sd: 6.1 },
    after: { n: 30, mean: 91, sd: 3.2 },
    delta: 11.2,
    deltaPct: 14,
    direction: "up",
    effectSize: 1.9,
    improved: true,
    meaningful: true,
    ...over,
  };
}

describe("layoutSpans", () => {
  it("places the earliest start at the left edge", () => {
    const { spans } = layoutSpans(
      [period({ id: 1, startedOn: "2026-05-01", endedOn: "2026-06-01" })],
      TODAY,
    );
    expect(spans[0].leftPct).toBe(0);
  });

  it("runs an ongoing period all the way to today", () => {
    // Without this an open-ended regimen would stop at whatever date it was
    // last touched, which reads as "this ended" when it did not.
    const { spans, end } = layoutSpans(
      [period({ startedOn: "2026-05-02", endedOn: null })],
      TODAY,
    );
    expect(end).toBe(TODAY);
    expect(spans[0].ongoing).toBe(true);
    expect(spans[0].leftPct + spans[0].widthPct).toBeCloseTo(100, 5);
  });

  it("positions two changes proportionally on the shared domain", () => {
    // 2026-01-01 .. 2026-01-11 is the domain; a change on the 6th sits at
    // the midpoint. This is the arithmetic that can be wrong without
    // looking wrong — a mispositioned bar is still a bar.
    const { spans } = layoutSpans(
      [
        period({ id: 1, startedOn: "2026-01-01", endedOn: "2026-01-11" }),
        period({ id: 2, startedOn: "2026-01-06", endedOn: "2026-01-11" }),
      ],
      "2026-01-11",
    );
    expect(spans[0].leftPct).toBe(0);
    expect(spans[1].leftPct).toBeCloseTo(50, 5);
  });

  it("orders rows by start date regardless of input order", () => {
    const { spans } = layoutSpans(
      [
        period({ id: 2, startedOn: "2026-06-01" }),
        period({ id: 1, startedOn: "2026-05-01" }),
      ],
      TODAY,
    );
    expect(spans.map((s) => s.intervention.id)).toEqual([1, 2]);
  });

  it("gives a single-day event a visible width", () => {
    // A zero-width bar is unclickable and invisible — the event would
    // silently vanish from the overlap view.
    const { spans } = layoutSpans(
      [
        period({ id: 1, kind: "event", startedOn: "2026-06-01", endedOn: null }),
        period({ id: 2, startedOn: "2026-01-01", endedOn: "2026-12-01" }),
      ],
      TODAY,
    );
    const ev = spans.find((s) => s.intervention.id === 1)!;
    expect(ev.widthPct).toBeGreaterThan(0);
  });

  it("survives a single same-day change without dividing by zero", () => {
    const { spans } = layoutSpans(
      [period({ startedOn: TODAY, endedOn: TODAY })],
      TODAY,
    );
    expect(Number.isFinite(spans[0].leftPct)).toBe(true);
    expect(Number.isFinite(spans[0].widthPct)).toBe(true);
  });

  it("returns nothing for an empty list", () => {
    expect(layoutSpans([], TODAY).spans).toEqual([]);
  });
});

describe("InterventionGantt", () => {
  it("renders a row per change, named and dated for a screen reader", () => {
    // A bar's position communicates nothing without sight, so the dates
    // have to be in the accessible name.
    render(
      <InterventionGantt
        interventions={[period({ name: "Eight Sleep Pod" })]}
        today={TODAY}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Eight Sleep Pod, 2026-05-02 to now/ }),
    ).toBeInTheDocument();
  });

  it("marks the selected row as pressed", () => {
    render(
      <InterventionGantt
        interventions={[period({ id: 7 })]}
        today={TODAY}
        selectedId={7}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("selects on click, so the overlap view drives the report too", () => {
    const onSelect = vi.fn();
    render(
      <InterventionGantt
        interventions={[period({ id: 7 })]}
        today={TODAY}
        selectedId={null}
        onSelect={onSelect}
      />,
    );
    screen.getByRole("button").click();
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("renders nothing rather than an empty frame when there is nothing to plot", () => {
    const { container } = render(
      <InterventionGantt
        interventions={[]}
        today={TODAY}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("effectDomain", () => {
  it("never shrinks below ±1, so one small effect doesn't fill the axis", () => {
    expect(effectDomain([effect({ effectSize: 0.2 })])).toBe(1);
  });

  it("grows to contain the largest effect", () => {
    expect(effectDomain([effect({ effectSize: 1.9 })])).toBeGreaterThanOrEqual(1.9);
  });

  it("is finite with no plottable effects", () => {
    expect(Number.isFinite(effectDomain([]))).toBe(true);
  });
});

describe("EffectSizePlot", () => {
  it("states each effect in words, never colour alone", () => {
    render(<EffectSizePlot metrics={[effect()]} />);
    expect(screen.getByText("Sleep efficiency")).toBeInTheDocument();
    // Scoped to the row: the axis legend also reads "+1 better".
    expect(screen.getByTestId("effect-verdict-sleepEfficiency")).toHaveTextContent(
      "+1.9 better",
    );
  });

  it("labels a metric that moved but not meaningfully as neither", () => {
    render(
      <EffectSizePlot metrics={[effect({ meaningful: false, effectSize: 0.1 })]} />,
    );
    const verdict = screen.getByTestId("effect-verdict-sleepEfficiency");
    expect(verdict).not.toHaveTextContent("better");
    expect(verdict).not.toHaveTextContent("worse");
  });

  it("reads a falling metric as better when down is the good direction", () => {
    // Resting HR going down and sleep going up are both improvements. If
    // the axis meant raw sign, those two rows would point opposite ways
    // while saying the same thing.
    render(
      <EffectSizePlot
        metrics={[
          effect({
            metric: "restingHr",
            label: "Resting HR",
            betterDirection: "down",
            direction: "down",
            delta: -1.8,
            effectSize: -0.9,
            improved: true,
          }),
        ]}
      />,
    );
    expect(screen.getByTestId("effect-verdict-restingHr")).toHaveTextContent("better");
  });

  it("omits metrics with no computable effect size", () => {
    render(
      <EffectSizePlot
        metrics={[effect({ effectSize: null }), effect({ metric: "steps", label: "Steps" })]}
      />,
    );
    expect(screen.getByText("Steps")).toBeInTheDocument();
    expect(screen.queryByText("Sleep efficiency")).not.toBeInTheDocument();
  });

  it("renders nothing when nothing can be plotted", () => {
    const { container } = render(
      <EffectSizePlot metrics={[effect({ effectSize: null })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
