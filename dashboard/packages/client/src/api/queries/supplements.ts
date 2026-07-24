import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
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
} from "@health-dashboard/shared";
import { apiFetch } from "../client";
import { invalidateSupplements } from "./_invalidation.js";

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
