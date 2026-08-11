import { useMemo } from "react";
import type {
  CreateSupplementIntakeBody,
  SupplementIntake,
  SupplementItem,
} from "@health-dashboard/shared";
import {
  useDeleteSupplementIntake,
  useLogSupplementIntake,
  useSupplementIntakes,
  useSupplementItems,
} from "../../api/queries";
import {
  historyRangeStart,
  partitionIntakes,
  type HistoryRange,
} from "../intake/logModel";

export interface SupplementLogState {
  items: SupplementItem[];
  todayIntakes: SupplementIntake[];
  historyIntakes: SupplementIntake[];
  itemsLoading: boolean;
  intakesLoading: boolean;
  itemsError: string | null;
  intakesError: string | null;
  logging: boolean;
  logError: string | null;
  deletingId: number | null;
  logIntake: (body: CreateSupplementIntakeBody) => Promise<SupplementIntake>;
  deleteIntake: (id: number) => Promise<void>;
  resetLogError: () => void;
  retryItems: () => void;
  retryIntakes: () => void;
}

export function useSupplementLog(range: HistoryRange): SupplementLogState {
  const since = useMemo(() => historyRangeStart(range), [range]);
  const items = useSupplementItems();
  const intakes = useSupplementIntakes(since);
  const log = useLogSupplementIntake();
  const remove = useDeleteSupplementIntake();
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
