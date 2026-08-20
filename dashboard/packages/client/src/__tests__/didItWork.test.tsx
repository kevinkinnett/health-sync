import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  ExperimentSummary,
  MetricEffect,
} from "@health-dashboard/shared";
import { DidItWorkCard } from "../components/DidItWorkCard";

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

function summary(over: Partial<ExperimentSummary> = {}): ExperimentSummary {
  return {
    interventionId: 1,
    interventionName: "Eight Sleep Pod",
    interventionCategory: "device",
    evidence: "observed_change",
    changepoint: "2026-05-02",
    confidence: "weak",
    summary: "After the Eight Sleep Pod, sleep efficiency improved.",
    headline: effect(),
    ...over,
  };
}

function renderCard(data: ExperimentSummary[]) {
  return render(
    <MemoryRouter>
      <DidItWorkCard data={data} />
    </MemoryRouter>,
  );
}

describe("DidItWorkCard", () => {
  it("asks the question and answers it with the headline move", () => {
    renderCard([summary()]);
    expect(screen.getByText("Did it work?")).toBeInTheDocument();
    expect(screen.getByText("Eight Sleep Pod")).toBeInTheDocument();
    expect(screen.getByTestId("did-it-work-headline")).toHaveTextContent(
      "Sleep efficiency",
    );
    expect(screen.getByTestId("did-it-work-headline")).toHaveTextContent("+11.2");
  });

  it("always shows the confidence beside the number", () => {
    // A number without its caveat is worse than no number on a screen
    // people glance at. This is the same discipline that keeps a p-value
    // out of the full report.
    renderCard([summary({ confidence: "weak" })]);
    expect(screen.getByText(/Observed change · Limited estimate confidence/)).toBeInTheDocument();
  });

  it("marks a regression as worse, not just as a negative number", () => {
    // Colour alone would not carry this, and "down" is an improvement for
    // resting HR but a loss for sleep — the direction has to be stated.
    renderCard([
      summary({
        headline: effect({
          label: "Resting HR",
          unit: "bpm",
          delta: 2.4,
          improved: false,
          betterDirection: "down",
        }),
      }),
    ]);
    const head = screen.getByTestId("did-it-work-headline");
    expect(head).toHaveTextContent("Resting HR");
    expect(head).toHaveTextContent("worse");
  });

  it("says so plainly when nothing moved", () => {
    renderCard([summary({ headline: null })]);
    expect(screen.getByText("Nothing moved meaningfully.")).toBeInTheDocument();
    expect(screen.queryByTestId("did-it-work-headline")).not.toBeInTheDocument();
  });

  it("deep-links each verdict to its own report", () => {
    // The point of the card: land on the answer, not on a list to search.
    renderCard([summary({ interventionId: 7 })]);
    const link = screen.getByRole("link", { name: /Eight Sleep Pod/ });
    expect(link).toHaveAttribute("href", "/timeline?intervention=7");
  });

  it("invites a first entry instead of rendering an empty card", () => {
    renderCard([]);
    expect(screen.getByTestId("did-it-work-empty")).toBeInTheDocument();
  });

  it("renders every verdict it is given, in the order given", () => {
    // Ranking is the server's job (see experimentHeadline.test.ts); the
    // card must not quietly re-sort and disagree with it.
    renderCard([
      summary({ interventionId: 1, interventionName: "Eight Sleep Pod" }),
      summary({ interventionId: 2, interventionName: "Creatine 5 g" }),
    ]);
    const names = screen
      .getAllByRole("link")
      .map((a) => a.textContent ?? "")
      .filter((t) => t.includes("Pod") || t.includes("Creatine"));
    expect(names[0]).toContain("Eight Sleep Pod");
    expect(names[1]).toContain("Creatine 5 g");
  });
});
