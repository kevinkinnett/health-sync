import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { Express } from "express";
import type { Pool } from "pg";
import { createApp } from "../createApp.js";
import type { Config } from "../config.js";

/**
 * Boot smoke test for the composition root.
 *
 * Every other server test builds its own tiny express app around one
 * controller and a fake service, so nothing exercised the REAL wiring:
 * ~40 constructions whose ORDER matters (settingService has to exist
 * before the LLM services that resolve their model from it), seven
 * `ensureTables()` calls that must complete before traffic, and ~12
 * routers that must actually be mounted at the paths the client fetches.
 *
 * Typechecking cannot catch a router mounted at the wrong path, a route
 * module that throws at construction, or a service constructed after its
 * dependant. Database DDL is intentionally absent here: the deployment
 * migration runner owns schema evolution. Until `createApp` was split out of `index.ts` this was
 * untestable at all — importing the module read env vars and bound a port.
 *
 * The pool is faked, so this asserts wiring, not data.
 */

/** Minimal pool that satisfies repository reads and `SELECT 1`. */
function fakePool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

const config: Config = {
  port: 0,
  userTimezone: "America/New_York",
  db: {
    host: "localhost",
    port: 5432,
    user: "u",
    password: "p",
    database: "d",
    ssl: false,
  },
  windmill: { baseUrl: "http://wm", token: "t", workspace: "w" },
  llm: {
    baseUrl: "http://llm",
    apiKey: "",
    dossierModel: "sonnet",
    insightsModel: "sonnet",
    chatModel: "sonnet",
  },
};

describe("createApp — composition root boots", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp(fakePool(), config);
  });

  it("constructs the whole graph without throwing", () => {
    expect(app).toBeDefined();
  });

  it("serves the health check against the pool", async () => {
    const res = await request(app).get("/api/health-check");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", dbConnected: true });
  });

  it("reports the configured timezone (config wiring reaches the route)", async () => {
    const res = await request(app).get("/api/config");
    expect(res.status).toBe(200);
    expect(res.body.userTimezone).toBe("America/New_York");
  });

  it("serves the generated OpenAPI spec with v1 paths", async () => {
    const res = await request(app).get("/api/v1/openapi.json");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths ?? {}).length).toBeGreaterThan(5);
  });

  // The client fetches these prefixes; a router mounted at the wrong path
  // would 404 here while every unit test stayed green.
  //
  // `/api/ingest/*` is deliberately absent: those handlers make an
  // outbound Windmill call, so hitting them here would test the network,
  // not the wiring.
  it.each([
    "/api/health/summary",
    "/api/supplements/items",
    "/api/medications/items",
    "/api/analytics/supplements/intake-by-day",
    "/api/alerts",
    "/api/settings/notifications",
    "/api/settings/llm-models",
    "/api/insights/list",
    "/api/interventions",
    "/api/admin/api-logs/stats",
    "/api/v1/summary",
  ])("mounts a handler at %s", async (path) => {
    const res = await request(app).get(path);
    // Any status but 404 proves a handler is mounted. With a fake pool the
    // data-shape can legitimately be a 500; the mount is what's asserted.
    expect(res.status).not.toBe(404);
  });

  it("mounts the experiment report route", async () => {
    // This one cannot use the not-404 check above: against a fake pool the
    // intervention genuinely does not exist, so 404 is the CORRECT answer
    // and would be indistinguishable from "never mounted". A mounted route
    // answers through errorMapper with a JSON body; an unmounted path
    // falls through to Express's default HTML handler.
    const res = await request(app).get("/api/experiments/interventions/1");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
    expect(res.body.error).toMatch(/intervention 1 not found/i);
  });

  it("routes unknown /api paths to a 404, not the SPA fallback", async () => {
    const res = await request(app).get("/api/definitely-not-a-route");
    expect(res.status).toBe(404);
  });
});
