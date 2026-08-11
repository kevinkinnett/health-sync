import { useState } from "react";
import { useApiLogStats, useRecentApiCalls } from "../../api/queries";

const PAGE_SIZE = 50;
const MAX_RECENT = 500;

/** Owns API Console server state and recent-request filter interaction. */
export function useApiConsole() {
  const [callerFilter, setCallerFilter] = useState("");
  const [recentLimit, setRecentLimit] = useState(PAGE_SIZE);
  const stats24h = useApiLogStats(24);
  const stats7d = useApiLogStats(7 * 24);
  const recent = useRecentApiCalls(callerFilter || undefined, recentLimit);

  function changeCallerFilter(value: string) {
    setCallerFilter(value);
    setRecentLimit(PAGE_SIZE);
  }

  function loadMore() {
    setRecentLimit((current) => Math.min(MAX_RECENT, current + PAGE_SIZE));
  }

  return {
    callerFilter,
    changeCallerFilter,
    recentLimit,
    loadMore,
    stats24h,
    stats7d,
    recent,
    canLoadMore:
      (recent.data?.length ?? 0) >= recentLimit && recentLimit < MAX_RECENT,
  };
}
