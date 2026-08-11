import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AlertSeverity,
  NotificationSettings,
} from "@health-dashboard/shared";
import {
  useNotificationSettings,
  useTestNotification,
  useUpdateNotificationSettings,
} from "../../api/queries";
import {
  notificationSettingsEqual,
  notificationTestResult,
  validateNotificationSettings,
  withKindToggled,
  withSeverityToggled,
  withThreshold,
  type ThresholdKey,
} from "./notificationSettingsModel";

export function useNotificationSettingsForm() {
  const query = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const test = useTestNotification();
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const canonicalRef = useRef<NotificationSettings | null>(null);

  useEffect(() => {
    if (!query.data) return;
    const previousCanonical = canonicalRef.current;
    canonicalRef.current = query.data;
    setDraft((current) => {
      if (
        !current ||
        !previousCanonical ||
        notificationSettingsEqual(current, previousCanonical)
      ) {
        return query.data ?? current;
      }
      return current;
    });
  }, [query.data]);

  const errors = useMemo(
    () => (draft ? validateNotificationSettings(draft) : {}),
    [draft],
  );
  const dirty = Boolean(
    draft && query.data && !notificationSettingsEqual(draft, query.data),
  );
  const valid = Object.keys(errors).length === 0;

  const changeDraft = useCallback(
    (change: (current: NotificationSettings) => NotificationSettings) => {
      update.reset();
      test.reset();
      setDraft((current) => (current ? change(current) : current));
    },
    [test, update],
  );

  const patch = useCallback(
    (value: Partial<NotificationSettings>) =>
      changeDraft((current) => ({ ...current, ...value })),
    [changeDraft],
  );

  const save = useCallback(async () => {
    if (!draft || !dirty || !valid || update.isPending) return;
    try {
      const saved = await update.mutateAsync(draft);
      canonicalRef.current = saved;
      setDraft(saved);
    } catch {
      // Mutation state exposes the actionable error in the card.
    }
  }, [dirty, draft, update, valid]);

  const sendTest = useCallback(async () => {
    if (dirty || test.isPending) return;
    try {
      await test.mutateAsync();
    } catch {
      // Mutation state exposes the actionable error beside the control.
    }
  }, [dirty, test]);

  return {
    draft,
    errors,
    dirty,
    valid,
    isLoading: query.isLoading,
    loadError: query.error?.message ?? null,
    saveError: update.error?.message ?? null,
    testError: test.error?.message ?? null,
    isSaving: update.isPending,
    isTesting: test.isPending,
    saved: update.isSuccess && !dirty,
    testResult: test.data ? notificationTestResult(test.data) : null,
    retryLoad: () => void query.refetch(),
    discard: () => {
      update.reset();
      test.reset();
      if (query.data) setDraft(query.data);
    },
    setPushEnabled: (enabled: boolean) => patch({ pushEnabled: enabled }),
    setAppriseUrl: (appriseUrl: string) => patch({ appriseUrl }),
    setWeeklyReportEnabled: (weeklyReportEnabled: boolean) =>
      patch({ weeklyReportEnabled }),
    toggleSeverity: (severity: Exclude<AlertSeverity, "info">) =>
      changeDraft((current) => withSeverityToggled(current, severity)),
    toggleKind: (key: keyof NotificationSettings["kinds"]) =>
      changeDraft((current) => withKindToggled(current, key)),
    setThreshold: (key: ThresholdKey, value: number) =>
      changeDraft((current) => withThreshold(current, key, value)),
    save: () => void save(),
    sendTest: () => void sendTest(),
  };
}
