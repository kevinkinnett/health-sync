import { useQuery } from "@tanstack/react-query";
import type { AppConfig } from "@health-dashboard/shared";
import { apiFetch } from "../client";

/**
 * Fetches the user's IANA timezone (and any future runtime config) from
 * the server. Cached forever in-session — config doesn't change without a
 * server restart, so refetching is wasted effort.
 *
 * Components that need a TZ for date math should prefer this over
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` (which gives the
 * *browser's* zone — wrong if the user is travelling away from their
 * configured home zone).
 */
export function useAppConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => apiFetch("/config"),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Convenience: returns the user's timezone, falling back to the browser's
 * zone while the config is loading and then to UTC if even that fails.
 * Lets call sites be synchronous without juggling a pending state.
 */
export function useUserTimezone(): string {
  const { data } = useAppConfig();
  if (data?.userTimezone) return data.userTimezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
