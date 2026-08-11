import { describe, expect, it, vi } from "vitest";
import { AlertRepository } from "../repositories/alertRepo.js";

const detected = {
  kind: "readiness_drop" as const,
  severity: "warn" as const,
  title: "Readiness has dropped",
  detail: "Readiness is outside the recent range.",
  metric: "readiness",
  date: "2026-08-11",
};

const row = {
  id: 14,
  ...detected,
  created_at: new Date("2026-08-11T12:00:00Z"),
  last_observed_at: new Date("2026-08-11T16:00:00Z"),
  resolved_at: null,
  occurrence_count: 2,
  read_at: null,
};

describe("AlertRepository episodes", () => {
  it("refreshes an open episode without creating another notification", async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [row] });
    const repo = new AlertRepository({ query } as never);

    await expect(repo.insertIfNew(detected)).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("occurrence_count = occurrence_count + 1");
  });

  it("inserts a new episode when no open or recent episode exists", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] });
    const repo = new AlertRepository({ query } as never);

    await expect(repo.insertIfNew(detected)).resolves.toMatchObject({
      id: 14,
      occurrenceCount: 2,
      resolvedAt: null,
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("resolves only the requested open episode kinds", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 2 });
    const repo = new AlertRepository({ query } as never);

    await expect(repo.resolveOpenKinds(["low_spo2", "readiness_drop"]))
      .resolves.toBe(2);
    expect(query.mock.calls[0][1]).toEqual([["low_spo2", "readiness_drop"]]);
  });
});
