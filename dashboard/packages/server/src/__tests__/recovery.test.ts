import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type {
  CreateRecoveryActivityBody,
  RecoveryActivity,
  RecoverySession,
  RecoverySessionProposal,
  UpdateRecoveryActivityBody,
  UpdateRecoverySessionBody,
} from "@health-dashboard/shared";
import { RecoveryService } from "../services/recoveryService.js";
import { RecoveryController } from "../controllers/recoveryController.js";
import { createRecoveryRoutes } from "../routes/recovery.js";
import { errorMapper } from "../middleware/errorMapper.js";

class FakeRecoveryRepo {
  activities = new Map<number, RecoveryActivity>();
  sessions = new Map<number, RecoverySession>();
  nextActivity = 1;
  nextSession = 1;
  lastTimezone = "";

  reset() {
    this.activities.clear();
    this.sessions.clear();
    this.nextActivity = 1;
    this.nextSession = 1;
    this.seed("hot_blanket", "Hot blanket", "heat_therapy");
    this.seed("massage", "Massage", "massage");
  }
  private seed(code: string, name: string, category: RecoveryActivity["category"]) {
    const now = new Date().toISOString();
    this.activities.set(this.nextActivity, {
      id: this.nextActivity++, code, name, category, defaultDurationMinutes: null,
      notes: null, isActive: true, createdAt: now, updatedAt: now,
    });
  }
  async listActivities(includeInactive = false) {
    return [...this.activities.values()].filter((a) => includeInactive || a.isActive);
  }
  async getActivity(id: number) { return this.activities.get(id) ?? null; }
  async createActivity(body: CreateRecoveryActivityBody) {
    const now = new Date().toISOString();
    const value: RecoveryActivity = {
      id: this.nextActivity++, code: body.code, name: body.name, category: body.category,
      defaultDurationMinutes: body.defaultDurationMinutes ?? null, notes: body.notes ?? null,
      isActive: true, createdAt: now, updatedAt: now,
    };
    this.activities.set(value.id, value);
    return value;
  }
  async updateActivity(id: number, body: UpdateRecoveryActivityBody) {
    const current = this.activities.get(id);
    if (!current) return null;
    const value = { ...current, ...body, updatedAt: new Date().toISOString() };
    this.activities.set(id, value);
    return value;
  }
  archiveActivity(id: number) { return this.updateActivity(id, { isActive: false }); }
  async listSessions(_start?: string, _end?: string, activityId?: number, timezone = "UTC") {
    this.lastTimezone = timezone;
    return [...this.sessions.values()].filter((s) => activityId == null || s.activityId === activityId);
  }
  async getSession(id: number) { return this.sessions.get(id) ?? null; }
  async createSession(body: RecoverySessionProposal, source: RecoverySession["source"]) {
    const now = new Date().toISOString();
    const value: RecoverySession = {
      id: this.nextSession++, ...body, source, createdAt: now, updatedAt: now,
    };
    this.sessions.set(value.id, value);
    return value;
  }
  async updateSession(id: number, body: UpdateRecoverySessionBody) {
    const current = this.sessions.get(id);
    if (!current) return null;
    const activity = body.activityId == null ? this.activities.get(current.activityId)! : this.activities.get(body.activityId)!;
    const value: RecoverySession = {
      ...current, ...body, activityId: activity.id, activityCode: activity.code,
      activityName: activity.name, activityCategory: activity.category,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(id, value);
    return value;
  }
  async deleteSession(id: number) { return this.sessions.delete(id); }
}

const repo = new FakeRecoveryRepo();
const service = new RecoveryService(repo as never, "America/New_York");
const effects = {
  get: vi.fn().mockResolvedValue({
    methodVersion: "recovery-effects-v1-matched-sleep-periods",
    coverage: [],
    effects: [],
  }),
};
const eventStudies = {
  get: vi.fn().mockResolvedValue({
    methodVersion: "recovery-event-study-v1-descriptive-windows",
    activityId: 2,
    outcome: "hrv",
    trajectories: [],
  }),
};
const controller = new RecoveryController(
  service,
  undefined,
  effects as never,
  "America/New_York",
  eventStudies as never,
);
const app = express();
app.use(express.json());
app.use("/api/recovery", createRecoveryRoutes(controller));
app.use(errorMapper);

beforeEach(() => {
  repo.reset();
  effects.get.mockClear();
  eventStudies.get.mockClear();
});

describe("Recovery API", () => {
  it("lists the seeded recovery activities", async () => {
    const response = await request(app).get("/api/recovery/activities").expect(200);
    expect(response.body.map((a: RecoveryActivity) => a.code)).toEqual(["hot_blanket", "massage"]);
  });

  it("logs a historical hot blanket session with typed details and manual provenance", async () => {
    const response = await request(app).post("/api/recovery/sessions").send({
      activityId: 1,
      startedAt: "2026-08-19T01:30:00-04:00",
      durationMinutes: 45,
      intensity: 4,
      temperatureF: 130,
    }).expect(201);
    expect(response.body).toMatchObject({
      activityCode: "hot_blanket", durationMinutes: 45, intensity: 4,
      temperatureF: 130, source: "manual", startedAt: "2026-08-19T05:30:00.000Z",
    });
  });

  it("requires duration when the activity has no default", async () => {
    const response = await request(app).post("/api/recovery/sessions")
      .send({ activityId: 1 }).expect(400);
    expect(response.body.error).toMatch(/duration is required/i);
  });

  it("rejects details that do not match the activity category", async () => {
    const response = await request(app).post("/api/recovery/sessions").send({
      activityId: 2, durationMinutes: 60, temperatureF: 120,
    }).expect(400);
    expect(response.body.error).toMatch(/heat therapy/i);
  });

  it("edits and deletes one session without creating another", async () => {
    const created = await request(app).post("/api/recovery/sessions")
      .send({ activityId: 2, durationMinutes: 60, massageType: "Swedish" });
    const updated = await request(app).patch(`/api/recovery/sessions/${created.body.id}`)
      .send({ durationMinutes: 75, massageType: "Deep tissue" }).expect(200);
    expect(updated.body).toMatchObject({ durationMinutes: 75, massageType: "Deep tissue" });
    expect(repo.sessions.size).toBe(1);
    await request(app).delete(`/api/recovery/sessions/${created.body.id}`).expect(204);
    expect(repo.sessions.size).toBe(0);
  });

  it("uses the configured timezone for local date filters", async () => {
    await request(app).get("/api/recovery/sessions?start=2026-08-01&end=2026-08-20").expect(200);
    expect(repo.lastTimezone).toBe("America/New_York");
  });

  it("archives an activity without deleting old sessions", async () => {
    await request(app).post("/api/recovery/sessions")
      .send({ activityId: 1, durationMinutes: 30 });
    await request(app).delete("/api/recovery/activities/1").expect(204);
    expect(repo.sessions.size).toBe(1);
    const all = await request(app).get("/api/recovery/activities?includeInactive=true");
    expect(all.body.find((a: RecoveryActivity) => a.id === 1).isActive).toBe(false);
  });

  it("exposes the matched recovery effects report", async () => {
    const response = await request(app).get("/api/recovery/effects").expect(200);
    expect(response.body.methodVersion).toBe("recovery-effects-v1-matched-sleep-periods");
    expect(effects.get).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it("validates and exposes a focused recovery event study", async () => {
    const response = await request(app)
      .get("/api/recovery/event-study?activityId=2&outcome=hrv")
      .expect(200);
    expect(response.body).toMatchObject({ activityId: 2, outcome: "hrv" });
    expect(eventStudies.get).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      2,
      "hrv",
    );
    await request(app).get("/api/recovery/event-study?activityId=2&outcome=prediction").expect(400);
    await request(app).get("/api/recovery/event-study?outcome=hrv").expect(400);
  });
});
