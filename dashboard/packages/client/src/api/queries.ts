import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
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
  SupplementAdherence,
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
  AppConfig,
} from "@health-dashboard/shared";
import { apiFetch } from "./client";
import { useDateRangeStore } from "../stores/dateRangeStore";

// ---------------------------------------------------------------------------
// Cache invalidation helpers
// ---------------------------------------------------------------------------
//
// Every "domain" mutation needs to tell React Query which cached queries
// are now stale. Doing this per-mutation is how the dashboard avoids
// going stale-screen-by-stale-screen as new charts get added.
//
// A supplement intake doesn't just affect the supplements page — it
// changes adherence, intake-by-day, ingredient rollups, and every
// correlation pair on the analytics screen. They all live under
// different query-key prefixes (`["supplements", …]` vs
// `["analytics", "supplements", …]`); the helpers below invalidate the
// whole blast radius in one call.
//
// Rule of thumb: any mutation that touches a domain should call the
// matching helper rather than inline `invalidateQueries`. Over-
// invalidation is cheap (refetches happen lazily on next access);
// under-invalidation forces the user to hit refresh.

function invalidateSupplements(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["supplements"] });
  qc.invalidateQueries({ queryKey: ["analytics", "supplements"] });
}

function invalidateMedications(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["medications"] });
  qc.invalidateQueries({ queryKey: ["analytics", "medications"] });
}

/**
 * After a fresh ingest run, every health-metric series, weekly insight,
 * records leaderboard, day-of-week heatmap, and analytics correlation is
 * potentially stale (correlations consume health data too).
 */
function invalidateAfterIngest(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["ingest"] });
  qc.invalidateQueries({ queryKey: ["health"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
}

/**
 * Fetches the user's IANA timezone (and any future runtime config) from
 * the server. Cached forever in-session — config doesn't change without a
 * server restart, so refetching is wasted effort.
 *
 * Components that need a TZ for date math should prefer this over
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` (which gives the
 * *browser's* zone — wrong if the user is travelling away from their
 * configured home zone).
 */
export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => apiFetch("/config"),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Convenience: returns the user's timezone, falling back to the browser's
 * zone while the config is loading and then to UTC if even that fails.
 * Lets call sites be synchronous without juggling a pending state.
 */
export function useUserTimezone(): string {
  const { data } = useAppConfig();
  if (data?.userTimezone) return data.userTimezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

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
      invalidateAfterIngest(queryClient);
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
      invalidateSupplements(queryClient);
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
      invalidateSupplements(queryClient);
    },
  });
}

export function useArchiveSupplementItem() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/items/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateSupplements(queryClient);
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
      invalidateSupplements(queryClient);
    },
  });
}

export function useDeleteSupplementIntake() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/intakes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateSupplements(queryClient);
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
      invalidateSupplements(queryClient);
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
      invalidateSupplements(queryClient);
    },
  });
}

export function useDeleteSupplementIngredient() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: (id) =>
      apiFetch<void>(`/supplements/ingredients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidateSupplements(queryClient);
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
      // Items (ingredients embedded), ingredients list, and the
      // ingredient-by-day analytics rollup all change together.
      invalidateSupplements(queryClient);
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

// ---------------------------------------------------------------------------
// Analytics — supplement / medication adherence, rollups, correlations
// ---------------------------------------------------------------------------

/**
 * Adherence calendar + streak summary for one supplement. Driven by
 * the global date-range store so it stays in sync with the rest of
 * the analytics screen.
 */
export function useSupplementAdherence(itemId: number | null) {
  const { start, end } = useDateRangeStore();
  return useQuery<SupplementAdherence>({
    queryKey: ["analytics", "supplements", "adherence", itemId, start, end],
    queryFn: () =>
      apiFetch(
        `/analytics/supplements/adherence/${itemId}?start=${start}&end=${end}`,
      ),
    enabled: itemId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSupplementIntakeByDay(itemId?: number) {
  const { start, end } = useDateRangeStore();
  const params = new URLSearchParams({ start, end });
  if (itemId != null) params.set("itemId", String(itemId));
  return useQuery<IntakeByDay[]>({
    queryKey: [
      "analytics",
      "supplements",
      "intake-by-day",
      itemId ?? null,
      start,
      end,
    ],
    queryFn: () =>
      apiFetch(`/analytics/supplements/intake-by-day?${params.toString()}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSupplementIngredientByDay(ingredientId?: number) {
  const { start, end } = useDateRangeStore();
  const params = new URLSearchParams({ start, end });
  if (ingredientId != null) params.set("ingredientId", String(ingredientId));
  return useQuery<IngredientByDay[]>({
    queryKey: [
      "analytics",
      "supplements",
      "ingredient-by-day",
      ingredientId ?? null,
      start,
      end,
    ],
    queryFn: () =>
      apiFetch(
        `/analytics/supplements/ingredient-by-day?${params.toString()}`,
      ),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Correlations between an item's daily intake and the standard health
 * metrics. `lagDays = 0` is same-day; positive values shift the intake
 * series back so today's metric is paired with intake from N days ago.
 */
export function useSupplementCorrelations(
  itemId: number | null,
  lagDays = 0,
) {
  return useQuery<IntakeCorrelations>({
    queryKey: ["analytics", "supplements", "correlations", itemId, lagDays],
    queryFn: () =>
      apiFetch(
        `/analytics/supplements/correlations/${itemId}?lag=${lagDays}`,
      ),
    enabled: itemId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMedicationAdherence(itemId: number | null) {
  const { start, end } = useDateRangeStore();
  return useQuery<SupplementAdherence>({
    queryKey: ["analytics", "medications", "adherence", itemId, start, end],
    queryFn: () =>
      apiFetch(
        `/analytics/medications/adherence/${itemId}?start=${start}&end=${end}`,
      ),
    enabled: itemId != null,
    staleTime: 5 * 60 * 1000,
  });
}

export function useMedicationIntakeByDay(itemId?: number) {
  const { start, end } = useDateRangeStore();
  const params = new URLSearchParams({ start, end });
  if (itemId != null) params.set("itemId", String(itemId));
  return useQuery<IntakeByDay[]>({
    queryKey: [
      "analytics",
      "medications",
      "intake-by-day",
      itemId ?? null,
      start,
      end,
    ],
    queryFn: () =>
      apiFetch(`/analytics/medications/intake-by-day?${params.toString()}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMedicationCorrelations(
  itemId: number | null,
  lagDays = 0,
) {
  return useQuery<IntakeCorrelations>({
    queryKey: ["analytics", "medications", "correlations", itemId, lagDays],
    queryFn: () =>
      apiFetch(
        `/analytics/medications/correlations/${itemId}?lag=${lagDays}`,
      ),
    enabled: itemId != null,
    staleTime: 5 * 60 * 1000,
  });
}
