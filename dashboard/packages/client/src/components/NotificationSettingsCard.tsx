import { useEffect, useState } from "react";
import type { AlertSeverity, NotificationSettings } from "@health-dashboard/shared";
import {
  useNotificationSettings,
  useTestNotification,
  useUpdateNotificationSettings,
} from "../api/queries";

/**
 * Settings → Notifications. The first server-backed settings surface:
 * everything here persists to `universe.app_setting` and drives the
 * anomaly detectors (thresholds + per-kind toggles) and the scheduled
 * push job (delivery policy). The in-app bell is unaffected by the push
 * switches — it always shows what was detected.
 *
 * Form holds a local `draft`; Save is enabled only when it diverges from
 * the persisted value, and the server returns the clamped settings so the
 * UI reflects any normalisation it applied.
 */

const PUSHABLE: { value: Exclude<AlertSeverity, "info">; label: string }[] = [
  { value: "alert", label: "Alerts" },
  { value: "warn", label: "Warnings" },
];

const KINDS: {
  key: keyof NotificationSettings["kinds"];
  label: string;
  desc: string;
}[] = [
  {
    key: "illnessTriad",
    label: "Illness / under-recovery",
    desc: "Resting HR, breathing rate and skin temp elevated together for 2+ days.",
  },
  {
    key: "lowSpo2",
    label: "Low blood oxygen",
    desc: "Overnight SpO2 average dips below the floors set below.",
  },
  {
    key: "readinessDrop",
    label: "Readiness drop",
    desc: "Readiness falls sharply versus your recent trend.",
  },
];

const THRESHOLDS: {
  key: keyof NotificationSettings["thresholds"];
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "illnessSigma", label: "Illness sensitivity (σ)", hint: "Lower = more sensitive", min: 0.5, max: 4, step: 0.1 },
  { key: "spo2AlertBelow", label: "SpO2 alert below (%)", hint: "Red alert floor", min: 80, max: 100, step: 1 },
  { key: "spo2WarnBelow", label: "SpO2 warn below (%)", hint: "Heads-up floor", min: 80, max: 100, step: 1 },
  { key: "readinessDropPoints", label: "Readiness drop (pts)", hint: "Fall vs recent average", min: 5, max: 60, step: 1 },
  { key: "cooldownDays", label: "Cooldown (days)", hint: "Don't re-fire within", min: 0, max: 30, step: 1 },
];

function Toggle({
  checked,
  onChange,
  disabled,
  label,
  testid,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testid}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-outline-variant/40"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function testResultText(r: { delivered: boolean; status: number }): {
  ok: boolean;
  text: string;
} {
  if (r.delivered) return { ok: true, text: "Delivered — check your device." };
  if (r.status === 204)
    return { ok: false, text: "Sent, but Apprise has no targets for this key yet." };
  if (r.status === 0) return { ok: false, text: "Couldn't reach Apprise." };
  return { ok: false, text: `Apprise returned HTTP ${r.status}.` };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-container rounded-xl p-6 border border-outline-variant/10">
      <header className="mb-5">
        <h3 className="font-headline text-xl font-bold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">notifications_active</span>
          Notifications
        </h3>
        <p className="text-outline text-sm">
          Tune what gets detected and what reaches your phone. The in-app
          bell always shows everything detected.
        </p>
      </header>
      {children}
    </div>
  );
}

export function NotificationSettingsCard() {
  const { data, isLoading, isError, refetch } = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const test = useTestNotification();
  const [draft, setDraft] = useState<NotificationSettings | null>(null);

  // Resync the draft whenever the canonical value changes (initial load
  // and after a save, which seeds the cache with the clamped result).
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  if (isLoading || !draft) {
    return (
      <Card>
        <div className="h-40 flex items-center justify-center text-outline text-sm">
          Loading settings…
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-sm text-error mb-3">Couldn't load notification settings.</p>
          <button
            onClick={() => refetch()}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data);

  const patch = (p: Partial<NotificationSettings>) => setDraft({ ...draft, ...p });
  const setThreshold = (
    k: keyof NotificationSettings["thresholds"],
    v: number,
  ) => patch({ thresholds: { ...draft.thresholds, [k]: v } });
  const toggleKind = (k: keyof NotificationSettings["kinds"]) =>
    patch({ kinds: { ...draft.kinds, [k]: !draft.kinds[k] } });
  const toggleSeverity = (s: AlertSeverity) =>
    patch({
      pushSeverities: draft.pushSeverities.includes(s)
        ? draft.pushSeverities.filter((x) => x !== s)
        : [...draft.pushSeverities, s],
    });

  const result = test.data ? testResultText(test.data) : null;

  return (
    <Card>
      <div className="space-y-6">
        {/* Push delivery */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-on-surface">Push to my phone</div>
              <div className="text-xs text-outline">
                Forward new alerts to Apprise on the schedule.
              </div>
            </div>
            <Toggle
              testid="notif-push-toggle"
              label="Enable push notifications"
              checked={draft.pushEnabled}
              onChange={(v) => patch({ pushEnabled: v })}
            />
          </div>

          <div className={draft.pushEnabled ? "" : "opacity-40 pointer-events-none"}>
            <div className="text-xs font-bold text-outline uppercase tracking-tighter mb-2">
              Severities to push
            </div>
            <div className="flex gap-2">
              {PUSHABLE.map((s) => {
                const on = draft.pushSeverities.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    data-testid={`notif-sev-${s.value}`}
                    aria-pressed={on}
                    onClick={() => toggleSeverity(s.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                      on
                        ? "bg-primary/10 border-primary text-on-surface"
                        : "bg-surface-container-low border-outline-variant/10 text-outline hover:text-on-surface"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="apprise-url"
              className="text-xs font-bold text-outline uppercase tracking-tighter mb-2 block"
            >
              Apprise endpoint
            </label>
            <div className="flex gap-2">
              <input
                id="apprise-url"
                type="text"
                value={draft.appriseUrl}
                onChange={(e) => patch({ appriseUrl: e.target.value })}
                spellCheck={false}
                className="flex-1 bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-sm font-mono text-on-surface-variant focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                data-testid="notif-test"
                onClick={() => test.mutate()}
                disabled={test.isPending}
                className="px-3 py-2 rounded-lg text-sm font-semibold bg-surface-container-high border border-outline-variant/15 text-on-surface hover:bg-surface-container-highest disabled:opacity-50 whitespace-nowrap"
              >
                {test.isPending ? "Sending…" : "Send test"}
              </button>
            </div>
            {result && (
              <p
                data-testid="notif-test-result"
                className={`text-xs mt-2 ${result.ok ? "text-secondary" : "text-tertiary"}`}
              >
                {result.text}
              </p>
            )}
            <p className="text-[11px] text-outline mt-1">
              The notify URL only — your delivery token stays in Apprise.
            </p>
          </div>
        </section>

        <hr className="border-outline-variant/10" />

        {/* What to detect */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-outline uppercase tracking-tighter">
            What to detect
          </div>
          {KINDS.map((k) => (
            <div key={k.key} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-on-surface">{k.label}</div>
                <div className="text-xs text-outline">{k.desc}</div>
              </div>
              <Toggle
                testid={`notif-kind-${k.key}`}
                label={`Detect ${k.label}`}
                checked={draft.kinds[k.key]}
                onChange={() => toggleKind(k.key)}
              />
            </div>
          ))}
        </section>

        <hr className="border-outline-variant/10" />

        {/* Sensitivity */}
        <section className="space-y-3">
          <div className="text-xs font-bold text-outline uppercase tracking-tighter">
            Sensitivity
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {THRESHOLDS.map((t) => (
              <label key={t.key} className="block">
                <span className="text-xs text-on-surface-variant block mb-1">
                  {t.label}
                </span>
                <input
                  type="number"
                  data-testid={`notif-threshold-${t.key}`}
                  value={draft.thresholds[t.key]}
                  min={t.min}
                  max={t.max}
                  step={t.step}
                  onChange={(e) =>
                    setThreshold(t.key, Number(e.target.value))
                  }
                  className="w-full bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2 text-sm tabular-nums text-on-surface focus:outline-none focus:border-primary"
                />
                <span className="text-[10px] text-outline">{t.hint}</span>
              </label>
            ))}
          </div>
        </section>

        <hr className="border-outline-variant/10" />

        {/* Weekly report */}
        <section className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-on-surface">Weekly AI report</div>
            <div className="text-xs text-outline">
              Notify when the Monday insights report is generated.
            </div>
          </div>
          <Toggle
            testid="notif-weekly-toggle"
            label="Enable weekly report notification"
            checked={draft.weeklyReportEnabled}
            onChange={(v) => patch({ weeklyReportEnabled: v })}
          />
        </section>

        {/* Save */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {update.isSuccess && !dirty && (
            <span className="text-xs text-secondary">Saved.</span>
          )}
          <button
            type="button"
            data-testid="notif-save"
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate(draft)}
            className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Card>
  );
}
