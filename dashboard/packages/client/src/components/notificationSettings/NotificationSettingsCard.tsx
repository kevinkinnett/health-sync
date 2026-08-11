import { Button } from "../ui/Button";
import { NotificationDeliverySection } from "./NotificationDeliverySection";
import { NotificationDetectionSection } from "./NotificationDetectionSection";
import { NotificationSensitivitySection } from "./NotificationSensitivitySection";
import { NotificationWeeklySection } from "./NotificationWeeklySection";
import {
  MutationNotice,
  NotificationSaveBar,
  NotificationSettingsFrame,
  SettingsDivider,
} from "./NotificationSettingsUi";
import { useNotificationSettingsForm } from "./useNotificationSettingsForm";

export function NotificationSettingsCard() {
  const form = useNotificationSettingsForm();

  if (form.loadError && !form.draft) {
    return (
      <NotificationSettingsFrame>
        <div role="alert" className="rounded-xl border border-error/25 bg-error/10 p-5 text-center">
          <p className="text-sm font-semibold text-error">
            Could not load notification settings.
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">{form.loadError}</p>
          <Button variant="danger" className="mt-4" onClick={form.retryLoad}>
            Try again
          </Button>
        </div>
      </NotificationSettingsFrame>
    );
  }

  if (form.isLoading || !form.draft) {
    return (
      <NotificationSettingsFrame>
        <div role="status" className="space-y-3" aria-label="Loading notification settings">
          {["w-2/3", "w-full", "w-5/6"].map((width) => (
            <div key={width} className={`h-12 animate-pulse rounded-xl bg-surface-container-high ${width}`} />
          ))}
        </div>
      </NotificationSettingsFrame>
    );
  }

  return (
    <NotificationSettingsFrame>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          form.save();
        }}
        noValidate
      >
        <NotificationDeliverySection
          settings={form.draft}
          urlError={form.errors.appriseUrl}
          dirty={form.dirty}
          isTesting={form.isTesting}
          testError={form.testError}
          testResult={form.testResult}
          onPushEnabledChange={form.setPushEnabled}
          onSeverityToggle={form.toggleSeverity}
          onUrlChange={form.setAppriseUrl}
          onTest={form.sendTest}
        />
        <SettingsDivider />
        <NotificationDetectionSection
          settings={form.draft}
          onToggle={form.toggleKind}
        />
        <SettingsDivider />
        <NotificationSensitivitySection
          settings={form.draft}
          errors={form.errors}
          onChange={form.setThreshold}
        />
        <SettingsDivider />
        <NotificationWeeklySection
          enabled={form.draft.weeklyReportEnabled}
          onChange={form.setWeeklyReportEnabled}
        />
        {form.saveError && (
          <MutationNotice error>Save failed: {form.saveError}</MutationNotice>
        )}
        <NotificationSaveBar
          dirty={form.dirty}
          canSave={form.dirty && form.valid && !form.isSaving}
          isSaving={form.isSaving}
          saved={form.saved}
          onDiscard={form.discard}
        />
      </form>
    </NotificationSettingsFrame>
  );
}
