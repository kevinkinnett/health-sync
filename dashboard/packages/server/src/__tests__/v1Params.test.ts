import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { createV1Router } from "../api/v1/router.js";
import type { V1Context } from "../api/v1/endpoints.js";

/**
 * Argument handling on the v1 surface (also the LLM tool surface):
 * date windows, local-day intake bounds, and boolean query flags.
 */

function ctx(): V1Context {
  return {
    userTimezone: "America/New_York",
    healthDataService: {
      getSleep: vi.fn().mockResolvedValue([]),
      getActivity: vi.fn().mockResolvedValue([]),
    } as never,
    analyticsService: {
      getSupplementAdherence: vi.fn().mockResolvedValue({}),
    } as never,
    supplementService: {
      listItems: vi.fn().mockResolvedValue([]),
      listIntakes: vi.fn().mockResolvedValue([]),
    } as never,
    medicationService: {
      listItems: vi.fn().mockResolvedValue([]),
      listIntakes: vi.fn().mockResolvedValue([]),
    } as never,
    recoveryService: {
      listActivities: vi.fn().mockResolvedValue([]),
      listSessions: vi.fn().mockResolvedValue([]),
    } as never,
    trainingService: {} as never,
    recoveryEffectsService: {} as never,
    recoveryEventStudyService: {} as never,
  };
}

function app(c: V1Context) {
  const a = express();
  a.use("/api/v1", createV1Router(c));
  return a;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("v1 date windows", () => {
  it("keeps a lone start and defaults end to today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T16:00:00Z"));
    const c = ctx();
    await request(app(c)).get("/api/v1/sleep?start=2026-03-01").expect(200);
    expect(c.healthDataService.getSleep).toHaveBeenCalledWith("2026-03-01", "2026-10-16");
  });

  it("keeps a lone end and defaults start to 30 days before it", async () => {
    const c = ctx();
    await request(app(c)).get("/api/v1/sleep?end=2026-03-31").expect(200);
    expect(c.healthDataService.getSleep).toHaveBeenCalledWith("2026-03-01", "2026-03-31");
  });

  it.each([
    ["start=2026-3-01&end=2026-03-31"],
    ["start=2026-02-30&end=2026-03-31"],
    ["start=2026-04-01&end=2026-03-01"],
    ["end=yesterday"],
  ])("rejects %s with 400", async (qs) => {
    const c = ctx();
    const res = await request(app(c)).get(`/api/v1/sleep?${qs}`).expect(400);
    expect(res.body.error).toBe("Bad request");
    expect(c.healthDataService.getSleep).not.toHaveBeenCalled();
  });

  it("reports the validation error to LLM tool callers too", async () => {
    const { executeHealthTool } = await import("../services/healthTools.js");
    const c = ctx();
    const out = JSON.parse(await executeHealthTool("query_sleep", { start: "March" }, c));
    expect(out.error).toMatch(/invalid/i);
  });

  it("validates adherence windows and keeps the 90-day default", async () => {
    const c = ctx();
    await request(app(c)).get("/api/v1/supplements/adherence?itemId=1&end=2026-04-30").expect(200);
    expect(c.analyticsService.getSupplementAdherence).toHaveBeenCalledWith(1, "2026-01-30", "2026-04-30");
    await request(app(c)).get("/api/v1/supplements/adherence?itemId=1&start=bad").expect(400);
  });
});

describe("v1 intake windows are local calendar days", () => {
  it.each(["supplements", "medications"] as const)(
    "%s: a same-day range spans the whole New York day",
    async (kind) => {
      const c = ctx();
      await request(app(c))
        .get(`/api/v1/${kind}/intakes?start=2026-10-14&end=2026-10-14`)
        .expect(200);
      const svc = kind === "supplements" ? c.supplementService : c.medicationService;
      expect(svc.listIntakes).toHaveBeenCalledWith(
        "2026-10-14T04:00:00.000Z",
        "2026-10-15T03:59:59.999Z",
        undefined,
      );
    },
  );

  it("converts each bound independently and leaves absent bounds open", async () => {
    const c = ctx();
    await request(app(c)).get("/api/v1/supplements/intakes?end=2026-01-15&itemId=3").expect(200);
    expect(c.supplementService.listIntakes).toHaveBeenCalledWith(
      undefined,
      "2026-01-16T04:59:59.999Z",
      3,
    );
    await request(app(c)).get("/api/v1/medications/intakes").expect(200);
    expect(c.medicationService.listIntakes).toHaveBeenCalledWith(undefined, undefined, undefined);
  });

  it("rejects malformed or reversed intake dates", async () => {
    const c = ctx();
    await request(app(c)).get("/api/v1/supplements/intakes?start=2026-10-14T00:00").expect(400);
    await request(app(c)).get("/api/v1/medications/intakes?start=2026-10-15&end=2026-10-14").expect(400);
    expect(c.supplementService.listIntakes).not.toHaveBeenCalled();
    expect(c.medicationService.listIntakes).not.toHaveBeenCalled();
  });
});

describe("v1 boolean flags", () => {
  it.each([
    ["supplements/items", "supplementService", "listItems"],
    ["medications/items", "medicationService", "listItems"],
    ["recovery/activities", "recoveryService", "listActivities"],
  ] as const)("%s parses includeInactive strings", async (path, svc, fn) => {
    const c = ctx();
    const a = app(c);
    const mock = (c[svc] as unknown as Record<string, ReturnType<typeof vi.fn>>)[fn];
    await request(a).get(`/api/v1/${path}?includeInactive=false`).expect(200);
    expect(mock).toHaveBeenLastCalledWith(false);
    await request(a).get(`/api/v1/${path}?includeInactive=true`).expect(200);
    expect(mock).toHaveBeenLastCalledWith(true);
    await request(a).get(`/api/v1/${path}`).expect(200);
    expect(mock).toHaveBeenLastCalledWith(false);
  });

  it("accepts real booleans from LLM tool calls", async () => {
    const { executeHealthTool } = await import("../services/healthTools.js");
    const c = ctx();
    await executeHealthTool("query_supplements_items", { includeInactive: true }, c);
    expect(c.supplementService.listItems).toHaveBeenLastCalledWith(true);
  });
});
