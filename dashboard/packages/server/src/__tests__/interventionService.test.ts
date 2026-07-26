import { describe, it, expect } from "vitest";
import type {
  CreateInterventionBody,
  DerivedIntervention,
  Intervention,
} from "@health-dashboard/shared";
import {
  InterventionService,
  type InterventionStore,
} from "../services/interventions/interventionService.js";
import type { InterventionDeriver } from "../services/interventions/deriver.js";
import { BadRequestError, NotFoundError } from "../services/errors.js";

/**
 * The service depends on a narrow store port, so it can be exercised
 * entirely in memory — no pool, no fake `query` returning canned rows.
 * That is the payoff of the port: these tests describe behaviour, not
 * SQL.
 */
class MemoryStore implements InterventionStore {
  rows: Intervention[] = [];
  private nextId = 1;

  async findAll() {
    return [...this.rows].sort((a, b) => b.startedOn.localeCompare(a.startedOn));
  }
  async findOverlapping(start: string, end: string) {
    return this.rows.filter(
      (r) => r.startedOn <= end && (r.endedOn == null || r.endedOn >= start),
    );
  }
  async findById(id: number) {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(body: CreateInterventionBody) {
    const row: Intervention = {
      id: this.nextId++,
      kind: body.kind,
      category: body.category,
      name: body.name,
      startedOn: body.startedOn,
      endedOn: body.endedOn ?? null,
      source: "manual",
      sourceRef: null,
      detail: body.detail ?? null,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
    };
    this.rows.push(row);
    return row;
  }
  async update(
    id: number,
    patch: Partial<CreateInterventionBody>,
    clearEndedOn = false,
  ) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, {
      ...Object.fromEntries(
        Object.entries(patch).filter(([, v]) => v !== undefined),
      ),
    });
    if (clearEndedOn) row.endedOn = null;
    return row;
  }
  async remove(id: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
  async upsertDerived(items: DerivedIntervention[]) {
    for (const item of items) {
      const existing = this.rows.find((r) => r.sourceRef === item.sourceRef);
      if (existing) Object.assign(existing, item);
      else
        this.rows.push({
          ...item,
          id: this.nextId++,
          source: "derived",
          createdAt: "2026-07-26T00:00:00.000Z",
          updatedAt: "2026-07-26T00:00:00.000Z",
        });
    }
    return items.length;
  }
}

const VALID: CreateInterventionBody = {
  kind: "period",
  category: "device",
  name: "Eight Sleep Pod",
  startedOn: "2026-05-02",
};

function service(derivers: InterventionDeriver[] = []) {
  const store = new MemoryStore();
  return { store, svc: new InterventionService(store, derivers) };
}

describe("InterventionService — validation", () => {
  it("creates a valid period", async () => {
    const { svc } = service();
    const made = await svc.create(VALID);
    expect(made.name).toBe("Eight Sleep Pod");
    expect(made.endedOn).toBeNull();
    expect(made.source).toBe("manual");
  });

  it("rejects an event carrying an end date", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...VALID, kind: "event", endedOn: "2026-06-01" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects an end date before the start", async () => {
    const { svc } = service();
    await expect(
      svc.create({ ...VALID, endedOn: "2026-05-01" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects a malformed date and an empty name", async () => {
    const { svc } = service();
    await expect(svc.create({ ...VALID, startedOn: "May 2" })).rejects.toThrow();
    await expect(svc.create({ ...VALID, name: "  " })).rejects.toThrow();
  });

  it("404s an unknown id", async () => {
    const { svc } = service();
    await expect(svc.get(99)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("InterventionService — update rules", () => {
  it("validates the MERGED row, not just the patch", async () => {
    // The patch alone looks fine; only merging reveals end < start.
    const { svc } = service();
    const made = await svc.create({ ...VALID, endedOn: "2026-06-01" });
    await expect(
      svc.update(made.id, { startedOn: "2026-07-01" }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("rejects turning a period with an end date into an event", async () => {
    const { svc } = service();
    const made = await svc.create({ ...VALID, endedOn: "2026-06-01" });
    await expect(svc.update(made.id, { kind: "event" })).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it("treats an explicit null endedOn as 'clear it'", async () => {
    const { svc } = service();
    const made = await svc.create({ ...VALID, endedOn: "2026-06-01" });
    const updated = await svc.update(made.id, { endedOn: null });
    expect(updated.endedOn).toBeNull();
  });

  it("leaves untouched fields alone on a partial patch", async () => {
    const { svc } = service();
    const made = await svc.create({ ...VALID, detail: "king size" });
    const updated = await svc.update(made.id, { name: "Eight Sleep Pod 4" });
    expect(updated.name).toBe("Eight Sleep Pod 4");
    expect(updated.detail).toBe("king size");
    expect(updated.startedOn).toBe("2026-05-02");
  });

  it("refuses to edit or delete a derived intervention", async () => {
    const { store, svc } = service();
    await store.upsertDerived([
      {
        kind: "period",
        category: "medication",
        name: "Escitalopram 10 mg",
        startedOn: "2026-05-08",
        endedOn: null,
        sourceRef: "medication.item:1:dose:10:2026-05-08",
        detail: null,
      },
    ]);
    const derived = (await svc.list())[0];
    await expect(svc.update(derived.id, { name: "x" })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(svc.remove(derived.id)).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("InterventionService — windows", () => {
  it("finds interventions overlapping a window, including open periods", async () => {
    const { svc } = service();
    await svc.create({ ...VALID, name: "Ongoing", startedOn: "2026-05-02" });
    await svc.create({
      ...VALID,
      name: "Ended before",
      startedOn: "2026-01-01",
      endedOn: "2026-02-01",
    });
    const hits = await svc.listOverlapping("2026-06-01", "2026-07-01");
    expect(hits.map((h) => h.name)).toEqual(["Ongoing"]);
  });

  it("rejects a backwards window", async () => {
    const { svc } = service();
    await expect(
      svc.listOverlapping("2026-07-01", "2026-06-01"),
    ).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe("InterventionService — derivation", () => {
  const deriver = (id: string, items: DerivedIntervention[]): InterventionDeriver => ({
    id,
    derive: async () => items,
  });

  const sample: DerivedIntervention = {
    kind: "period",
    category: "medication",
    name: "Escitalopram 10 mg",
    startedOn: "2026-05-08",
    endedOn: null,
    sourceRef: "medication.item:1:dose:10:2026-05-08",
    detail: null,
  };

  it("is idempotent — re-running converges instead of duplicating", async () => {
    const { store, svc } = service([deriver("meds", [sample])]);
    await svc.refreshDerived("2026-07-26");
    await svc.refreshDerived("2026-07-26");
    expect(store.rows).toHaveLength(1);
  });

  it("never clobbers a manual row", async () => {
    const { store, svc } = service([deriver("meds", [sample])]);
    await svc.create(VALID);
    await svc.refreshDerived("2026-07-26");
    expect(store.rows).toHaveLength(2);
    expect(store.rows.filter((r) => r.source === "manual")).toHaveLength(1);
  });

  it("one failing deriver does not deny the others", async () => {
    const failing: InterventionDeriver = {
      id: "broken",
      derive: async () => {
        throw new Error("query exploded");
      },
    };
    const { store, svc } = service([failing, deriver("meds", [sample])]);
    const result = await svc.refreshDerived("2026-07-26");

    expect(store.rows).toHaveLength(1); // the healthy one still landed
    expect(result.derived).toBe(1);
    expect(String(result.bySource.broken)).toContain("query exploded");
    expect(result.bySource.meds).toBe(1);
  });
});
