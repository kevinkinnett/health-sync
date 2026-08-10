import { describe, it, expect, vi, afterEach } from "vitest";
import { ZodError } from "zod";
import {
  SettingService,
  DEFAULT_NOTIFICATION_SETTINGS,
  mergeNotificationDefaults,
} from "../services/settingService.js";
import type { SettingRepository } from "../repositories/settingRepo.js";

/**
 * The settings service is the safety layer between an untrusted UI/legacy
 * stored blob and the detectors. These tests pin: defaults on a fresh
 * install, forward-merge of partial stored shapes, threshold clamping,
 * warn≥alert ordering, and that a bad payload is rejected (not persisted).
 */

function fakeRepo(initial: unknown = null): SettingRepository & {
  store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>();
  if (initial != null) store.set("notifications", initial);
  return {
    store,
    get: async (key: string) => (store.has(key) ? store.get(key) : null),
    set: async (key: string, value: unknown) => {
      store.set(key, value);
    },
  } as unknown as SettingRepository & { store: Map<string, unknown> };
}

const valid = () =>
  JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)) as typeof DEFAULT_NOTIFICATION_SETTINGS;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingService — notification settings", () => {
  it("returns defaults on a fresh install", async () => {
    const svc = new SettingService(fakeRepo());
    expect(await svc.getNotificationSettings()).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS,
    );
  });

  it("merges a partial/legacy stored shape forward onto defaults", async () => {
    // Only a couple of fields stored; everything else should fill in.
    const svc = new SettingService(
      fakeRepo({ pushEnabled: false, thresholds: { illnessSigma: 2 } }),
    );
    const s = await svc.getNotificationSettings();
    expect(s.pushEnabled).toBe(false);
    expect(s.thresholds.illnessSigma).toBe(2);
    // Untouched nested + top-level fields come from defaults.
    expect(s.thresholds.spo2AlertBelow).toBe(90);
    expect(s.kinds).toEqual(DEFAULT_NOTIFICATION_SETTINGS.kinds);
    expect(s.pushSeverities).toEqual(["alert", "warn"]);
  });

  it("degrades garbage stored values to defaults without throwing", () => {
    expect(mergeNotificationDefaults("not an object")).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS,
    );
    expect(mergeNotificationDefaults(null)).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS,
    );
    expect(
      mergeNotificationDefaults({ pushSeverities: ["bogus", "alert"] })
        .pushSeverities,
    ).toEqual(["alert"]);
  });

  it("clamps out-of-range thresholds on update", async () => {
    const repo = fakeRepo();
    const svc = new SettingService(repo);
    const out = await svc.updateNotificationSettings({
      ...valid(),
      thresholds: {
        illnessSigma: 99, // → 4
        spo2AlertBelow: 50, // → 80
        spo2WarnBelow: 50, // → max(alert, clamp) = 80
        readinessDropPoints: 1, // → 5
        cooldownDays: 999, // → 30
      },
    });
    expect(out.thresholds.illnessSigma).toBe(4);
    expect(out.thresholds.spo2AlertBelow).toBe(80);
    expect(out.thresholds.readinessDropPoints).toBe(5);
    expect(out.thresholds.cooldownDays).toBe(30);
    // Persisted (clamped) value is what's stored.
    expect((repo.store.get("notifications") as { thresholds: { cooldownDays: number } }).thresholds.cooldownDays).toBe(30);
  });

  it("keeps the warn floor at or above the alert floor", async () => {
    const svc = new SettingService(fakeRepo());
    const out = await svc.updateNotificationSettings({
      ...valid(),
      thresholds: { ...valid().thresholds, spo2AlertBelow: 92, spo2WarnBelow: 88 },
    });
    expect(out.thresholds.spo2WarnBelow).toBeGreaterThanOrEqual(
      out.thresholds.spo2AlertBelow,
    );
  });

  it("rejects a malformed payload and does not persist", async () => {
    const repo = fakeRepo();
    const svc = new SettingService(repo);
    await expect(
      svc.updateNotificationSettings({ pushEnabled: "yes" }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(repo.store.has("notifications")).toBe(false);
  });

  it("rejects a non-URL apprise endpoint", async () => {
    const svc = new SettingService(fakeRepo());
    await expect(
      svc.updateNotificationSettings({ ...valid(), appriseUrl: "not-a-url" }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("maps Apprise status onto the test-push result", async () => {
    const svc = new SettingService(fakeRepo());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 200, ok: true }) as Response),
    );
    expect(await svc.sendTestNotification()).toEqual({
      delivered: true,
      status: 200,
    });

    // 204 = Apprise found no targets for the key — not delivered.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 204, ok: true }) as Response),
    );
    expect(await svc.sendTestNotification()).toEqual({
      delivered: false,
      status: 204,
    });
  });

  it("treats a network failure as not-delivered (status 0)", async () => {
    const svc = new SettingService(fakeRepo());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await svc.sendTestNotification()).toEqual({
      delivered: false,
      status: 0,
    });
  });
});

describe("SettingService — LLM models", () => {
  it("returns the env/default models on a fresh install", async () => {
    const svc = new SettingService(fakeRepo(), {
      dossier: "opus",
      insights: "sonnet",
      chat: "haiku",
    });
    expect(await svc.getLlmModelSettings()).toEqual({
      dossier: "opus",
      insights: "sonnet",
      chat: "haiku",
    });
  });

  it("defaults every task to sonnet when no defaults are supplied", async () => {
    const svc = new SettingService(fakeRepo());
    expect(await svc.getLlmModelSettings()).toEqual({
      dossier: "sonnet",
      insights: "sonnet",
      chat: "sonnet",
    });
  });

  it("a stored selection overrides the default per task", async () => {
    const repo = fakeRepo();
    repo.store.set("llm_models", {
      dossier: "opus",
      insights: "claude-sonnet-4-6",
      chat: "haiku",
    });
    const svc = new SettingService(repo, {
      dossier: "sonnet",
      insights: "sonnet",
      chat: "sonnet",
    });
    expect(await svc.getLlmModelSettings()).toEqual({
      dossier: "opus",
      insights: "claude-sonnet-4-6",
      chat: "haiku",
    });
  });

  it("ignores an invalid stored value and falls back to the default", async () => {
    const repo = fakeRepo();
    // A legacy qwen value that snuck in before validation existed.
    repo.store.set("llm_models", { dossier: "qwen3-max", insights: "sonnet", chat: "haiku" });
    const svc = new SettingService(repo, {
      dossier: "opus",
      insights: "opus",
      chat: "opus",
    });
    const m = await svc.getLlmModelSettings();
    expect(m.dossier).toBe("opus"); // qwen ignored → default
    expect(m.insights).toBe("sonnet");
    expect(m.chat).toBe("haiku");
  });

  it("updateLlmModelSettings persists a valid Claude selection", async () => {
    const repo = fakeRepo();
    const svc = new SettingService(repo);
    const saved = await svc.updateLlmModelSettings({
      dossier: "opus",
      insights: "sonnet",
      chat: "haiku",
    });
    expect(saved).toEqual({ dossier: "opus", insights: "sonnet", chat: "haiku" });
    expect(repo.store.get("llm_models")).toEqual({
      dossier: "opus",
      insights: "sonnet",
      chat: "haiku",
    });
  });

  it("rejects a non-Claude model (qwen) and does not persist", async () => {
    const repo = fakeRepo();
    const svc = new SettingService(repo);
    await expect(
      svc.updateLlmModelSettings({
        dossier: "qwen3-max-2026-01-23",
        insights: "sonnet",
        chat: "haiku",
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(repo.store.has("llm_models")).toBe(false);
  });
});
