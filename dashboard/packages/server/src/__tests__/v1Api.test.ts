import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { generateOpenApiSpec } from "../api/v1/openapi.js";
import { createV1Router } from "../api/v1/router.js";
import { buildV1Endpoints, type V1Context } from "../api/v1/endpoints.js";
import { apiLogger } from "../middleware/apiLogger.js";
import type { ApiLogRepository } from "../repositories/apiLogRepo.js";

/**
 * The v1 surface assembles together: an endpoint-def array, a router
 * that binds them, an OpenAPI generator that documents them, and a
 * fire-and-forget logging middleware. These tests guard the contracts:
 *
 * - OpenAPI gen and the runtime router stay in sync with the def array
 *   (no manual list of routes anywhere).
 * - The router shapes responses uniformly (`{ data, timestamp }`).
 * - Argument-shape errors return 400; handler crashes return 500.
 * - The logger middleware fires its INSERT on response finish but
 *   never blocks the response itself.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeServices(): V1Context {
  return {
    userTimezone: "America/New_York",
    healthDataService: {
      getSummary: vi.fn().mockResolvedValue({ summary: true }),
      getActivity: vi.fn().mockResolvedValue([{ date: "2026-04-01", steps: 8500 }]),
      getSleep: vi.fn().mockResolvedValue([]),
      getHeartRate: vi.fn().mockResolvedValue([]),
      getHrv: vi.fn().mockResolvedValue([]),
      getWeight: vi.fn().mockResolvedValue([]),
      getExerciseLogs: vi.fn().mockResolvedValue([]),
      getWeeklyInsights: vi.fn().mockResolvedValue({ currentPeriod: { start: "x", end: "y" } }),
      getRecords: vi.fn().mockResolvedValue({ records: [], streaks: [] }),
      getCorrelations: vi.fn().mockResolvedValue({ pairs: [] }),
      getDayOfWeekHeatmap: vi.fn().mockResolvedValue({ rows: [], dayNames: [], totalDays: 0 }),
    } as never,
    analyticsService: {
      getSupplementAdherence: vi.fn().mockResolvedValue({ ok: true }),
      getSupplementCorrelations: vi.fn().mockResolvedValue({ ok: true }),
      getMedicationAdherence: vi.fn().mockResolvedValue({ ok: true }),
      getMedicationCorrelations: vi.fn().mockResolvedValue({ ok: true }),
    } as never,
    supplementService: {
      listItems: vi.fn().mockResolvedValue([]),
      listIntakes: vi.fn().mockResolvedValue([]),
    } as never,
    medicationService: {
      listItems: vi.fn().mockResolvedValue([]),
      listIntakes: vi.fn().mockResolvedValue([]),
    } as never,
  };
}

function buildApp(ctx: V1Context = fakeServices()): {
  app: express.Express;
  ctx: V1Context;
} {
  const app = express();
  app.use("/api/v1", createV1Router(ctx));
  return { app, ctx };
}

// ---------------------------------------------------------------------------
// OpenAPI spec generator
// ---------------------------------------------------------------------------

describe("generateOpenApiSpec", () => {
  it("declares every v1 endpoint as a GET path", () => {
    const spec = generateOpenApiSpec() as { paths: Record<string, unknown> };
    const eps = buildV1Endpoints();
    expect(Object.keys(spec.paths).sort()).toEqual(eps.map((e) => e.path).sort());
    for (const ep of eps) {
      const op = (spec.paths[ep.path] as Record<string, Record<string, unknown>>).get;
      expect(op).toBeDefined();
      expect(op.summary).toBe(ep.summary);
      expect(op.description).toBe(ep.description);
    }
  });

  it("emits required-flag and types for each parameter", () => {
    const spec = generateOpenApiSpec() as { paths: Record<string, Record<string, Record<string, unknown>>> };
    // Pick a couple of endpoints with known param shapes.
    const adherence = spec.paths["/supplements/adherence"].get as {
      parameters: Array<{ name: string; required: boolean; schema: { type: string } }>;
    };
    const itemId = adherence.parameters.find((p) => p.name === "itemId");
    expect(itemId?.required).toBe(true);
    expect(itemId?.schema.type).toBe("integer");

    const start = adherence.parameters.find((p) => p.name === "start");
    expect(start?.required).toBe(false);
    expect(start?.schema.type).toBe("string");
  });

  it("references the ApiEnvelope schema in 200 responses", () => {
    const spec = generateOpenApiSpec() as {
      paths: Record<string, Record<string, { responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> }>>;
    };
    const ok = spec.paths["/summary"].get.responses["200"];
    expect(ok.content["application/json"].schema.$ref).toBe(
      "#/components/schemas/ApiEnvelope",
    );
  });

  it("attaches the X-Caller header parameter to every endpoint", () => {
    const spec = generateOpenApiSpec() as {
      paths: Record<string, Record<string, { parameters: Array<{ $ref?: string }> }>>;
    };
    for (const ep of buildV1Endpoints()) {
      const params = spec.paths[ep.path].get.parameters;
      expect(params.some((p) => p.$ref === "#/components/parameters/XCaller")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// V1 router runtime behaviour
// ---------------------------------------------------------------------------

describe("v1 router", () => {
  it("wraps successful responses as { data, timestamp }", async () => {
    const { app, ctx } = buildApp();
    const res = await request(app).get("/api/v1/summary").expect(200);
    expect(res.body.data).toEqual({ summary: true });
    expect(res.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ctx.healthDataService.getSummary).toHaveBeenCalledTimes(1);
  });

  it("passes parsed query args to the handler", async () => {
    const { app, ctx } = buildApp();
    await request(app)
      .get("/api/v1/activity?start=2026-04-01&end=2026-04-30")
      .expect(200);
    expect(ctx.healthDataService.getActivity).toHaveBeenCalledWith(
      "2026-04-01",
      "2026-04-30",
    );
  });

  it("returns 400 when a required arg is missing", async () => {
    const { app } = buildApp();
    // /supplements/adherence requires itemId
    const res = await request(app)
      .get("/api/v1/supplements/adherence")
      .expect(400);
    expect(res.body.error).toBe("Bad request");
    expect(res.body.message).toMatch(/itemId required/);
  });

  it("returns 500 when the handler throws an unexpected error", async () => {
    const ctx = fakeServices();
    (ctx.healthDataService.getSummary as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down"),
    );
    const { app } = buildApp(ctx);
    const res = await request(app).get("/api/v1/summary").expect(500);
    expect(res.body.error).toBe("Query failed");
    expect(res.body.message).toBe("db down");
  });

  it("registers exactly the routes declared by buildV1Endpoints", async () => {
    const { app } = buildApp();
    for (const ep of buildV1Endpoints()) {
      // The 'records' endpoint takes no args and the handler returns {} — every
      // endpoint without required args should respond 200 in this fake setup.
      // For endpoints WITH required args (adherence/correlations) we already
      // covered the 400 path above; here we just confirm the route exists by
      // checking we don't get 404.
      const res = await request(app).get(`/api/v1${ep.path}`);
      expect(res.status).not.toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// apiLogger middleware
// ---------------------------------------------------------------------------

describe("apiLogger middleware", () => {
  let logEntries: Array<Record<string, unknown>>;
  let repo: ApiLogRepository;

  beforeEach(() => {
    logEntries = [];
    repo = {
      log: vi.fn(async (entry) => {
        logEntries.push(entry);
      }),
    } as never;
  });

  it("inserts a row after the response finishes (with status, duration, X-Caller)", async () => {
    const app = express();
    app.use(apiLogger(repo));
    app.get("/api/v1/ping", (_req, res) => res.json({ ok: true }));

    await request(app)
      .get("/api/v1/ping?foo=bar")
      .set("X-Caller", "test-script")
      .expect(200);

    // res.on("finish") runs synchronously after send — give the
    // microtask queue one tick so the log call has resolved.
    await new Promise((r) => setImmediate(r));

    expect(logEntries).toHaveLength(1);
    const entry = logEntries[0];
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/v1/ping");
    expect(entry.statusCode).toBe(200);
    expect(entry.caller).toBe("test-script");
    expect(entry.requestParams).toEqual({ foo: "bar" });
    expect(typeof entry.durationMs).toBe("number");
    expect((entry.durationMs as number) >= 0).toBe(true);
  });

  it("captures the response status code (including errors) without aborting it", async () => {
    const app = express();
    app.use(apiLogger(repo));
    app.get("/api/v1/boom", (_req, res) => {
      res.status(503).json({ error: "down" });
    });

    await request(app).get("/api/v1/boom").expect(503);
    await new Promise((r) => setImmediate(r));

    expect(logEntries).toHaveLength(1);
    expect(logEntries[0].statusCode).toBe(503);
  });

  it("does not block the response when the log INSERT throws", async () => {
    repo = {
      log: vi.fn().mockRejectedValue(new Error("db down")),
    } as never;
    const app = express();
    app.use(apiLogger(repo));
    app.get("/api/v1/ping", (_req, res) => res.json({ ok: true }));

    // Should complete normally even though the log INSERT rejects.
    const res = await request(app).get("/api/v1/ping").expect(200);
    expect(res.body).toEqual({ ok: true });
    // Wait for the rejected promise to settle so it doesn't leak into
    // the next test.
    await new Promise((r) => setImmediate(r));
  });

  it("records caller as null when the X-Caller header is absent", async () => {
    const app = express();
    app.use(apiLogger(repo));
    app.get("/api/v1/ping", (_req, res) => res.json({ ok: true }));

    await request(app).get("/api/v1/ping").expect(200);
    await new Promise((r) => setImmediate(r));

    expect(logEntries[0].caller).toBeNull();
  });
});
