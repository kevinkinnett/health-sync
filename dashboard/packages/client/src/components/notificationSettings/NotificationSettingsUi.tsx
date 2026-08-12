import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

export function NotificationSettingsFrame({ children }: { children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <header className="mb-6">
        <h2 className="flex items-center gap-2 font-headline text-xl font-bold text-on-surface">
          <span className="material-symbols-outlined text-primary" aria-hidden="true">
            notifications_active
          </span>
          Notifications
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-on-surface-variant">
          Tune what gets detected and what reaches your phone. The in-app bell
          always shows everything detected.
        </p>
      </header>
      {children}
    </Card>
  );
}

export function SettingsSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  testId,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-40 ${
        checked ? "bg-primary" : "bg-outline-variant/40"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function SettingsDivider() {
  return <hr className="border-outline-variant/35" />;
}

export function MutationNotice({
  error,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-xs ${
        error
          ? "border-error/25 bg-error/10 text-error"
          : "border-secondary/20 bg-secondary/10 text-secondary"
      }`}
    >
      {children}
    </p>
  );
}

export function NotificationSaveBar({
  dirty,
  canSave,
  isSaving,
  saved,
  onDiscard,
}: {
  dirty: boolean;
  canSave: boolean;
  isSaving: boolean;
  saved: boolean;
  onDiscard: () => void;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-outline-variant/10 pt-5 sm:flex-row sm:items-center sm:justify-end">
      {saved && <span className="text-xs text-secondary">Saved.</span>}
      {dirty && (
        <Button variant="quiet" onClick={onDiscard}>
          Discard changes
        </Button>
      )}
      <Button type="submit" disabled={!canSave} data-testid="notif-save">
        {isSaving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
