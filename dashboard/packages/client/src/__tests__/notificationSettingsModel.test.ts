import { describe, expect, it } from "vitest";
import type { NotificationSettings } from "@health-dashboard/shared";
import {
  notificationSettingsEqual,
  notificationTestResult,
  validateNotificationSettings,
  withKindToggled,
  withSeverityToggled,
  withThreshold,
} from "../components/notificationSettings/notificationSettingsModel";

const SETTINGS: NotificationSettings = {
  pushEnabled: true,
  pushSeverities: ["alert", "warn"],
  kinds: { illnessTriad: true, lowSpo2: true, readinessDrop: true },
  thresholds: {
    illnessSigma: 1.5,
    spo2AlertBelow: 90,
    spo2WarnBelow: 92,
    readinessDropPoints: 18,
    cooldownDays: 3,
  },
  weeklyReportEnabled: true,
  appriseUrl: "https://apprise.example/notify?tag=health",
};

describe("notification settings model", () => {
  it("compares severity selection as a set rather than array order", () => {
    expect(
      notificationSettingsEqual(SETTINGS, {
        ...SETTINGS,
        pushSeverities: ["warn", "alert"],
      }),
    ).toBe(true);
  });

  it("validates URLs, threshold ranges, and SpO2 floor ordering", () => {
    const errors = validateNotificationSettings({
      ...SETTINGS,
      appriseUrl: "ftp://example.com/value",
      thresholds: {
        ...SETTINGS.thresholds,
        illnessSigma: 7,
        spo2AlertBelow: 94,
        spo2WarnBelow: 91,
      },
    });

    expect(errors.appriseUrl).toMatch(/http or https/i);
    expect(errors.illnessSigma).toBe("Use 0.5–4.");
    expect(errors.spo2WarnBelow).toMatch(/at or above/i);
  });

  it("applies immutable focused updates", () => {
    const threshold = withThreshold(SETTINGS, "cooldownDays", 5);
    const kind = withKindToggled(SETTINGS, "lowSpo2");
    const severity = withSeverityToggled(SETTINGS, "warn");

    expect(threshold.thresholds.cooldownDays).toBe(5);
    expect(kind.kinds.lowSpo2).toBe(false);
    expect(severity.pushSeverities).toEqual(["alert"]);
    expect(SETTINGS.thresholds.cooldownDays).toBe(3);
  });

  it("maps delivery outcomes to user-facing status", () => {
    expect(notificationTestResult({ delivered: true, status: 200 }).ok).toBe(true);
    expect(notificationTestResult({ delivered: false, status: 204 }).text).toMatch(
      /no targets/i,
    );
    expect(notificationTestResult({ delivered: false, status: 503 }).text).toContain(
      "503",
    );
  });
});
