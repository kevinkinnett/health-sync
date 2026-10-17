import { describe, it, expect } from "vitest";
import type { HealthDataService } from "../services/healthDataService.js";
import { HealthSeriesSource } from "../services/experiments/healthSeriesSource.js";

function sourceWithActivity(rows: Record<string, unknown>[]): HealthSeriesSource {
  const health = { getActivity: async () => rows };
  return new HealthSeriesSource(health as unknown as HealthDataService);
}

describe("HealthSeriesSource activity extractors", () => {
  const rows = [
    // A worn day.
    { date: "2026-05-01", steps: 8000, minutesFairlyActive: 20, minutesVeryActive: 10 },
    // On the charger all day: Fitbit still writes a zero-step row.
    { date: "2026-05-02", steps: 0, minutesFairlyActive: 0, minutesVeryActive: 0 },
    // Worn, but the active-minute columns were never populated.
    { date: "2026-05-03", steps: 6000, minutesFairlyActive: null, minutesVeryActive: null },
    // One column present is still a real reading.
    { date: "2026-05-04", steps: 7000, minutesFairlyActive: 15, minutesVeryActive: null },
  ];

  it("drops zero-step non-wear days from steps", async () => {
    const points = await sourceWithActivity(rows).fetch("steps", "2026-05-01", "2026-05-04");
    expect(points.map((p) => p.date)).toEqual(["2026-05-01", "2026-05-03", "2026-05-04"]);
  });

  it("does not turn missing or non-wear active minutes into zeros", async () => {
    const points = await sourceWithActivity(rows).fetch("activeMinutes", "2026-05-01", "2026-05-04");
    expect(points.map((p) => [p.date, p.value])).toEqual([
      ["2026-05-01", 30],
      ["2026-05-04", 15],
    ]);
  });
});
