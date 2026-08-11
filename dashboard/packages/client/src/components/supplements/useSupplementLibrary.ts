import type {
  CreateSupplementItemBody,
  SupplementIngredient,
  SupplementItem,
  UpdateSupplementItemBody,
} from "@health-dashboard/shared";
import {
  useArchiveSupplementItem,
  useCreateSupplementItem,
  useSetSupplementItemIngredients,
  useSupplementIngredients,
  useSupplementItems,
  useUpdateSupplementItem,
} from "../../api/queries";
import type { CompositionRow } from "./supplementComposition";
import { buildCompositionBody } from "./supplementComposition";

export interface SupplementLibraryState {
  active: SupplementItem[];
  archived: SupplementItem[];
  ingredientCatalog: SupplementIngredient[];
  isLoading: boolean;
  loadError: string | null;
  mutationError: string | null;
  creating: boolean;
  updating: boolean;
  archiving: boolean;
  createItem: (
    body: CreateSupplementItemBody,
    composition: CompositionRow[],
  ) => Promise<SupplementItem>;
  updateItem: (
    id: number,
    body: UpdateSupplementItemBody,
    composition: CompositionRow[],
  ) => Promise<SupplementItem>;
  archiveItem: (id: number) => Promise<void>;
  restoreItem: (id: number) => Promise<SupplementItem>;
  retry: () => void;
}

export function useSupplementLibrary(): SupplementLibraryState {
  const items = useSupplementItems(true);
  const ingredients = useSupplementIngredients();
  const create = useCreateSupplementItem();
  const update = useUpdateSupplementItem();
  const archive = useArchiveSupplementItem();
  const setComposition = useSetSupplementItemIngredients();
  const allItems = items.data ?? [];
  const mutationError =
    create.error ?? update.error ?? archive.error ?? setComposition.error;

  const createItem = async (
    body: CreateSupplementItemBody,
    composition: CompositionRow[],
  ) => {
    const created = await create.mutateAsync(body);
    const compositionBody = buildCompositionBody(composition);
    if (compositionBody.ingredients.length > 0) {
      await setComposition.mutateAsync({
        itemId: created.id,
        body: compositionBody,
      });
    }
    return created;
  };

  const updateItem = async (
    id: number,
    body: UpdateSupplementItemBody,
    composition: CompositionRow[],
  ) => {
    const updated = await update.mutateAsync({ id, body });
    await setComposition.mutateAsync({
      itemId: id,
      body: buildCompositionBody(composition),
    });
    return updated;
  };

  return {
    active: allItems.filter((item) => item.isActive),
    archived: allItems.filter((item) => !item.isActive),
    ingredientCatalog: ingredients.data ?? [],
    isLoading: items.isLoading || ingredients.isLoading,
    loadError: items.error?.message ?? ingredients.error?.message ?? null,
    mutationError: mutationError?.message ?? null,
    creating: create.isPending || setComposition.isPending,
    updating: update.isPending || setComposition.isPending,
    archiving: archive.isPending,
    createItem,
    updateItem,
    archiveItem: (id) => archive.mutateAsync(id),
    restoreItem: (id) =>
      update.mutateAsync({ id, body: { isActive: true } }),
    retry: () => {
      create.reset();
      update.reset();
      archive.reset();
      setComposition.reset();
      void items.refetch();
      void ingredients.refetch();
    },
  };
}
