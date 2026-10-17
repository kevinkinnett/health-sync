import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  InsightGeneration,
  InsightGenerationSummary,
  InsightJob,
} from "@health-dashboard/shared";
import {
  useDeleteInsightGeneration,
  useInsightGeneration,
  useInsightGenerations,
  useInsightJob,
  useStartInsightGeneration,
} from "../../api/queries";

export const INSIGHT_JOB_STORAGE_KEY = "vitalis.insights.job";

export interface PersistedInsightJob {
  jobId: string;
  startedAt: string;
}

type StorageReader = Pick<Storage, "getItem">;

export function readPersistedInsightJob(
  storage: StorageReader | null,
): PersistedInsightJob | null {
  const raw = storage?.getItem(INSIGHT_JOB_STORAGE_KEY);
  if (!raw) return null;

  try {
    const candidate: unknown = JSON.parse(raw);
    if (
      typeof candidate === "object" &&
      candidate !== null &&
      "jobId" in candidate &&
      typeof candidate.jobId === "string" &&
      candidate.jobId.length > 0 &&
      "startedAt" in candidate &&
      typeof candidate.startedAt === "string" &&
      candidate.startedAt.length > 0
    ) {
      return { jobId: candidate.jobId, startedAt: candidate.startedAt };
    }
  } catch {
    // A corrupt browser value should not prevent the Insights page loading.
  }

  return null;
}

export interface InsightReportsState {
  activeSummary?: InsightGenerationSummary;
  detail?: InsightGeneration;
  generations: InsightGenerationSummary[];
  inFlight: boolean;
  isLoading: boolean;
  /** True from the click until the job is visibly running — every Generate button must be disabled while set. */
  isStarting: boolean;
  /** Why the last Generate/Regenerate request failed, if it did. Cleared on the next attempt. */
  startError: string | null;
  job?: InsightJob;
  resolvedIndex: number;
  deleteActive: () => Promise<void>;
  regenerate: () => Promise<void>;
  selectNewer: () => void;
  selectOlder: () => void;
}

export function useInsightReports(): InsightReportsState {
  const list = useInsightGenerations();
  const queryClient = useQueryClient();
  const [activeGenerationId, setActiveGenerationId] = useState<string | null>(
    null,
  );
  const [persistedJob, setPersistedJob] = useState<PersistedInsightJob | null>(
    () =>
      readPersistedInsightJob(
        typeof localStorage === "undefined" ? null : localStorage,
      ),
  );

  const jobQuery = useInsightJob(persistedJob?.jobId ?? null);
  const start = useStartInsightGeneration();
  const remove = useDeleteInsightGeneration();
  const refetchGenerations = list.refetch;

  useEffect(() => {
    if (!jobQuery.data) return;
    if (
      jobQuery.data.status !== "completed" &&
      jobQuery.data.status !== "failed"
    ) {
      return;
    }

    const finishedJobId = persistedJob?.jobId ?? null;
    // Poll completion is an external event that synchronizes local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersistedJob(null);
    localStorage.removeItem(INSIGHT_JOB_STORAGE_KEY);
    setActiveGenerationId(null);
    if (finishedJobId) {
      queryClient.removeQueries({
        queryKey: ["insights", "job", finishedJobId],
      });
    }
    void refetchGenerations();
  }, [
    jobQuery.data,
    persistedJob?.jobId,
    queryClient,
    refetchGenerations,
  ]);

  useEffect(() => {
    if (!persistedJob || !jobQuery.error) return;

    const orphanedJobId = persistedJob.jobId;
    // A failed poll means the server-side job no longer exists.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPersistedJob(null);
    localStorage.removeItem(INSIGHT_JOB_STORAGE_KEY);
    queryClient.removeQueries({
      queryKey: ["insights", "job", orphanedJobId],
    });
  }, [jobQuery.error, persistedJob, queryClient]);

  const generations = list.data ?? [];
  const activeIndex = activeGenerationId
    ? generations.findIndex(
        (generation) => generation.generationId === activeGenerationId,
      )
    : -1;
  const resolvedIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeSummary = generations[resolvedIndex];
  const detailQuery = useInsightGeneration(activeSummary?.generationId ?? null);
  const inFlight =
    jobQuery.data?.status === "running" ||
    jobQuery.data?.status === "pending";

  // A ref, not state: two clicks in the same frame both see the stale
  // `isPending`, and each would start a separate billed generation job.
  const startingRef = useRef(false);
  const [startError, setStartError] = useState<string | null>(null);
  // Between the POST resolving and the first job poll landing, nothing
  // is "in flight" yet — count that gap as starting so the button stays
  // disabled.
  const awaitingFirstPoll = persistedJob != null && jobQuery.data == null && !jobQuery.error;

  const regenerate = async () => {
    if (startingRef.current || inFlight || awaitingFirstPoll) return;
    startingRef.current = true;
    setStartError(null);
    let result: Awaited<ReturnType<typeof start.mutateAsync>>;
    try {
      result = await start.mutateAsync();
    } catch (error) {
      setStartError(
        error instanceof Error ? error.message : "The analysis could not be started.",
      );
      return;
    } finally {
      startingRef.current = false;
    }
    const nextJob: PersistedInsightJob = {
      jobId: result.jobId,
      startedAt: new Date().toISOString(),
    };
    localStorage.setItem(
      INSIGHT_JOB_STORAGE_KEY,
      JSON.stringify(nextJob),
    );
    setPersistedJob(nextJob);
  };

  const deleteActive = async () => {
    if (!activeSummary) return;
    await remove.mutateAsync(activeSummary.generationId);
    setActiveGenerationId(null);
  };

  const selectOlder = () => {
    const next =
      generations[Math.min(generations.length - 1, resolvedIndex + 1)];
    if (next) setActiveGenerationId(next.generationId);
  };

  const selectNewer = () => {
    const next = generations[Math.max(0, resolvedIndex - 1)];
    if (next) setActiveGenerationId(next.generationId);
  };

  return {
    activeSummary,
    detail: detailQuery.data,
    generations,
    inFlight,
    isLoading: list.isLoading,
    isStarting: start.isPending || awaitingFirstPoll,
    startError,
    job: jobQuery.data,
    resolvedIndex,
    deleteActive,
    regenerate,
    selectNewer,
    selectOlder,
  };
}
