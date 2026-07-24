import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DossierEntry, DossierItemType } from "@health-dashboard/shared";
import { apiFetch } from "../client";

// ---------------------------------------------------------------------------
// Dossiers (LLM-built reference for supplements/medications)
// ---------------------------------------------------------------------------

/**
 * Fetch the cached dossier for a given item, if any. The server returns
 * `null` (not 404) when no dossier has been built yet — that's the
 * normal "empty" state the UI keys off to render the build CTA.
 *
 * `enabled` lets the caller open a drawer lazily without firing the
 * request before the user picks an item.
 */
export function useDossier(
  type: DossierItemType,
  id: number | null,
  options?: { enabled?: boolean },
) {
  return useQuery<DossierEntry | null>({
    queryKey: ["dossier", type, id],
    queryFn: () => apiFetch(`/dossier/${type}/${id}`),
    enabled: id != null && options?.enabled !== false,
    // The dossier itself doesn't change without an explicit refresh, so
    // there's no point re-fetching while the drawer is open. Refresh
    // mutation invalidates the key when it succeeds.
    staleTime: Infinity,
  });
}

export function useRefreshDossier() {
  const queryClient = useQueryClient();
  return useMutation<
    DossierEntry,
    Error,
    { type: DossierItemType; id: number }
  >({
    mutationFn: ({ type, id }) =>
      apiFetch(`/dossier/${type}/${id}/refresh`, { method: "POST" }),
    onSuccess: (entry) => {
      queryClient.setQueryData(
        ["dossier", entry.itemType, entry.itemId],
        entry,
      );
    },
  });
}

export function useDeleteDossier() {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { type: DossierItemType; id: number }
  >({
    mutationFn: ({ type, id }) =>
      apiFetch<void>(`/dossier/${type}/${id}`, { method: "DELETE" }),
    onSuccess: (_void, { type, id }) => {
      queryClient.setQueryData(["dossier", type, id], null);
    },
  });
}
