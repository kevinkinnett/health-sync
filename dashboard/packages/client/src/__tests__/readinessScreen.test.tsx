import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Readiness } from "../pages/Readiness";
import type { ReadinessScore } from "@health-dashboard/shared";

const apiFetchMock = vi.fn();
vi.mock("../api/client", () => ({
  apiFetch: (path?: string) => apiFetchMock(path),
}));

const FITBIT_VIA_GOOGLE = {
  device: "fitbit" as const,
  deviceLabel: "Fitbit device",
  provider: "google_health" as const,
  providerLabel: "Google Health",
};
const EIGHT_SLEEP = {
  device: "eight_sleep" as const,
  deviceLabel: "Eight Sleep",
  provider: "eight_sleep" as const,
  providerLabel: "Eight Sleep",
};

function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Readiness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const SCORE: ReadinessScore = {
  methodVersion: "readiness-v2-main-night",
  date: "2026-05-30",
  score: 72,
  band: "primed",
  summary: "Primed — hrv is a bright spot.",
  baselineDays: 30,
  timezone: "America/New_York",
  confidence: "high",
  coveragePct: 100,
  provisional: false,
  caveats: [],
  components: [
    {
      metric: "hrv",
      label: "HRV",
      value: 65,
      baseline: 50,
      z: 1.4,
      contribution: 12,
      weightPct: 35,
      configuredWeight: 35,
      status: "good",
      sources: [
        { label: "Fitbit", provenance: FITBIT_VIA_GOOGLE, z: 0.9, value: 52, baseline: 48, measurement: "daily RMSSD", regime: "daily_hrv_v1" },
        { label: "Eight Sleep", provenance: EIGHT_SLEEP, z: 1.8, value: 78, baseline: 65, measurement: "main-session RMSSD", regime: "main_session_v1" },
      ],
    },
    {
      metric: "rhr",
      label: "Resting HR",
      value: 53,
      baseline: 60,
      z: 0.9,
      contribution: 6,
      weightPct: 25,
      configuredWeight: 25,
      status: "good",
      sources: [
        { label: "Fitbit", provenance: FITBIT_VIA_GOOGLE, z: 0.2, value: 55, baseline: 56, measurement: "daily resting HR", regime: "daily_rhr_v1" },
        { label: "Eight Sleep", provenance: EIGHT_SLEEP, z: 1.6, value: 49, baseline: 54, measurement: "average sleeping HR", regime: "main_session_v1" },
      ],
      disagreement: true,
      disagreementExplanation: "Source-relative trends diverged beyond the expected range.",
    },
    // Neutral signal — the dashboard card hides this, the detail screen shows it.
    {
      metric: "spo2",
      label: "Blood oxygen",
      value: 96,
      baseline: 96,
      z: 0.1,
      contribution: 0,
      weightPct: 8,
      configuredWeight: 8,
      status: "neutral",
    },
    // Unavailable today — should land in the "not scored" footnote, not a row.
    {
      metric: "skinTemp",
      label: "Skin temperature",
      value: null,
      baseline: null,
      z: null,
      contribution: 0,
      weightPct: 7,
      configuredWeight: 7,
      status: "unavailable",
    },
  ],
  history: [
    { date: "2026-05-28", score: 60, methodVersion: "readiness-v2-main-night", confidence: "high", coveragePct: 100 },
    { date: "2026-05-29", score: 68, methodVersion: "readiness-v2-main-night", confidence: "high", coveragePct: 100 },
    { date: "2026-05-30", score: 72, methodVersion: "readiness-v2-main-night", confidence: "high", coveragePct: 100 },
  ],
};

describe("Readiness screen", () => {
  beforeEach(() => apiFetchMock.mockReset());

  it("renders the band, score, and summary", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    // Score lives on the dial (the waterfall also prints it on its Today row,
    // so target the dial's aria-label rather than the bare number).
    expect(
      await screen.findByLabelText(/Readiness score 72 of 100/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Primed")).toBeInTheDocument();
    expect(screen.getByText(/bright spot/i)).toBeInTheDocument();
  });

  it("shows EVERY scored signal — including neutral ones the card omits", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    // Scope to the Signal breakdown card — signal names also appear in the
    // new "what's driving" waterfall above it.
    const breakdown = (await screen.findByText("Signal breakdown")).closest(
      "div",
    )!;
    expect(within(breakdown).getByText("HRV")).toBeInTheDocument();
    expect(within(breakdown).getByText("Resting HR")).toBeInTheDocument();
    // Neutral SpO2 is NOT a driver chip on the card, but the detail lists it.
    expect(within(breakdown).getByText("Blood oxygen")).toBeInTheDocument();
  });

  it("surfaces each sensor's per-source contribution and the disagreement flag", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    // HRV fused from two sensors → both shown with signed z.
    expect(await screen.findAllByText("Fitbit device via Google Health")).not.toHaveLength(0);
    expect(screen.getAllByText("Eight Sleep")).not.toHaveLength(0);
    expect(screen.getByText("daily RMSSD")).toBeInTheDocument();
    // RHR sensors disagreed → flag rendered.
    expect(screen.getByText("⚑")).toBeInTheDocument();
  });

  it("lists unavailable signals in a footnote rather than a row", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    expect(await screen.findByText(/Not scored today/i)).toBeInTheDocument();
    expect(screen.getByText(/Skin temperature/)).toBeInTheDocument();
  });

  it("links each signal row to its full analytics screen", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    const hrv = await screen.findByRole("link", { name: /HRV.*full history/i });
    expect(hrv).toHaveAttribute("href", "/analytics/hrv");
    expect(
      screen.getByRole("link", { name: /Resting HR.*full history/i }),
    ).toHaveAttribute("href", "/analytics/heart-rate");
    // Vitals signals (breathing/SpO2/skin-temp) point at the Vitals screen.
    expect(
      screen.getByRole("link", { name: /Blood oxygen.*full history/i }),
    ).toHaveAttribute("href", "/analytics/vitals");
  });

  it("explains the methodology", async () => {
    apiFetchMock.mockResolvedValue(SCORE);
    renderScreen();
    expect(await screen.findByText(/How readiness is computed/i)).toBeInTheDocument();
  });

  it("degrades to a friendly message when there is no score yet", async () => {
    apiFetchMock.mockResolvedValue({
      methodVersion: "readiness-v2-main-night",
      date: "2026-05-30",
      score: null,
      band: "insufficient",
      summary: "Not enough baseline history yet — keep syncing.",
      baselineDays: 0,
      timezone: "America/New_York",
      confidence: "low",
      coveragePct: 0,
      provisional: false,
      caveats: [],
      components: [],
      history: [],
    } satisfies ReadinessScore);
    renderScreen();
    expect(await screen.findByText(/keep syncing/i)).toBeInTheDocument();
    expect(screen.queryByText("72")).not.toBeInTheDocument();
  });
});
