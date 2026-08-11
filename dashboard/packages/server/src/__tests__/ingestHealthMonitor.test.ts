import { describe, expect, it, vi } from "vitest";
import type { IngestStatus } from "@health-dashboard/shared";
import { IngestHealthMonitor, ingestTransitionAlert } from "../services/ingestHealthMonitor.js";

function status(state: "healthy" | "stale" | "unknown"): IngestStatus {
  return {
    provenance: {
      device: "fitbit", deviceLabel: "Fitbit device",
      provider: "google_health", providerLabel: "Google Health",
    },
    freshness: {
      status: state,
      lastSuccessAtUtc: state === "unknown" ? null : "2026-08-09T20:00:00.000Z",
      expectedIntervalMinutes: 240,
      staleAfterMinutes: 300,
    },
  };
}

describe("Google Health operational monitor", () => {
  const now = new Date("2026-08-10T01:30:00.000Z");

  it("announces stale onset, but not a repeated stale observation", () => {
    expect(ingestTransitionAlert("healthy", status("stale"), now)).toMatchObject({
      kind: "ingest_stale", severity: "warn", date: "2026-08-10",
    });
    expect(ingestTransitionAlert("stale", status("stale"), now)).toBeNull();
  });

  it("announces recovery only after stale", () => {
    expect(ingestTransitionAlert("stale", status("healthy"), now)).toMatchObject({
      kind: "ingest_recovered", severity: "warn",
    });
    expect(ingestTransitionAlert("healthy", status("healthy"), now)).toBeNull();
  });

  it("persists the observed state and returns a newly created alert", async () => {
    const set = vi.fn();
    const inserted = { id: 9, ...ingestTransitionAlert("healthy", status("stale"), now), createdAt: now.toISOString(), readAt: null };
    const monitor = new IngestHealthMonitor(
      { getStatus: async () => status("stale") },
      { get: async <T>() => ({ status: "healthy", observedAtUtc: "2026-08-09T20:00:00.000Z" } as T), set },
      { insertIfNew: async () => inserted as never, resolveOpenKinds: async () => 0 },
      () => now,
    );
    await expect(monitor.evaluate()).resolves.toMatchObject({ kind: "ingest_stale" });
    expect(set).toHaveBeenCalledWith("monitor.google_health_ingest", {
      status: "stale", observedAtUtc: now.toISOString(),
    });
  });

  it("resolves the stale incident and records recovery as historical", async () => {
    const resolveOpenKinds = vi.fn().mockResolvedValue(1);
    const recovered = {
      id: 10,
      ...ingestTransitionAlert("stale", status("healthy"), now),
      createdAt: now.toISOString(),
      lastObservedAt: now.toISOString(),
      resolvedAt: null,
      occurrenceCount: 1,
      readAt: null,
    };
    const monitor = new IngestHealthMonitor(
      { getStatus: async () => status("healthy") },
      {
        get: async <T>() => ({ status: "stale", observedAtUtc: "2026-08-09T20:00:00.000Z" } as T),
        set: vi.fn(),
      },
      { insertIfNew: async () => recovered as never, resolveOpenKinds },
      () => now,
    );

    await expect(monitor.evaluate()).resolves.toMatchObject({ kind: "ingest_recovered" });
    expect(resolveOpenKinds.mock.calls).toEqual([
      [["ingest_stale"]],
      [["ingest_recovered"]],
    ]);
  });
});
