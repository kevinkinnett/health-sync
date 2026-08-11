import type { NotificationSettings } from "@health-dashboard/shared";
import { NOTIFICATION_KINDS } from "./notificationSettingsModel";
import { SettingsSwitch } from "./NotificationSettingsUi";

export function NotificationDetectionSection({
  settings,
  onToggle,
}: {
  settings: NotificationSettings;
  onToggle: (key: keyof NotificationSettings["kinds"]) => void;
}) {
  return (
    <section aria-labelledby="notification-detection-title" className="space-y-4">
      <div>
        <h3 id="notification-detection-title" className="text-sm font-bold text-on-surface">
          What to detect
        </h3>
        <p className="mt-1 text-xs text-outline">
          Detection runs independently from phone delivery.
        </p>
      </div>
      {NOTIFICATION_KINDS.map((kind) => (
        <div key={kind.key} className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-on-surface">{kind.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-outline">{kind.description}</p>
          </div>
          <SettingsSwitch
            testId={`notif-kind-${kind.key}`}
            label={`Detect ${kind.label}`}
            checked={settings.kinds[kind.key]}
            onChange={() => onToggle(kind.key)}
          />
        </div>
      ))}
    </section>
  );
}
