import type {
  CreateMedicationItemBody,
  MedicationItem,
  UpdateMedicationItemBody,
} from "@health-dashboard/shared";
import {
  useArchiveMedicationItem,
  useCreateMedicationItem,
  useMedicationItems,
  useUpdateMedicationItem,
} from "../../api/queries";

export interface MedicationLibraryState {
  active: MedicationItem[];
  archived: MedicationItem[];
  isLoading: boolean;
  loadError: string | null;
  mutationError: string | null;
  creating: boolean;
  updating: boolean;
  archiving: boolean;
  createItem: (body: CreateMedicationItemBody) => Promise<MedicationItem>;
  updateItem: (
    id: number,
    body: UpdateMedicationItemBody,
  ) => Promise<MedicationItem>;
  archiveItem: (id: number) => Promise<void>;
  restoreItem: (id: number) => Promise<MedicationItem>;
  retry: () => void;
}

export function useMedicationLibrary(): MedicationLibraryState {
  const items = useMedicationItems(true);
  const create = useCreateMedicationItem();
  const update = useUpdateMedicationItem();
  const archive = useArchiveMedicationItem();
  const allItems = items.data ?? [];
  const mutationError = create.error ?? update.error ?? archive.error;

  return {
    active: allItems.filter((item) => item.isActive),
    archived: allItems.filter((item) => !item.isActive),
    isLoading: items.isLoading,
    loadError: items.error?.message ?? null,
    mutationError: mutationError?.message ?? null,
    creating: create.isPending,
    updating: update.isPending,
    archiving: archive.isPending,
    createItem: (body) => create.mutateAsync(body),
    updateItem: (id, body) => update.mutateAsync({ id, body }),
    archiveItem: (id) => archive.mutateAsync(id),
    restoreItem: (id) =>
      update.mutateAsync({ id, body: { isActive: true } }),
    retry: () => {
      create.reset();
      update.reset();
      archive.reset();
      void items.refetch();
    },
  };
}
