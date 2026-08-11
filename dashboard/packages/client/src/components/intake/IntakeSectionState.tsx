export function SectionLoading({ label }: { label: string }) {
  return (
    <p role="status" className="text-on-surface-variant text-sm py-2">
      {label}
    </p>
  );
}

export function SectionError({
  message,
  actionLabel,
  onRetry,
}: {
  message: string;
  actionLabel: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-lg bg-error/10"
    >
      <p className="text-xs text-error">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        aria-label={actionLabel}
        className="text-xs font-bold text-error underline underline-offset-2 self-start"
      >
        Try again
      </button>
    </div>
  );
}
