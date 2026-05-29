import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { errorMapper } from "../middleware/errorMapper.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import {
  BadRequestError,
  NotFoundError,
  ValidationError,
} from "../services/errors.js";
import { AnalyticsNotFoundError } from "../services/analyticsService.js";
import {
  DossierFetchError,
  DossierNotFoundError,
} from "../services/dossierService.js";

/**
 * Why this exists: every controller used to do its own
 * `instanceof NotFoundError ? 404 : 500` translation inline. The
 * middleware refactor (Phase 3.1) replaced ~250 lines of duplicated
 * try/catch with one mapper. These tests pin the mapping so future
 * additions don't accidentally drop a known error type back to 500.
 */
function buildTestApp(thrower: () => unknown) {
  const app = express();
  app.get(
    "/boom",
    asyncHandler(async (_req, res) => {
      thrower();
      res.json({ ok: true });
    }),
  );
  app.use(errorMapper);
  return app;
}

describe("errorMapper", () => {
  it("maps ZodError to 400 with issues", async () => {
    const app = buildTestApp(() => {
      z.object({ name: z.string() }).parse({});
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid request/i);
    expect(Array.isArray(res.body.issues)).toBe(true);
  });

  it("maps BadRequestError to 400 with the thrown message", async () => {
    const app = buildTestApp(() => {
      throw new BadRequestError("itemId required");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("itemId required");
  });

  it("maps ValidationError to 400 with the thrown message", async () => {
    const app = buildTestApp(() => {
      throw new ValidationError("amount must be positive");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("amount must be positive");
  });

  it("maps NotFoundError to 404", async () => {
    const app = buildTestApp(() => {
      throw new NotFoundError("item 42 not found");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("item 42 not found");
  });

  it("maps AnalyticsNotFoundError to 404", async () => {
    const app = buildTestApp(() => {
      throw new AnalyticsNotFoundError("supplement 1 has no intakes");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("supplement 1 has no intakes");
  });

  it("maps DossierNotFoundError to 404", async () => {
    const app = buildTestApp(() => {
      throw new DossierNotFoundError("no dossier for supplement 7");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(404);
  });

  it("maps DossierFetchError to 502", async () => {
    const app = buildTestApp(() => {
      throw new DossierFetchError("LLM proxy timeout");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/LLM proxy timeout/);
  });

  it("maps unrecognised errors to 500 with a generic body", async () => {
    const app = buildTestApp(() => {
      throw new Error("some uncategorised failure");
    });
    const res = await request(app).get("/boom");
    expect(res.status).toBe(500);
    // The thrown message stays out of the body — internals don't leak
    // to clients. The error is still logged server-side.
    expect(res.body.error).toBe("Internal server error");
  });
});
