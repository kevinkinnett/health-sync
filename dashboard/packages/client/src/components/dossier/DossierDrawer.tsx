import type { DossierItemType } from "@health-dashboard/shared";
import { useDossier, useRefreshDossier } from "../../api/queries";
import { formatRelativeAgo } from "../../lib/relativeTime";
import { DossierContent } from "./DossierContent";
import { DossierDialog } from "./DossierDialog";
import {
  DossierEmptyState,
  DossierErrorState,
  DossierLoadingState,
  DossierRefreshNotice,
} from "./DossierStates";

export interface DossierDrawerTarget {
  type: DossierItemType;
  id: number;
  itemName: string;
  itemBrand?: string | null;
  itemForm?: string | null;
}

interface DossierDrawerProps {
  target: DossierDrawerTarget | null;
  onClose: () => void;
}

/** Controlled dossier entry point shared by both item libraries. */
export function DossierDrawer({ target, onClose }: DossierDrawerProps) {
  if (!target) return null;
  return <DossierDrawerInner target={target} onClose={onClose} />;
}

function DossierDrawerInner({
  target,
  onClose,
}: {
  target: DossierDrawerTarget;
  onClose: () => void;
}) {
  const { type, id, itemName, itemBrand, itemForm } = target;
  const dossier = useDossier(type, id);
  const refresh = useRefreshDossier();
  const entry = dossier.data ?? null;
  const subtitle = [itemBrand, itemForm].filter(Boolean).join(" · ");

  function handleRefresh() {
    refresh.mutate({ type, id });
  }

  const refreshAction = entry ? (
    <button
      type="button"
      onClick={handleRefresh}
      disabled={refresh.isPending}
      title="Rebuild dossier"
      aria-label="Refresh dossier"
      className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
    >
      <span
        className={`material-symbols-outlined text-base ${
          refresh.isPending ? "animate-spin" : ""
        }`}
        aria-hidden="true"
      >
        refresh
      </span>
      {refresh.isPending ? "Refreshing…" : "Refresh"}
    </button>
  ) : null;

  return (
    <DossierDialog
      title={itemName}
      subtitle={subtitle || undefined}
      metadata={
        entry
          ? `Cached ${formatRelativeAgo(entry.fetchedAt)} · ${entry.model}`
          : undefined
      }
      actions={refreshAction}
      onClose={onClose}
    >
      {dossier.isLoading ? (
        <DossierLoadingState label="Loading cached dossier…" />
      ) : entry ? (
        <>
          {refresh.isPending && <DossierRefreshNotice onRetry={handleRefresh} />}
          {refresh.error && (
            <DossierRefreshNotice
              error={refresh.error.message}
              onRetry={handleRefresh}
            />
          )}
          <DossierContent content={entry.content} />
        </>
      ) : refresh.isPending ? (
        <DossierLoadingState label="Building dossier — this can take 30–60 seconds…" />
      ) : refresh.error ? (
        <DossierErrorState
          message={refresh.error.message}
          onAction={handleRefresh}
        />
      ) : (
        <DossierEmptyState onAction={handleRefresh} />
      )}
    </DossierDialog>
  );
}
