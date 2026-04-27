import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  HealthSummary,
  WeeklyInsights,
  CorrelationsData,
  DayOfWeekHeatmapData,
  RecordsData,
  ActivityDay,
  SleepDay,
  HeartRateDay,
  WeightEntry,
  HrvDay,
  ExerciseLog,
  IngestState,
  IngestRun,
  IngestOverview,
  TriggerResponse,
  SupplementItem,
  SupplementIntake,
  SupplementIngredient,
  SupplementItemIngredient,
  CreateSupplementItemBody,
  UpdateSupplementItemBody,
  CreateSupplementIntakeBody,
  CreateSupplementIngredientBody,
  UpdateSupplementIngredientBody,
  SetSupplementItemIngredientsBody,
  MedicationItem,
  MedicationIntake,
  CreateMedicationItemBody,
  UpdateMedicationItemBody,
  CreateMedicationIntakeBody,
  DossierEntry,
  DossierItemType,
} from "@health-dashboard/shared";
import { apiFetch } from "./client";
import { useDateRangeStore } from "../stores/dateRangeStore";

export function useHealthSummary() {
  return useQuery<HealthSummary>({
    queryKey: ["health", "summary"],
    queryFn: () => apiFetch("/health/summary"),
  });
}

export function useWeeklyInsights() {
  return useQuery<WeeklyInsights>({
    queryKey: ["health", "insights", "weekly"],
    queryFn: () => apiFetch("/health/insights/weekly"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecords() {
  return useQuery<RecordsData>({
    queryKey: ["health", "records"],
    queryFn: () => apiFetch("/health/records"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useDayOfWeekHeatmap() {
  return useQuery<DayOfWeekHeatmapData>({
    queryKey: ["health", "heatmap", "day-of-week"],
    queryFn: () => apiFetch("/health/heatmap/day-of-week"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCorrelations() {
  return useQuery<CorrelationsData>({
    queryKey: ["health", "correlations"],
    queryFn: () => apiFetch("/health/correlations"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useActivity() {
  const { start, end } = useDateRangeStore();
  return useQuery<ActivityDay[]>({
    queryKey: ["health", "activity", start, end],
    queryFn: () => apiFetch(`/health/activity?start=${start}&end=${end}`),
  });
}

export function useSleep() {
  const { start, end } = useDateRangeStore();
  return useQuery<SleepDay[]>({
    queryKey: ["health", "sleep", start, end],
    queryFn: () => apiFetch(`/health/sleep?start=${start}&end=${end}`),
  });
}

export function useHeartRate() {
  const { start, end } = useDateRangeStore();
  return useQuery<HeartRateDay[]>({
    queryKey: ["health", "heart-rate", start, end],
    queryFn: () => apiFetch(`/health/heart-rate?start=${start}&end=${end}`),
  });
}

export function useWeight() {
  const { start, end } = useDateRangeStore();
  return useQuery<WeightEntry[]>({
    queryKey: ["health", "weight", start, end],
    queryFn: () => apiFetch(`/health/weight?start=${start}&end=${end}`),
  });
}

export interface HealthCheck {
  status: string;
  dbConnected: boolean;
}

export function useHealthCheck() {
  return useQuery<HealthCheck>({
    queryKey: ["health-check"],
    queryFn: () => apiFetch("/health-check"),
    refetchInterval: 30_000, // check every 30s
    retry: 1,
  });
}

export function useIngestOverview(limit = 20) {
  return useQuery<IngestOverview>({
    queryKey: ["ingest", "overview", limit],
    queryFn: () => apiFetch(`/ingest/overview?limit=${limit}`),
    refetchInterval: 10_000, // poll every 10s to show live job status
  });
}

export function useIngestState() {
  return useQuery<IngestState[]>({
    queryKey: ["ingest", "state"],
    queryFn: () => apiFetch("/ingest/state"),
  });
}

export function useIngestRuns(limit = 20) {
  return useQuery<IngestRun[]>({
    queryKey: ["ingest", "runs", limit],
    queryFn: () => apiFetch(`/ingest/runs?limit=${limit}`),
  });
}

export function useHrv() {
  const { start, end } = useDateRangeStore();
  return useQuery<HrvDay[]>({
    queryKey: ["health", "hrv", start, end],
    queryFn: () => apiFetch(`/health/hrv?start=${start}&end=${end}`),
  });
}

export function useExerciseLogs() {
  const { start, end } = useDateRangeStore();
  return useQuery<ExerciseLog[]>({
    queryKey: ["health", "exercise-logs", start, end],
    queryFn: () => apiFetch(`/health/exercise-logs?start=${start}&end=${end}`),
  });
}

export function useTriggerIngest() {
  const queryClient = useQueryClient();
  return useMutation<TriggerResponse>({
    mutationFn: () =>
      apiFetch("/ingest/trigger", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ingest"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

export function useSupplementItems(includeInactive = false) {
  return useQuery<SupplementItem[]>({
    queryKey: ["supplements", "items", includeInactive],
    queryFn: () =>
      apiFetch(
        `/supplements/items${includeInactive ? "?includeInactive=true" : ""}`,
      ),
  });
}

export function useSupplementIntakes(
  start?: string,
  end?: string,
  itemId?: number,
) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (itemId != null) params.set("itemId", String(itemId));
  const query = params.toString();
  return useQuery<SupplementIntake[]>({
    queryKey: ["supplements", "intakes", start ?? null, end ?? null, itemId ?? null],
    queryFn: () => apiFetch(`/supplements/intakes${query ? `?${query}` : ""}`),
  });
}

export function useCreateSupplementItem() {
  const queryClient = useQueryClient();
  return useMutation<SupplementItem, Error, CreateSupplementItemBody>({
    mutationFn: (body) =>
      apiFetch("/supplements/items", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplements", "items"] });
    },
  });
}

export function useUpdateSupplementItem() {
  const queryClient = useQueryClient();
  return useMutation<
    SupplementItem,
    Error,
    { id: number; body: UpdateSupplementItemBody }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch(`/supplements/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplements", "items"] });
    },
  });
}

export function useArchiveSupplementItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplements", "items"] });
    },
  });
}

export function useLogSupplementIntake() {
  const queryClient = useQueryClient();
  return useMutation<SupplementIntake, Error, CreateSupplementIntakeBody>({
    mutationFn: (body) =>
      apiFetch("/supplements/intakes", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplements", "intakes"] });
    },
  });
}

export function useDeleteSupplementIntake() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/intakes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplements", "intakes"] });
    },
  });
}

// ---- Ingredients & composition --------------------------------------------

export function useSupplementIngredients() {
  return useQuery<SupplementIngredient[]>({
    queryKey: ["supplements", "ingredients"],
    queryFn: () => apiFetch("/supplements/ingredients"),
  });
}

export function useCreateSupplementIngredient() {
  const queryClient = useQueryClient();
  return useMutation<
    SupplementIngredient,
    Error,
    CreateSupplementIngredientBody
  >({
    mutationFn: (body) =>
      apiFetch("/supplements/ingredients", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["supplements", "ingredients"],
      });
    },
  });
}

export function useUpdateSupplementIngredient() {
  const queryClient = useQueryClient();
  return useMutation<
    SupplementIngredient,
    Error,
    { id: number; body: UpdateSupplementIngredientBody }
  >({
    mutationFn: ({ id, body }) =>
      apiFetch(`/supplements/ingredients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["supplements", "ingredients"],
      });
    },
  });
}

export function useDeleteSupplementIngredient() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/ingredients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["supplements", "ingredients"],
      });
    },
  });
}

export function useSetSupplementItemIngredients() {
  const queryClient = useQueryClient();
  return useMutation<
    SupplementItemIngredient[],
    Error,
    { itemId: number; body: SetSupplementItemIngredientsBody }
  >({
    mutationFn: ({ itemId, body }) =>
      apiFetch(`/supplements/items/${itemId}/ingredients`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      // Both items (ingredients embedded) and ingredients list may change
      queryClient.invalidateQueries({ queryKey: ["supplements", "items"] });
      queryClient.invalidateQueries({
        queryKey: ["supplements", "ingredients"],
      });
    },
  });
}

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
      queryClient.invalidateQueries({ queryKey: ["medications", "items"] });
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
      queryClient.invalidateQueries({ queryKey: ["medications", "items"] });
    },
  });
}

export function useArchiveMedicationItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/medications/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications", "items"] });
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
      queryClient.invalidateQueries({ queryKey: ["medications", "intakes"] });
    },
  });
}

export function useDeleteMedicationIntake() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/medications/intakes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["medications", "intakes"] });
    },
  });
}

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
