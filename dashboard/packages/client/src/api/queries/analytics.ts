import { useQuery } from "@tanstack/react-query";
import type {
  SupplementAdherence,
  DoseResponseSummary,
  IntakeByDay,
  IngredientByDay,
  IntakeCorrelations,
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { useDateRangeStore } from "../../stores/dateRangeStore";

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

/**
 * Long-horizon dose-level comparison (metric averages per daily-dose
 * level, 0 = skipped days). Suits slow-acting medications where the
 * day-lag correlations can't see effects that build over weeks.
 */
export function useMedicationDoseResponse(itemId: number | null) {
  return useQuery<DoseResponseSummary>({
    queryKey: ["analytics", "medications", "dose-response", itemId],
    queryFn: () => apiFetch(`/analytics/medications/dose-response/${itemId}`),
    enabled: itemId != null,
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
