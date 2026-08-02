import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createVersionRoutes } from "../routes/version.js";
import { SERVER_BUILD } from "../buildInfo.js";

function app() {
  const a = express();
  a.use("/api/version", createVersionRoutes());
  return a;
}

describe("GET /api/version", () => {
  it("reports the build this process is running", async () => {
    const res = await request(app()).get("/api/version").expect(200);
    expect(res.body).toEqual(SERVER_BUILD);
    expect(typeof res.body.commit).toBe("string");
    expect(res.body.shortCommit.length).toBeLessThanOrEqual(7);
  });

  it("refuses to be cached", async () => {
    // The service worker caches /api/* NetworkFirst for 5 minutes. A
    // cached answer here would report a version that is no longer
    // running — the exact failure this endpoint exists to rule out.
    const res = await request(app()).get("/api/version").expect(200);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("always answers, even where git is unavailable", async () => {
    // A container built from a tarball has no .git and may pass no env.
    // "unknown" is a usable answer; a 500 is not.
    const res = await request(app()).get("/api/version").expect(200);
    expect(res.body.commit).toBeTruthy();
    expect(res.body.version).toBeTruthy();
  });
});
