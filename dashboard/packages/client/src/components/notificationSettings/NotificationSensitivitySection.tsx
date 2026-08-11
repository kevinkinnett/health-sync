import type { NotificationSettings } from "@health-dashboard/shared";
import {
  NOTIFICATION_THRESHOLDS,
  type NotificationSettingsErrors,
  type ThresholdKey,
} from "./notificationSettingsModel";

export function NotificationSensitivitySection({
  settings,
  errors,
  onChange,
}: {
  settings: NotificationSettings;
  errors: NotificationSettingsErrors;
  onChange: (key: ThresholdKey, value: number) => void;
}) {
  return (
    <section aria-labelledby="notification-sensitivity-title" className="space-y-4">
      <div>
        <h3 id="notification-sensitivity-title" className="text-sm font-bold text-on-surface">
          Sensitivity
        </h3>
        <p className="mt-1 text-xs text-outline">
          These thresholds affect the next detector evaluation after Save.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NOTIFICATION_THRESHOLDS.map((threshold) => {
          const error = errors[threshold.key];
          const errorId = error ? `notification-${threshold.key}-error` : undefined;
          return (
            <label key={threshold.key} className="rounded-xl bg-surface-container-low p-3">
              <span className="block text-xs font-semibold text-on-surface-variant">
                {threshold.label}
              </span>
              <input
                type="number"
                data-testid={`notif-threshold-${threshold.key}`}
                value={settings.thresholds[threshold.key]}
                min={threshold.min}
                max={threshold.max}
                step={threshold.step}
                onChange={(event) =>
                  onChange(threshold.key, event.target.valueAsNumber)
                }
                aria-invalid={Boolean(error)}
                aria-describedby={errorId}
                className="mt-2 w-full rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-3 py-2 text-sm tabular-nums text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/60 aria-invalid:border-error"
              />
              <span className="mt-1 block text-[11px] text-outline">{threshold.hint}</span>
              {error && (
                <span id={errorId} className="mt-1 block text-xs text-error">
                  {error}
                </span>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}
