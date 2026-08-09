import { Button } from "./Button";

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 animate-pulse">
      <div className="h-10 w-52 rounded-lg bg-surface-container-high" />
      <div className="h-28 rounded-2xl bg-surface-container" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="h-40 rounded-2xl bg-surface-container" />
        <div className="h-40 rounded-2xl bg-surface-container" />
        <div className="h-40 rounded-2xl bg-surface-container" />
      </div>
    </div>
  );
}

export function PageError({
  onRetry,
  title = "Vitalis couldn’t load your health summary",
  message = "The dashboard is still here, but its data service did not respond. Your stored data has not been changed.",
}: {
  onRetry: () => void;
  title?: string;
  message?: string;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-error/30 bg-error/10 p-8 text-center">
      <h1 className="font-headline text-2xl font-semibold text-on-surface">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-on-surface-variant">
        {message}
      </p>
      <Button variant="danger" className="mt-5" onClick={onRetry}>Try again</Button>
    </div>
  );
}

export function PartialDataNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-tertiary/25 bg-tertiary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-on-surface-variant">Some supporting panels are temporarily unavailable. The summary below is still current.</p>
      <Button variant="quiet" className="shrink-0" onClick={onRetry}>Retry panels</Button>
    </div>
  );
}
