import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Express } from "express";
import { InterventionController } from "../controllers/interventionController.js";
import { createInterventionRoutes } from "../routes/interventions.js";
import { errorMapper } from "../middleware/errorMapper.js";
import {
  InterventionService,
  type InterventionStore,
} from "../services/interventions/interventionService.js";
import type {
  CreateInterventionBody,
  DerivedIntervention,
  Intervention,
} from "@health-dashboard/shared";

/**
 * Route → controller → service → errorMapper, over a real Express app.
 *
 * Covers what the service unit tests cannot: that each verb is mounted at
 * the path the client will call, that `/refresh` is not swallowed by the
 * `/:id` route, and that service errors arrive as the right HTTP status
 * rather than a 500.
 */

class MemoryStore implements InterventionStore {
  rows: Intervention[] = [];
  private nextId = 1;
  async findAll() {
    return [...this.rows];
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
  async update(id: number, patch: Partial<CreateInterventionBody>, clear = false) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(
      row,
      Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    );
    if (clear) row.endedOn = null;
    return row;
  }
  async remove(id: number) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
  async upsertDerived(items: DerivedIntervention[]) {
    for (const item of items) {
      const hit = this.rows.find((r) => r.sourceRef === item.sourceRef);
      if (hit) Object.assign(hit, item);
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

const BODY = {
  kind: "period",
  category: "device",
  name: "Eight Sleep Pod",
  startedOn: "2026-05-02",
};

let app: Express;
let store: MemoryStore;

beforeEach(() => {
  store = new MemoryStore();
  const service = new InterventionService(store, [
    {
      id: "meds",
      derive: async () => [
        {
          kind: "period",
          category: "medication",
          name: "Escitalopram 10 mg",
          startedOn: "2026-05-08",
          endedOn: null,
          sourceRef: "medication.item:1:dose:10:2026-05-08",
          detail: null,
        },
      ],
    },
  ]);
  const controller = new InterventionController(service, {
    userTimezone: "America/New_York",
  });
  app = express();
  app.use(express.json());
  app.use("/api/interventions", createInterventionRoutes(controller));
  app.use("/api", errorMapper);
});

describe("intervention routes", () => {
  it("creates and returns 201", async () => {
    const res = await request(app).post("/api/interventions").send(BODY);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Eight Sleep Pod");
    expect(res.body.source).toBe("manual");
  });

  it("lists everything, and filters by window when given start+end", async () => {
    await request(app).post("/api/interventions").send(BODY);
    await request(app)
      .post("/api/interventions")
      .send({ ...BODY, name: "Old", startedOn: "2026-01-01", endedOn: "2026-02-01" });

    expect((await request(app).get("/api/interventions")).body).toHaveLength(2);

    const windowed = await request(app)
      .get("/api/interventions")
      .query({ start: "2026-06-01", end: "2026-07-01" });
    expect(windowed.body.map((r: Intervention) => r.name)).toEqual(["Eight Sleep Pod"]);
  });

  it("gets one by id and 404s an unknown id", async () => {
    const made = await request(app).post("/api/interventions").send(BODY);
    expect((await request(app).get(`/api/interventions/${made.body.id}`)).status).toBe(200);
    expect((await request(app).get("/api/interventions/9999")).status).toBe(404);
  });

  it("400s a malformed id rather than treating it as a name", async () => {
    expect((await request(app).get("/api/interventions/not-a-number")).status).toBe(400);
  });

  it("400s an invalid body with a useful message", async () => {
    const res = await request(app)
      .post("/api/interventions")
      .send({ ...BODY, kind: "event", endedOn: "2026-06-01" });
    expect(res.status).toBe(400);
    expect(String(res.body.error ?? res.text)).toMatch(/event has no end date/i);
  });

  it("patches partially", async () => {
    const made = await request(app).post("/api/interventions").send(BODY);
    const res = await request(app)
      .patch(`/api/interventions/${made.body.id}`)
      .send({ detail: "king size" });
    expect(res.status).toBe(200);
    expect(res.body.detail).toBe("king size");
    expect(res.body.name).toBe("Eight Sleep Pod");
  });

  it("deletes and returns 204", async () => {
    const made = await request(app).post("/api/interventions").send(BODY);
    expect((await request(app).delete(`/api/interventions/${made.body.id}`)).status).toBe(204);
    expect((await request(app).get("/api/interventions")).body).toHaveLength(0);
  });

  it("POST /refresh derives, and is not shadowed by the /:id route", async () => {
    const res = await request(app).post("/api/interventions/refresh");
    expect(res.status).toBe(200);
    expect(res.body.derived).toBe(1);
    expect(store.rows[0].source).toBe("derived");
  });

  it("refresh is idempotent across repeated calls", async () => {
    await request(app).post("/api/interventions/refresh");
    await request(app).post("/api/interventions/refresh");
    expect(store.rows).toHaveLength(1);
  });

  it("400s an attempt to edit a derived row", async () => {
    await request(app).post("/api/interventions/refresh");
    const derived = store.rows[0];
    const res = await request(app)
      .patch(`/api/interventions/${derived.id}`)
      .send({ name: "nope" });
    expect(res.status).toBe(400);
  });
});
