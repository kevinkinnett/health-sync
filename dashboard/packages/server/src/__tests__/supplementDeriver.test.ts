import { describe, it, expect } from "vitest";
import {
  SupplementDeriver,
  type IntakeRecord,
} from "../services/interventions/deriver.js";

/** Consecutive days of taking one item, starting at `from`. */
function run(
  itemId: number,
  itemName: string,
  from: string,
  days: number,
): IntakeRecord[] {
  const out: IntakeRecord[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    out.push({
      itemId,
      itemName,
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return out;
}

function derive(history: IntakeRecord[], today = "2026-08-01") {
  return new SupplementDeriver({
    listIntakeHistory: async () => history,
  }).derive(today);
}

describe("SupplementDeriver", () => {
  it("turns a contiguous stretch into one ongoing period", async () => {
    const out = await derive(run(1, "Creatine", "2026-07-01", 30));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "period",
      category: "supplement",
      name: "Creatine",
      startedOn: "2026-07-01",
      endedOn: null,
      detail: "30 days logged, ongoing",
    });
  });

  it("closes a run that stopped well before today", async () => {
    const out = await derive(run(1, "Creatine", "2026-01-01", 20));
    expect(out[0].endedOn).toBe("2026-01-20");
    expect(out[0].detail).toBe("20 days logged");
  });

  it("splits on a long gap — stopping and restarting is two periods", async () => {
    const out = await derive([
      ...run(1, "Creatine", "2026-01-01", 10),
      ...run(1, "Creatine", "2026-05-01", 10),
    ]);
    expect(out.map((i) => i.startedOn)).toEqual(["2026-01-01", "2026-05-01"]);
  });

  it("does NOT split on a short gap — a missed week is not a decision", async () => {
    // Supplements get skipped for a weekend away or a lapsed bottle.
    // Splitting there would shatter one regimen into fragments that each
    // have too little data either side to analyse.
    const out = await derive([
      ...run(1, "Creatine", "2026-06-01", 10),
      ...run(1, "Creatine", "2026-06-18", 10), // 7-day gap
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].startedOn).toBe("2026-06-01");
  });

  it("ignores a run too short to ask a question about", async () => {
    // Trying a thing twice cannot produce a before/after with any weight.
    expect(await derive(run(1, "Creatine", "2026-07-01", 3))).toEqual([]);
  });

  it("counts several intakes in one day as one day", async () => {
    // Two capsules at breakfast and dinner is one day of taking it. Without
    // the dedupe, "5 days logged" would be reachable in two and a half.
    const doubled = run(1, "Magnesium", "2026-07-01", 6).flatMap((r) => [r, r]);
    const out = await derive(doubled);
    // 12 records, 6 distinct days. Closed rather than ongoing because the
    // run ends 2026-07-06, well outside the grace period from `today`.
    expect(out[0].detail).toBe("6 days logged");
    expect(out[0].endedOn).toBe("2026-07-06");
  });

  it("keeps different items apart", async () => {
    const out = await derive([
      ...run(1, "Creatine", "2026-07-01", 10),
      ...run(2, "Magnesium", "2026-07-01", 10),
    ]);
    expect(out.map((i) => i.name).sort()).toEqual(["Creatine", "Magnesium"]);
  });

  it("never splits on amount, unlike the medication deriver", async () => {
    // A supplement's amount wobbles day to day without any of it being a
    // decision, so IntakeRecord does not even carry one. This test exists
    // to pin that difference: the same shape of history under the dose
    // deriver would produce several runs.
    const out = await derive(run(1, "Creatine", "2026-07-01", 20));
    expect(out).toHaveLength(1);
  });

  it("gives each run a distinct source ref so re-deriving is idempotent", async () => {
    const out = await derive([
      ...run(1, "Creatine", "2026-01-01", 10),
      ...run(1, "Creatine", "2026-05-01", 10),
    ]);
    const refs = out.map((i) => i.sourceRef);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("returns nothing for no history", async () => {
    expect(await derive([])).toEqual([]);
  });

  it("sorts unordered history before deciding where runs break", async () => {
    // The repo orders its rows, but the port does not promise it.
    const days = run(1, "Creatine", "2026-07-01", 10);
    const out = await derive([...days].reverse());
    expect(out).toHaveLength(1);
    expect(out[0].startedOn).toBe("2026-07-01");
  });
});
