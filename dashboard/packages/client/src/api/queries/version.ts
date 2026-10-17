import { useQuery } from "@tanstack/react-query";
import type { BuildInfo } from "@health-dashboard/shared";
import { apiFetch } from "../client";

/**
 * What the API is running, as opposed to what this bundle is.
 *
 * Short `staleTime` and no long cache on purpose: the value of this query
 * is telling you a deploy landed, so holding a stale answer defeats it.
 * `retry: false` because a failure here is itself informative — the
 * version line should degrade to "client only" rather than spin.
 *
 * Polls on its own interval: a tab left open across a deploy has to notice
 * the API moved on, and this is the one query whose whole job is that.
 */
export function useServerVersion() {
  return useQuery<BuildInfo>({
    queryKey: ["version"],
    queryFn: () => apiFetch("/version"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}
