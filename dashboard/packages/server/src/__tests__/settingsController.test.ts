import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { SettingsController } from "../controllers/settingsController.js";
import { createSettingsRoutes } from "../routes/settings.js";
import { SettingService, DEFAULT_NOTIFICATION_SETTINGS } from "../services/settingService.js";
import { SettingRepository } from "../repositories/settingRepo.js";
import { errorMapper } from "../middleware/errorMapper.js";

/**
 * End-to-end-ish: real SettingService over a fake in-memory repo, mounted
 * behind the real routes + errorMapper, so the status-code contract is
 * pinned (200 happy, 400 on bad body, test-push status passthrough).
 */

function fakeRepo() {
  const store = new Map<string, unknown>();
  return {
    store,
    ensureTables: async () => {},
    get: async (k: string) => (store.has(k) ? store.get(k) : null),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
    },
  } as unknown as SettingRepository;
}

function makeApp() {
  const svc = new SettingService(fakeRepo());
  const controller = new SettingsController(svc);
  const app = express();
  app.use(express.json());
  app.use("/api/settings", createSettingsRoutes(controller));
  app.use("/api", errorMapper);
  return app;
}

const validBody = () =>
  JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS));

describe("settings routes", () => {
  let app: express.Express;
  beforeEach(() => {
    app = makeApp();
  });

  it("GET /notifications returns complete defaults on a fresh install", async () => {
    const res = await request(app).get("/api/settings/notifications");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
  });

  it("PUT /notifications persists and round-trips", async () => {
    const body = { ...validBody(), pushEnabled: false };
    const put = await request(app).put("/api/settings/notifications").send(body);
    expect(put.status).toBe(200);
    expect(put.body.pushEnabled).toBe(false);

    const get = await request(app).get("/api/settings/notifications");
    expect(get.body.pushEnabled).toBe(false);
  });

  it("PUT /notifications clamps out-of-range thresholds", async () => {
    const body = validBody();
    body.thresholds.cooldownDays = 999;
    const res = await request(app).put("/api/settings/notifications").send(body);
    expect(res.status).toBe(200);
    expect(res.body.thresholds.cooldownDays).toBe(30);
  });

  it("PUT /notifications rejects a malformed body with 400", async () => {
    const res = await request(app)
      .put("/api/settings/notifications")
      .send({ pushEnabled: "definitely" });
    expect(res.status).toBe(400);
  });
});
