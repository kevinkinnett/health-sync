import { describe, it, expect } from "vitest";
import {
  MedicationDoseDeriver,
  type DoseHistorySource,
  type DoseRecord,
} from "../services/interventions/deriver.js";

/**
 * Derivation is pure given its inputs (`today` is passed, never read from
 * the clock), so it can be pinned exactly.
 *
 * The worked example is the real escitalopram history: 20 mg from March,
 * halved to 10 mg in May. That boundary is the changepoint a "did it
 * work?" question needs, and until now it existed only as prose in a
 * `notes` column.
 */

function source(records: DoseRecord[]): DoseHistorySource {
  return { listDoseHistory: async () => records };
}

function doses(
  itemId: number,
  itemName: string,
  amount: number,
  from: string,
  days: number,
): DoseRecord[] {
  const out: DoseRecord[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    out.push({
      itemId,
      itemName,
      amount,
      unit: "mg",
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return out;
}

describe("MedicationDoseDeriver", () => {
  it("splits a dose change into two periods at the boundary", async () => {
    const history = [
      ...doses(1, "Escitalopram", 20, "2026-03-07", 10),
      ...doses(1, "Escitalopram", 10, "2026-05-08", 10),
    ];
    const out = await new MedicationDoseDeriver(source(history)).derive(
      "2026-05-18",
    );

    expect(out).toHaveLength(2);
    const [first, second] = out;

    expect(first.name).toBe("Escitalopram 20 mg");
    expect(first.startedOn).toBe("2026-03-07");
    expect(first.endedOn).toBe("2026-03-16"); // closed by the dose change
    expect(first.kind).toBe("period");
    expect(first.category).toBe("medication");

    expect(second.name).toBe("Escitalopram 10 mg");
    expect(second.startedOn).toBe("2026-05-08");
  });

  it("leaves the current run open when it reaches up to today", async () => {
    const history = doses(1, "Escitalopram", 10, "2026-07-10", 17);
    const out = await new MedicationDoseDeriver(source(history)).derive(
      "2026-07-26",
    );
    expect(out).toHaveLength(1);
    expect(out[0].endedOn).toBeNull();
    expect(out[0].detail).toContain("ongoing");
  });

  it("closes a run that stopped well before today", async () => {
    const history = doses(1, "Escitalopram", 20, "2026-03-07", 10);
    const out = await new MedicationDoseDeriver(source(history)).derive(
      "2026-07-26",
    );
    expect(out[0].endedOn).toBe("2026-03-16");
    expect(out[0].detail).not.toContain("ongoing");
  });

  it("keeps separate medications separate", async () => {
    const history = [
      ...doses(1, "Escitalopram", 10, "2026-07-01", 5),
      ...doses(2, "Vitamin D", 2000, "2026-07-01", 5),
    ];
    const out = await new MedicationDoseDeriver(source(history)).derive(
      "2026-07-06",
    );
    expect(out).toHaveLength(2);
    expect(new Set(out.map((i) => i.name))).toEqual(
      new Set(["Escitalopram 10 mg", "Vitamin D 2000 mg"]),
    );
  });

  it("treats a unit change as a new run even at the same number", async () => {
    const history: DoseRecord[] = [
      { itemId: 1, itemName: "X", amount: 1, unit: "mg", date: "2026-07-01" },
      { itemId: 1, itemName: "X", amount: 1, unit: "g", date: "2026-07-02" },
    ];
    const out = await new MedicationDoseDeriver(source(history)).derive(
      "2026-07-03",
    );
    expect(out).toHaveLength(2);
  });

  it("is order-independent — unsorted history yields the same runs", async () => {
    const ordered = [
      ...doses(1, "Escitalopram", 20, "2026-03-07", 5),
      ...doses(1, "Escitalopram", 10, "2026-05-08", 5),
    ];
    const shuffled = [...ordered].reverse();
    const deriveFrom = (recs: DoseRecord[]) =>
      new MedicationDoseDeriver(source(recs)).derive("2026-07-26");

    expect(await deriveFrom(shuffled)).toEqual(await deriveFrom(ordered));
  });

  it("produces a stable sourceRef so re-deriving updates in place", async () => {
    const history = doses(1, "Escitalopram", 10, "2026-05-08", 5);
    const once = await new MedicationDoseDeriver(source(history)).derive(
      "2026-05-13",
    );
    const twice = await new MedicationDoseDeriver(source(history)).derive(
      "2026-05-13",
    );
    expect(once[0].sourceRef).toBe(twice[0].sourceRef);
    expect(once[0].sourceRef).toContain("medication.item:1");
  });

  it("returns nothing for an empty history", async () => {
    expect(await new MedicationDoseDeriver(source([])).derive("2026-07-26")).toEqual(
      [],
    );
  });
});
