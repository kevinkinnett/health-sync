import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MedicationItem,
  MedicationIntake,
  CreateMedicationItemBody,
  UpdateMedicationItemBody,
  CreateMedicationIntakeBody,
  UpdateMedicationIntakeBody,
  LagProfile,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { invalidateMedications } from "./_invalidation.js";

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

export function useMedicationItems(includeInactive = false) {
  return useQuery<MedicationItem[]>({
    queryKey: ["medications", "items", includeInactive],
    queryFn: () =>
      apiFetch(
        `/medications/items${includeInactive ? "?includeInactive=true" : ""}`,
      ),
  });
}

export function useMedicationIntakes(
  start?: string,
  end?: string,
  itemId?: number,
) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (itemId != null) params.set("itemId", String(itemId));
  const query = params.toString();
  return useQuery<MedicationIntake[]>({
    queryKey: ["medications", "intakes", start ?? null, end ?? null, itemId ?? null],
    queryFn: () => apiFetch(`/medications/intakes${query ? `?${query}` : ""}`),
  });
}

export function useCreateMedicationItem() {
  const queryClient = useQueryClient();
  return useMutation<MedicationItem, Error, CreateMedicationItemBody>({
    mutationFn: (body) =>
      apiFetch("/medications/items", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}

export function useUpdateMedicationItem() {
  const queryClient = useQueryClient();
  return useMutation<
    MedicationItem,
    Error,
    { id: number; body: UpdateMedicationItemBody }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch(`/medications/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}

export function useArchiveMedicationItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/medications/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}

export function useLogMedicationIntake() {
  const queryClient = useQueryClient();
  return useMutation<MedicationIntake, Error, CreateMedicationIntakeBody>({
    mutationFn: (body) =>
      apiFetch("/medications/intakes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}

/** Cross-correlation r vs day-lag (0..7) for one medication. */
export function useMedicationLagProfile(itemId: number | null) {
  return useQuery<LagProfile>({
    queryKey: ["analytics", "medications", "lag-profile", itemId],
    queryFn: () => apiFetch(`/analytics/medications/lag-profile/${itemId}`),
    enabled: itemId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateMedicationIntake() {
  const queryClient = useQueryClient();
  return useMutation<
    MedicationIntake,
    Error,
    { id: number; body: UpdateMedicationIntakeBody }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch(`/medications/intakes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}

export function useDeleteMedicationIntake() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/medications/intakes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateMedications(queryClient);
    },
  });
}
