import type { QueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Cache invalidation helpers
// ---------------------------------------------------------------------------
//
// Every "domain" mutation needs to tell React Query which cached queries
// are now stale. Doing this per-mutation is how the dashboard avoids
// going stale-screen-by-stale-screen as new charts get added.
//
// A supplement intake doesn't just affect the supplements page — it
// changes adherence, intake-by-day, ingredient rollups, and every
// correlation pair on the analytics screen. They all live under
// different query-key prefixes (`["supplements", …]` vs
// `["analytics", "supplements", …]`); the helpers below invalidate the
// whole blast radius in one call.
//
// Rule of thumb: any mutation that touches a domain should call the
// matching helper rather than inline `invalidateQueries`. Over-
// invalidation is cheap (refetches happen lazily on next access);
// under-invalidation forces the user to hit refresh.

export function invalidateSupplements(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["supplements"] });
  qc.invalidateQueries({ queryKey: ["analytics", "supplements"] });
}

export function invalidateMedications(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["medications"] });
  qc.invalidateQueries({ queryKey: ["analytics", "medications"] });
}

/**
 * After a fresh ingest run, every health-metric series, weekly insight,
 * records leaderboard, day-of-week heatmap, and analytics correlation is
 * potentially stale (correlations consume health data too).
 */
export function invalidateAfterIngest(qc: QueryClient): void {
  qc.invalidateQueries({ queryKey: ["ingest"] });
  qc.invalidateQueries({ queryKey: ["health"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
}
