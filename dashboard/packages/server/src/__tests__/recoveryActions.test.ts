import { beforeEach, describe, expect, it } from "vitest";
import type {
  RecoveryActivity,
  RecoveryPendingAction,
  RecoverySession,
  RecoverySessionProposal,
} from "@health-dashboard/shared";
import { RecoveryService } from "../services/recoveryService.js";
import { RecoveryActionService } from "../services/recoveryActionService.js";

class FakeRepo {
  actions = new Map<string, RecoveryPendingAction>();
  sessions = new Map<number, RecoverySession>();
  sequence = 1;
  activities: RecoveryActivity[] = [
    { id: 1, code: "hot_blanket", name: "Hot blanket", category: "heat_therapy", defaultDurationMinutes: null, notes: null, isActive: true, createdAt: "x", updatedAt: "x" },
    { id: 2, code: "massage", name: "Massage", category: "massage", defaultDurationMinutes: 60, notes: null, isActive: true, createdAt: "x", updatedAt: "x" },
  ];
  reset() { this.actions.clear(); this.sessions.clear(); this.sequence = 1; }
  async findActivity(term: string) { return this.activities.find((a) => a.code === term || a.name.toLowerCase() === term.toLowerCase()) ?? null; }
  async getActivity(id: number) { return this.activities.find((a) => a.id === id) ?? null; }
  async createPendingAction(input: { conversationId: string; proposal: RecoverySessionProposal; expiresAt: string }) {
    const now = new Date().toISOString();
    const action: RecoveryPendingAction = { id: `action-${this.sequence++}`, conversationId: input.conversationId, proposal: input.proposal, status: "pending", sessionId: null, expiresAt: input.expiresAt, createdAt: now, updatedAt: now };
    this.actions.set(action.id, action); return action;
  }
  async listPendingActions(conversationId: string) { return [...this.actions.values()].filter((a) => a.conversationId === conversationId); }
  async getPendingAction(id: string) { return this.actions.get(id) ?? null; }
  async cancelPendingAction(id: string) { const action = this.actions.get(id); if (!action) return null; if (action.status === "pending") { const changed = { ...action, status: "cancelled" as const }; this.actions.set(id, changed); return changed; } return action; }
  async confirmPendingAction(id: string, proposal: RecoverySessionProposal) {
    const action = this.actions.get(id); if (!action) return null;
    if (action.status === "confirmed") return { action, session: this.sessions.get(action.sessionId!) ?? null };
    if (action.status !== "pending") return { action, session: null };
    const now = new Date().toISOString();
    const session: RecoverySession = { id: this.sessions.size + 1, ...proposal, source: "ai_chat", createdAt: now, updatedAt: now };
    this.sessions.set(session.id, session);
    const confirmed = { ...action, proposal, status: "confirmed" as const, sessionId: session.id };
    this.actions.set(id, confirmed);
    return { action: confirmed, session };
  }
}

const repo = new FakeRepo();
const recovery = new RecoveryService(repo as never, "America/New_York");
const actions = new RecoveryActionService(repo as never, recovery, "America/New_York");

beforeEach(() => repo.reset());

describe("RecoveryActionService", () => {
  it("prepares a normalized action without creating a session", async () => {
    const action = await actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "hot_blanket", startedLocal: "2026-08-20T21:30", durationMinutes: 45, temperatureF: 130,
    });
    expect(action.proposal).toMatchObject({ startedAt: "2026-08-21T01:30:00.000Z", durationMinutes: 45, temperatureF: 130 });
    expect(repo.sessions.size).toBe(0);
  });

  it("uses an activity default but refuses to invent a missing duration", async () => {
    const massage = await actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "Massage", startedLocal: "2026-08-20T15:00",
    });
    expect(massage.proposal.durationMinutes).toBe(60);
    await expect(actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "hot_blanket", startedLocal: "2026-08-20T21:30",
    })).rejects.toThrow(/duration is required/i);
  });

  it("confirms once and returns the same session on retry", async () => {
    const action = await actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "massage", startedLocal: "2026-08-20T15:00", durationMinutes: 75,
    });
    const first = await actions.confirm(action.id, { massageType: "Deep tissue" });
    const retry = await actions.confirm(action.id, { massageType: "Deep tissue" });
    expect(first.session.id).toBe(retry.session.id);
    expect(first.session.source).toBe("ai_chat");
    expect(repo.sessions.size).toBe(1);
  });

  it("does not confirm cancelled or expired actions", async () => {
    const cancelled = await actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "massage", startedLocal: "2026-08-20T15:00", durationMinutes: 60,
    });
    await actions.cancel(cancelled.id);
    await expect(actions.confirm(cancelled.id, {})).rejects.toThrow(/cancelled/i);

    const expired = await actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "massage", startedLocal: "2026-08-20T15:00", durationMinutes: 60,
    });
    repo.actions.set(expired.id, { ...expired, expiresAt: "2020-01-01T00:00:00Z" });
    await expect(actions.confirm(expired.id, {})).rejects.toThrow(/expired/i);
    expect(repo.sessions.size).toBe(0);
  });

  it("rejects nonexistent and ambiguous daylight-saving wall times", async () => {
    await expect(actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "massage", startedLocal: "2026-03-08T02:30", durationMinutes: 60,
    })).rejects.toThrow(/does not exist/i);
    await expect(actions.prepare("00000000-0000-0000-0000-000000000001", {
      activity: "massage", startedLocal: "2026-11-01T01:30", durationMinutes: 60,
    })).rejects.toThrow(/occurs twice/i);
  });
});
