import { SettingsSwitch } from "./NotificationSettingsUi";

export function NotificationWeeklySection({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <section className="flex items-start justify-between gap-4" aria-labelledby="notification-weekly-title">
      <div>
        <h3 id="notification-weekly-title" className="text-sm font-semibold text-on-surface">
          Weekly AI report
        </h3>
        <p className="mt-1 text-xs text-outline">
          Notify when the Monday insights report is generated.
        </p>
      </div>
      <SettingsSwitch
        testId="notif-weekly-toggle"
        label="Enable weekly report notification"
        checked={enabled}
        onChange={onChange}
      />
    </section>
  );
}
