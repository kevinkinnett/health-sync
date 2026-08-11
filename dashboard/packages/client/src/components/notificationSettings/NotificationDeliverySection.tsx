import type { AlertSeverity, NotificationSettings } from "@health-dashboard/shared";
import { Button } from "../ui/Button";
import { PUSHABLE_SEVERITIES } from "./notificationSettingsModel";
import { MutationNotice, SettingsSwitch } from "./NotificationSettingsUi";

export function NotificationDeliverySection({
  settings,
  urlError,
  dirty,
  isTesting,
  testError,
  testResult,
  onPushEnabledChange,
  onSeverityToggle,
  onUrlChange,
  onTest,
}: {
  settings: NotificationSettings;
  urlError?: string;
  dirty: boolean;
  isTesting: boolean;
  testError: string | null;
  testResult: { ok: boolean; text: string } | null;
  onPushEnabledChange: (enabled: boolean) => void;
  onSeverityToggle: (severity: Exclude<AlertSeverity, "info">) => void;
  onUrlChange: (value: string) => void;
  onTest: () => void;
}) {
  const urlErrorId = urlError ? "apprise-url-error" : undefined;

  return (
    <section aria-labelledby="notification-delivery-title" className="space-y-5">
      <div>
        <h3 id="notification-delivery-title" className="text-sm font-bold text-on-surface">
          Push delivery
        </h3>
        <p className="mt-1 text-xs text-outline">
          Forward selected alerts through the externally managed Apprise service.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl bg-surface-container-low p-4">
        <div>
          <p className="text-sm font-semibold text-on-surface">Push to my phone</p>
          <p className="mt-1 text-xs text-outline">
            The in-app alert history remains available when push is off.
          </p>
        </div>
        <SettingsSwitch
          testId="notif-push-toggle"
          label="Enable push notifications"
          checked={settings.pushEnabled}
          onChange={onPushEnabledChange}
        />
      </div>

      <fieldset disabled={!settings.pushEnabled} className="space-y-2 disabled:opacity-45">
        <legend className="text-xs font-bold uppercase tracking-wider text-outline">
          Severities to push
        </legend>
        <div className="flex flex-wrap gap-2">
          {PUSHABLE_SEVERITIES.map((severity) => {
            const selected = settings.pushSeverities.includes(severity.value);
            return (
              <button
                key={severity.value}
                type="button"
                data-testid={`notif-sev-${severity.value}`}
                aria-pressed={selected}
                onClick={() => onSeverityToggle(severity.value)}
                className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed ${
                  selected
                    ? "border-primary bg-primary/10 text-on-surface"
                    : "border-outline-variant/15 bg-surface-container-low text-outline hover:text-on-surface"
                }`}
              >
                {severity.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="apprise-url" className="block text-xs font-bold uppercase tracking-wider text-outline">
          Apprise endpoint
        </label>
        <input
          id="apprise-url"
          type="url"
          value={settings.appriseUrl}
          onChange={(event) => onUrlChange(event.target.value)}
          spellCheck={false}
          aria-invalid={Boolean(urlError)}
          aria-describedby={urlErrorId}
          className="mt-2 w-full rounded-lg border border-outline-variant/15 bg-surface-container-lowest px-3 py-2.5 font-mono text-sm text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/60 aria-invalid:border-error"
        />
        {urlError && (
          <p id={urlErrorId} className="mt-1 text-xs text-error">
            {urlError}
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-outline">
          Save endpoint changes before sending a test. The delivery token remains
          in Apprise; this URL selects its configured health target.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          variant="secondary"
          data-testid="notif-test"
          onClick={onTest}
          disabled={dirty || isTesting || Boolean(urlError)}
        >
          {isTesting ? "Sending…" : "Send test"}
        </Button>
        {dirty && (
          <p className="text-xs text-outline">Save changes to test the current endpoint.</p>
        )}
      </div>

      {testError && <MutationNotice error>Test failed: {testError}</MutationNotice>}
      {testResult && (
        <MutationNotice error={!testResult.ok}>
          <span data-testid="notif-test-result">{testResult.text}</span>
        </MutationNotice>
      )}
    </section>
  );
}
