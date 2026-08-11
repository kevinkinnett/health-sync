interface DossierActionProps {
  onAction: () => void;
}

export function DossierEmptyState({ onAction }: DossierActionProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-8 text-center">
      <span
        className="material-symbols-outlined text-outline"
        style={{ fontSize: 56 }}
      >
        menu_book
      </span>
      <div>
        <p className="mb-1 font-headline font-semibold text-on-surface">
          No dossier yet
        </p>
        <p className="max-w-xs text-sm text-on-surface-variant">
          Build a sourced reference covering how it works, dosing, side
          effects, interactions, and product-specific notes.
        </p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-2 flex min-h-10 items-center gap-2 rounded-lg bg-linear-to-br from-primary to-primary-container px-5 py-2 text-xs font-bold text-on-primary-fixed shadow-lg shadow-primary/10 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="material-symbols-outlined text-sm">auto_awesome</span>
        Build dossier
      </button>
      <p className="text-[10px] italic text-outline">Usually takes 30–60 seconds.</p>
    </div>
  );
}

export function DossierLoadingState({ label }: { label: string }) {
  return (
    <div className="space-y-4 p-6" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined animate-spin text-base text-primary">
          progress_activity
        </span>
        {label}
      </p>
      <div className="space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="animate-pulse rounded-lg bg-surface-container-high p-4"
          >
            <div className="mb-3 h-3 w-1/3 rounded bg-surface-container-highest" />
            <div className="mb-2 h-2 w-full rounded bg-surface-container-highest" />
            <div className="h-2 w-4/5 rounded bg-surface-container-highest" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DossierErrorState({
  message,
  onAction,
}: DossierActionProps & { message: string }) {
  return (
    <div className="space-y-4 p-6">
      <div className="rounded-lg border border-error/20 bg-error/10 p-4" role="alert">
        <p className="mb-1 text-sm font-bold text-error">
          Couldn&rsquo;t build dossier
        </p>
        <p className="break-words text-xs text-on-surface-variant">{message}</p>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="flex min-h-10 items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="material-symbols-outlined text-sm">refresh</span>
        Try again
      </button>
    </div>
  );
}

export function DossierRefreshNotice({
  error,
  onRetry,
}: {
  error?: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div
        className="mx-5 mt-4 flex items-start justify-between gap-3 rounded-lg border border-error/20 bg-error/10 px-4 py-3"
        role="alert"
      >
        <div>
          <p className="text-xs font-bold text-error">Refresh failed</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/8 px-4 py-3 text-xs text-on-surface-variant"
      role="status"
      aria-live="polite"
    >
      <span className="material-symbols-outlined animate-spin text-sm text-primary">
        progress_activity
      </span>
      Refreshing the reference. The cached version remains available below.
    </div>
  );
}
