import type {
  AlertSeverity,
  NotificationSettings,
  NotificationThresholds,
} from "@health-dashboard/shared";

export type ThresholdKey = keyof NotificationThresholds;

export interface ThresholdDefinition {
  key: ThresholdKey;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

export const PUSHABLE_SEVERITIES: {
  value: Exclude<AlertSeverity, "info">;
  label: string;
}[] = [
  { value: "alert", label: "Alerts" },
  { value: "warn", label: "Warnings" },
];

export const NOTIFICATION_KINDS: {
  key: keyof NotificationSettings["kinds"];
  label: string;
  description: string;
}[] = [
  {
    key: "illnessTriad",
    label: "Illness / under-recovery",
    description:
      "Resting HR, breathing rate and skin temperature elevated together for 2+ days.",
  },
  {
    key: "lowSpo2",
    label: "Low blood oxygen",
    description: "Overnight SpO2 average dips below the configured floors.",
  },
  {
    key: "readinessDrop",
    label: "Readiness drop",
    description: "Readiness falls sharply versus your recent trend.",
  },
];

export const NOTIFICATION_THRESHOLDS: ThresholdDefinition[] = [
  {
    key: "illnessSigma",
    label: "Illness sensitivity (σ)",
    hint: "Lower is more sensitive",
    min: 0.5,
    max: 4,
    step: 0.1,
  },
  {
    key: "spo2AlertBelow",
    label: "SpO2 alert below (%)",
    hint: "Red alert floor",
    min: 80,
    max: 100,
    step: 1,
  },
  {
    key: "spo2WarnBelow",
    label: "SpO2 warning below (%)",
    hint: "Heads-up floor",
    min: 80,
    max: 100,
    step: 1,
  },
  {
    key: "readinessDropPoints",
    label: "Readiness drop (points)",
    hint: "Fall versus recent average",
    min: 5,
    max: 60,
    step: 1,
  },
  {
    key: "cooldownDays",
    label: "Cooldown (days)",
    hint: "Do not repeat within",
    min: 0,
    max: 30,
    step: 1,
  },
];

export type NotificationSettingsErrors = Partial<
  Record<ThresholdKey | "appriseUrl", string>
>;

export function notificationSettingsEqual(
  left: NotificationSettings | null | undefined,
  right: NotificationSettings | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  const leftSeverities = new Set(left.pushSeverities);
  const rightSeverities = new Set(right.pushSeverities);

  return (
    left.pushEnabled === right.pushEnabled &&
    leftSeverities.size === rightSeverities.size &&
    [...leftSeverities].every((severity) => rightSeverities.has(severity)) &&
    left.kinds.illnessTriad === right.kinds.illnessTriad &&
    left.kinds.lowSpo2 === right.kinds.lowSpo2 &&
    left.kinds.readinessDrop === right.kinds.readinessDrop &&
    NOTIFICATION_THRESHOLDS.every(
      ({ key }) => left.thresholds[key] === right.thresholds[key],
    ) &&
    left.weeklyReportEnabled === right.weeklyReportEnabled &&
    left.appriseUrl === right.appriseUrl
  );
}

export function validateNotificationSettings(
  settings: NotificationSettings,
): NotificationSettingsErrors {
  const errors: NotificationSettingsErrors = {};

  try {
    const url = new URL(settings.appriseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      errors.appriseUrl = "Use an http or https Apprise URL.";
    }
  } catch {
    errors.appriseUrl = "Enter a complete Apprise URL.";
  }

  for (const threshold of NOTIFICATION_THRESHOLDS) {
    const value = settings.thresholds[threshold.key];
    if (!Number.isFinite(value)) {
      errors[threshold.key] = "Enter a number.";
    } else if (value < threshold.min || value > threshold.max) {
      errors[threshold.key] = `Use ${threshold.min}–${threshold.max}.`;
    }
  }

  if (
    !errors.spo2AlertBelow &&
    !errors.spo2WarnBelow &&
    settings.thresholds.spo2WarnBelow < settings.thresholds.spo2AlertBelow
  ) {
    errors.spo2WarnBelow = "Warning floor must be at or above the alert floor.";
  }

  return errors;
}

export function withThreshold(
  settings: NotificationSettings,
  key: ThresholdKey,
  value: number,
): NotificationSettings {
  return {
    ...settings,
    thresholds: { ...settings.thresholds, [key]: value },
  };
}

export function withKindToggled(
  settings: NotificationSettings,
  key: keyof NotificationSettings["kinds"],
): NotificationSettings {
  return {
    ...settings,
    kinds: { ...settings.kinds, [key]: !settings.kinds[key] },
  };
}

export function withSeverityToggled(
  settings: NotificationSettings,
  severity: Exclude<AlertSeverity, "info">,
): NotificationSettings {
  const included = settings.pushSeverities.includes(severity);
  return {
    ...settings,
    pushSeverities: included
      ? settings.pushSeverities.filter((candidate) => candidate !== severity)
      : [...settings.pushSeverities, severity],
  };
}

export function notificationTestResult(result: {
  delivered: boolean;
  status: number;
}): { ok: boolean; text: string } {
  if (result.delivered) {
    return { ok: true, text: "Delivered — check your device." };
  }
  if (result.status === 204) {
    return {
      ok: false,
      text: "Sent, but Apprise has no targets for this key yet.",
    };
  }
  if (result.status === 0) {
    return { ok: false, text: "Could not reach Apprise." };
  }
  return { ok: false, text: `Apprise returned HTTP ${result.status}.` };
}
