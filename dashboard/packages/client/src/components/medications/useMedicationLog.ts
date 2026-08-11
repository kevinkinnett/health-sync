import { useMemo } from "react";
import type {
  CreateMedicationIntakeBody,
  MedicationIntake,
  MedicationItem,
} from "@health-dashboard/shared";
import {
  useDeleteMedicationIntake,
  useLogMedicationIntake,
  useMedicationIntakes,
  useMedicationItems,
} from "../../api/queries";
import {
  historyRangeStart,
  partitionIntakes,
  type HistoryRange,
} from "../intake/logModel";

export interface MedicationLogState {
  items: MedicationItem[];
  todayIntakes: MedicationIntake[];
  historyIntakes: MedicationIntake[];
  itemsLoading: boolean;
  intakesLoading: boolean;
  itemsError: string | null;
  intakesError: string | null;
  logging: boolean;
  logError: string | null;
  deletingId: number | null;
  logIntake: (body: CreateMedicationIntakeBody) => Promise<MedicationIntake>;
  deleteIntake: (id: number) => Promise<void>;
  resetLogError: () => void;
  retryItems: () => void;
  retryIntakes: () => void;
}

export function useMedicationLog(range: HistoryRange): MedicationLogState {
  const since = useMemo(() => historyRangeStart(range), [range]);
  const items = useMedicationItems();
  const intakes = useMedicationIntakes(since);
  const log = useLogMedicationIntake();
  const remove = useDeleteMedicationIntake();
  const partitioned = useMemo(
    () => partitionIntakes(intakes.data ?? []),
    [intakes.data],
  );

  return {
    items: items.data ?? [],
    todayIntakes: partitioned.today,
    historyIntakes: partitioned.history,
    itemsLoading: items.isLoading,
    intakesLoading: intakes.isLoading,
    itemsError: items.error?.message ?? null,
    intakesError: intakes.error?.message ?? null,
    logging: log.isPending,
    logError: log.error?.message ?? null,
    deletingId: remove.isPending ? (remove.variables ?? null) : null,
    logIntake: (body) => log.mutateAsync(body),
    deleteIntake: (id) => remove.mutateAsync(id),
    resetLogError: log.reset,
    retryItems: () => void items.refetch(),
    retryIntakes: () => void intakes.refetch(),
  };
}
