## Context

See `proposal.md` for the user-facing problem. The canonical recovery dataset currently gives every health source the same end date, yesterday in `America/New_York`. This is correct for running daily totals but too broad for an overnight session that has an explicit end instant. Both matched recovery effects and event studies consume this dataset, so the freshness rule must stay in that shared builder.

The alignment engine already works on UTC instants and assigns a session to the first main sleep beginning after the session ends, within 24 hours. The new rule must preserve that behavior and the existing evidence thresholds.

## Goals / Non-Goals

**Goals:**

- Represent a completed current-wake-date main sleep in the shared recovery dataset.
- Prevent an unexposed current period from entering the control pool.
- Give the API enough information to distinguish pending from failed alignment.
- Keep the result deterministic and covered by timezone-boundary tests.

**Non-Goals:**

- Change ingestion schedules or repair stored sleep records.
- Admit current-day steps, exercise totals, food totals, or other running measures.
- Change matching distance, evidence floors, or causal wording.
- Persist derived alignment state.

## Decisions

### Qualify current sleep from session-completion fields

Today's sleep qualifies only when the chosen main session has parseable start and end instants, the end is later than the start, and total sleep minutes are positive. Google Health fields remain primary, with the existing Eight Sleep fallback used when a main-session boundary is missing.

This is stronger than checking for a wake-date row or a non-null start. Those weaker checks can admit an ingest row while the sleep session is still open. A wall-clock grace period was considered, but it would make tests and results depend on server time and would still guess at completion.

### Retain today's period only after exposure alignment

The builder will form a current-day candidate, align sessions, then remove that period if it contains no recovery sessions. This lets yesterday's Massage or Hot blanket session appear immediately while making it impossible for today's partial context to become an unexposed control.

Keeping every completed current sleep was rejected because a current unexposed night could affect matched controls before all wake-day context has settled.

### Load recent sessions through today and expose pending IDs

The canonical dataset will load recovery sessions through the current local date. After alignment, it will classify a recent unaligned session as pending when no completed sleep after it exists yet and its local session date is today or yesterday. Older unaligned sessions remain unaligned rather than pending.

The dataset will expose pending session IDs internally. Recovery effects will add `pendingSessions` to each activity's coverage. The event-study response will add the selected activity's pending count and total logged session count so its empty state can distinguish no history, a genuinely pending session, and an older failed alignment. This avoids duplicating timestamp logic in UI components.

### Make the analysis window reflect admitted periods

The returned recovery window ends today only when an exposed completed current-day period is retained. Otherwise it continues to end yesterday. All derived data remains request-time data, so a later ingest correction replaces the provisional current-day result without a migration.

## Risks / Trade-offs

- [A completed sleep row may be corrected later] -> Recompute alignment on every request and keep current-day results descriptive rather than persisting them.
- [A recent session can remain pending after a missing ingest] -> Stop calling it pending after the recent today-or-yesterday window and report it as unaligned.
- [A new current-day measurement regime can narrow historical comparisons] -> Continue using the existing latest-regime rule only after the sleep passes the stricter completion test.
- [API contract expansion affects fixtures] -> Make the new counts required and update typed server, client, and browser fixtures together.

## Migration Plan

Deploy the server and client together in the existing image. No database migration or backfill is needed. Rollback restores the previous yesterday-only analysis window; stored sessions and sleep records are unchanged.
