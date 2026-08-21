import { describe, it, expect } from "vitest";
import type {
  ExperimentSummary,
  MetricEffect,
} from "@health-dashboard/shared";
import { pickHeadline, rankSummaries } from "../services/experiments/headline.js";

function effect(over: Partial<MetricEffect> = {}): MetricEffect {
  return {
    metric: "sleepEfficiency",
    label: "Sleep efficiency",
    unit: "%",
    betterDirection: "up",
    before: { n: 30, mean: 79.8, sd: 6.1 },
    after: { n: 30, mean: 91.0, sd: 3.2 },
    delta: 11.2,
    deltaPct: 14.0,
    direction: "up",
    effectSize: 1.9,
    improved: true,
    meaningful: true,
    ...over,
  };
}

function summary(over: Partial<ExperimentSummary> = {}): ExperimentSummary {
  return {
    interventionId: 1,
    interventionName: "Eight Sleep Pod",
    interventionCategory: "device",
    evidence: "observed_change",
    changepoint: "2026-05-02",
    confidence: "moderate",
    summary: "…",
    headline: effect(),
    ...over,
  };
}

describe("pickHeadline", () => {
  it("picks the largest effect SIZE, not the largest raw delta", () => {
    // Units are not comparable across metrics — 768 steps is a bigger
    // number than 11.2 percentage points and a far weaker signal.
    const head = pickHeadline([
      effect({ metric: "steps", label: "Steps", unit: "steps", delta: 768.3, effectSize: 0.31 }),
      effect({ metric: "sleepEfficiency", delta: 11.2, effectSize: 1.9 }),
    ]);
    expect(head?.metric).toBe("sleepEfficiency");
  });

  it("ranks on magnitude, so a large REGRESSION can be the headline", () => {
    // A card that only ever reports improvements is a advertisement, not
    // a result. The biggest move wins whichever way it went.
    const head = pickHeadline([
      effect({ metric: "restingHr", label: "Resting HR", improved: false, direction: "up", effectSize: -1.4 }),
      effect({ metric: "sleepEfficiency", effectSize: 0.6 }),
    ]);
    expect(head?.metric).toBe("restingHr");
    expect(head?.improved).toBe(false);
  });

  it("ignores effects that are not meaningful", () => {
    expect(pickHeadline([effect({ meaningful: false, effectSize: 3 })])).toBeNull();
  });

  it("ignores effects with no computable effect size", () => {
    expect(pickHeadline([effect({ effectSize: null })])).toBeNull();
  });

  it("returns null when there are no metrics at all", () => {
    expect(pickHeadline([])).toBeNull();
  });
});

describe("rankSummaries", () => {
  it("drops insufficient reports entirely", () => {
    // "Not enough data yet" is true of everything entered this week; a
    // card full of it teaches the reader to ignore the card.
    const out = rankSummaries([
      summary({ interventionId: 1, confidence: "insufficient" }),
      summary({ interventionId: 2, confidence: "weak" }),
    ]);
    expect(out.map((s) => s.interventionId)).toEqual([2]);
  });

  it("puts an answer with a headline above one without", () => {
    const out = rankSummaries([
      summary({ interventionId: 1, confidence: "strong", headline: null }),
      summary({ interventionId: 2, confidence: "weak", headline: effect() }),
    ]);
    // Even though 1 is better supported — "nothing moved" is a weaker draw.
    expect(out.map((s) => s.interventionId)).toEqual([2, 1]);
  });

  it("then prefers the better-supported answer", () => {
    const out = rankSummaries([
      summary({ interventionId: 1, confidence: "weak" }),
      summary({ interventionId: 2, confidence: "strong" }),
      summary({ interventionId: 3, confidence: "moderate" }),
    ]);
    expect(out.map((s) => s.interventionId)).toEqual([2, 3, 1]);
  });

  it("breaks remaining ties on the most recent changepoint", () => {
    const out = rankSummaries([
      summary({ interventionId: 1, changepoint: "2026-03-07" }),
      summary({ interventionId: 2, changepoint: "2026-07-06" }),
    ]);
    expect(out.map((s) => s.interventionId)).toEqual([2, 1]);
  });

  it("is stable regardless of the order the store returned", () => {
    const a = summary({ interventionId: 1, confidence: "strong", changepoint: "2026-01-01" });
    const b = summary({ interventionId: 2, confidence: "strong", changepoint: "2026-06-01" });
    expect(rankSummaries([a, b]).map((s) => s.interventionId)).toEqual(
      rankSummaries([b, a]).map((s) => s.interventionId),
    );
  });

  it("returns nothing when every report is insufficient", () => {
    expect(rankSummaries([summary({ confidence: "insufficient" })])).toEqual([]);
  });
});
