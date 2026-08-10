import { describe, expect, it } from "vitest";
import {
  healthSummaryResponseSchema,
  ingestStatusResponseSchema,
  readinessResponseSchema,
} from "../contracts/dashboardContracts.js";

const source = {
  label: "Fitbit",
  provenance: {
    device: "fitbit",
    deviceLabel: "Fitbit device",
    provider: "google_health",
    providerLabel: "Google Health",
  },
  z: 0.4,
};

describe("dashboard response contracts", () => {
  it("accepts readiness sources for both current and cached clients", () => {
    expect(readinessResponseSchema.parse({
      date: "2026-08-09", score: 57, band: "balanced", summary: "At baseline",
      baselineDays: 30,
      components: [{
        metric: "hrv", label: "HRV", value: 52, baseline: 48, z: 0.4,
        contribution: 2, weightPct: 25, status: "good", sources: [source],
      }],
      history: [{ date: "2026-08-09", score: 57 }],
    }).components[0]?.sources?.[0]?.label).toBe("Fitbit");
  });

  it("rejects removal of the legacy source label during the compatibility window", () => {
    const breakingSource = { provenance: source.provenance, z: source.z };
    expect(() => readinessResponseSchema.parse({
      date: null, score: null, band: "insufficient", summary: "Not enough data",
      baselineDays: 0,
      components: [{
        metric: "hrv", label: "HRV", value: null, baseline: null, z: null,
        contribution: 0, weightPct: 25, status: "unavailable", sources: [breakingSource],
      }],
      history: [],
    })).toThrow();
  });

  it("rejects invalid ingestion provenance and freshness", () => {
    expect(() => ingestStatusResponseSchema.parse({
      provenance: { ...source.provenance, provider: "fitbit" },
      freshness: { status: "late", lastSuccessAtUtc: "yesterday", expectedIntervalMinutes: 240, staleAfterMinutes: 300 },
    })).toThrow();
  });

  it("requires every summary domain", () => {
    const domain = { latest: null, sparkline: [{ date: "2026-08-09", value: 1 }] };
    expect(() => healthSummaryResponseSchema.parse({
      activity: domain, sleep: domain, heartRate: domain,
    })).toThrow();
  });
});
