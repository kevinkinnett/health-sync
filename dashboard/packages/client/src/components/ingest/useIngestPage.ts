import { useMemo, useState } from "react";
import { useHealthCheck, useIngestOverview, useTriggerIngest } from "../../api/queries";
import {
  normalizeIngestOverview,
  type NormalizedIngestOverview,
} from "./ingestModel";

export interface IngestPageState {
  data: NormalizedIngestOverview;
  expandedJobs: Set<string>;
  isLoading: boolean;
  hasLoadFailure: boolean;
  hasPartialFailure: boolean;
  isRefreshing: boolean;
  databaseStatus: "checking" | "online" | "offline";
  triggeredSchedulePath: string | null;
  triggerJobId: string | null;
  triggerError: string | null;
  isTriggering: boolean;
  refresh: () => void;
  retry: () => void;
  toggleJob: (jobId: string) => void;
  triggerSchedule: (schedulePath: string) => Promise<void>;
}

export function useIngestPage(): IngestPageState {
  const overview = useIngestOverview();
  const health = useHealthCheck();
  const trigger = useTriggerIngest();
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(() => new Set());
  const [triggeredSchedulePath, setTriggeredSchedulePath] = useState<string | null>(
    null,
  );
  const data = useMemo(
    () => normalizeIngestOverview(overview.data),
    [overview.data],
  );

  const triggerSchedule = async (schedulePath: string) => {
    trigger.reset();
    setTriggeredSchedulePath(schedulePath);
    try {
      await trigger.mutateAsync();
    } catch {
      // The mutation state exposes the error to the selected schedule card.
    }
  };

  return {
    data,
    expandedJobs,
    isLoading: overview.isLoading,
    hasLoadFailure: overview.isError && !overview.data,
    hasPartialFailure: overview.isError && Boolean(overview.data),
    isRefreshing: overview.isFetching,
    databaseStatus: health.isLoading
      ? "checking"
      : health.data?.dbConnected === true
        ? "online"
        : "offline",
    triggeredSchedulePath,
    triggerJobId: trigger.data?.jobId ?? null,
    triggerError: trigger.error?.message ?? null,
    isTriggering: trigger.isPending,
    refresh: () => void overview.refetch(),
    retry: () => void overview.refetch(),
    toggleJob: (jobId) => {
      setExpandedJobs((current) => {
        const next = new Set(current);
        if (next.has(jobId)) next.delete(jobId);
        else next.add(jobId);
        return next;
      });
    },
    triggerSchedule,
  };
}
