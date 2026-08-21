## Context

The dashboard already has separate repository, service, controller, shared-contract, React Query, and page layers for medication and supplement intake logs. Its intervention model represents dated changes and experiments, while the workout-effect engine represents repeat exposures. AI Insights currently builds its tool set from read-only v1 endpoints and has no user-confirmed mutation mechanism. The application stores instants in PostgreSQL `TIMESTAMPTZ` and uses an IANA user timezone for local-day behavior.

See `proposal.md` for motivation and the three delta specs for observable requirements.

## Goals / Non-Goals

**Goals:**

- Keep recovery sessions independent from Google Health and the intervention timeline.
- Reuse the established layered architecture and logging interaction patterns without forcing recovery data into medication dose fields.
- Make chat-assisted writes reviewable, idempotent, and recoverable from client retries.
- Align each session with the sleep period that follows it rather than assuming every outcome is on calendar day D+1.
- Produce useful collection feedback before there is enough data for an estimate.

**Non-Goals:**

- Export recovery sessions to Google Health.
- Diagnose illness or claim that a session caused a health change.
- Predict future health measurements.
- Estimate duration, temperature, intensity, or massage-type dose response in the first version.
- Turn every recovery session into an intervention or experiment.

## Decisions

### Use a recovery activity and session model

Add a `recovery` schema with `activity`, `session`, and `pending_action` tables.

`recovery.activity` will contain a stable unique code, editable display name, category, optional default duration, notes, active status, and timestamps. Categories will be `heat_therapy`, `massage`, and `other`. The migration will seed `hot_blanket` and `massage` by stable code with conflict-safe inserts.

`recovery.session` will contain the activity reference, `started_at TIMESTAMPTZ`, positive `duration_minutes`, optional intensity constrained to 1 through 5, nullable `temperature_f`, nullable `massage_type`, notes, provenance constrained to `manual` or `ai_chat`, and timestamps. Service validation will allow temperature only for heat therapy and massage type only for massage. Dedicated typed columns keep the first supported details queryable and avoid an unvalidated JSON property bag.

An item-plus-occurrence model follows the medication and supplement pattern while giving recovery sessions their own vocabulary and validation. Hard-coding two session kinds in one table would be smaller, but adding another recovery activity would then require a code and schema change.

### Store instants in UTC and resolve local input at the boundary

APIs will store and return ISO instants. The manual browser form will convert its local date-time input to an ISO instant before submission. Chat actions will carry a local wall-clock value plus the configured IANA timezone until the server normalizes them.

A server time conversion helper will resolve a local date-time using IANA timezone rules, round-trip the result, and reject nonexistent daylight-saving times. If a fall-back transition makes the input ambiguous and the request does not identify an offset, chat will ask the user to clarify. Date filters will use timezone-aware day-start and day-end bounds. No code will use a fixed EST offset or derive local dates by slicing an ISO string.

### Keep read tools and pending write actions separate

The v1 registry will gain read-only endpoints for recovery activities, sessions, and effects. Those endpoints will automatically become `query_recovery_*` AI tools under the current health-tool builder.

A separate chat-action registry will define `prepare_log_recovery_session`. Its executor may create a pending-action record, but it cannot create a recovery session. The chat service will pass both registries to the model, dispatch by registry, and return any pending actions created during the turn alongside the assistant message.

The system prompt will tell the model to use the preparation action only after resolving activity, time, and duration. It will ask a follow-up when required values remain ambiguous. This preserves the existing read-only health registry and makes the write boundary easy to audit.

Direct model writes were rejected because retries and repeated tool calls can duplicate records, and because a natural-language date can be misread without a visible local-time confirmation.

### Persist pending actions and confirm them transactionally

`recovery.pending_action` will store a UUID, conversation identifier, normalized proposed payload, status, optional resulting session identifier, creation time, and expiry time. Pending actions will expire after 24 hours.

The chat interface will render each pending action as a compact confirmation card with Edit, Log session, and Cancel controls. Confirmation may submit validated field overrides. The service will lock the pending row in a transaction, create the session and mark the action confirmed atomically. A retry of a confirmed action will return the existing session. Cancelled or expired actions cannot be confirmed.

This design adds a small table, but it makes confirmation work across page reloads and protects against network retries. Keeping pending actions only in React state would lose them on reload and provide no server-side idempotency.

### Build Recovery as a focused logging page

Add `/recovery` under the Log navigation with Log and Library tabs. The Log tab will show quick-log cards, a session confirmation form, today's sessions, and range-filtered history. The Library tab will edit activity defaults and archive activities without changing old sessions.

The page will reuse visual and state patterns from medication and supplement logging. Session-specific form and timeline components will remain separate because duration, intensity, temperature, and massage type do not map cleanly onto amount and unit fields. Shared generic loading, error, range, and empty-state helpers can be extracted when they reduce duplication.

### Align effects to actual sleep timestamps

Create a pure recovery-effect engine and a repository-orchestration service. For each recovery session, compute its end instant and select the earliest main sleep whose start occurs after that end and no more than 24 hours later. Use the selected sleep's local wake date for sleep, resting-heart-rate, HRV, restlessness, and readiness outcomes. Sessions without a valid following main sleep timestamp will count toward logging coverage but not effect estimates.

For each activity and outcome, build exposed and unexposed sleep periods. A period with multiple recovery activity types in its pre-sleep window will count as combined exposure and will not enter a single-activity estimate. Controls must have no recovery exposure in the corresponding pre-sleep window.

Match without replacement using wake weekday, date distance, prior sleep, prior resting heart rate, prior HRV, and recent seven-day training load. Reuse the workout engine's statistical helpers for paired differences, block-bootstrap uncertainty intervals, standardized differences, and evidence labels. Publish a distinct method version so future matching changes remain traceable.

The result contract will always return per-activity coverage. It will return estimates only at 10 or more matched pairs. The Relationships page will place Recovery effects beside, but not inside, ordinary Pearson correlations and will explain the sleep-alignment rule.

Naive same-day correlations were rejected because late-evening and after-midnight sessions would attach to different sleep dates, and because the user may select recovery sessions in response to soreness or poor recovery.

### Invalidate dependent views after mutations

Manual and confirmed-chat mutations will invalidate recovery activities, sessions, effects, and AI recovery query caches. The server will compute effects on request from canonical session and health data, matching the current workout-effect approach. No Windmill job is needed for this first version.

## Risks / Trade-offs

- [Sparse massage history can produce unstable estimates] -> Show counts from the first entry and suppress estimates below 10 matched pairs.
- [The user may choose a session because they already feel unwell or sore] -> Match on prior recovery and training covariates and label results as adjusted associations, not causal effects.
- [Multiple pre-sleep recovery activities obscure attribution] -> Exclude combined exposures from single-activity estimates and report their count.
- [Main sleep timestamps may be missing] -> Keep the session in history and coverage while excluding it from outcome alignment.
- [Chat can prepare an incorrect relative time] -> Resolve in the configured timezone and require the user to see and confirm the explicit timestamp.
- [Adding a mutation-capable chat registry increases service complexity] -> Limit it to pending actions, keep health tools read-only, and test dispatch and duplicate confirmation separately.
- [Activity-specific nullable columns do not cover every future recovery activity] -> Keep the category extensible and add typed fields only when a real analysis requires them.

## Migration Plan

1. Apply an additive migration that creates the recovery schema and three tables, indexes session time and activity-time lookups, and seeds Hot blanket and Massage idempotently.
2. Deploy server support before the client. Older clients ignore the new endpoints and tables.
3. Deploy the Recovery page, chat confirmation cards, and Relationships additions.
4. Verify seeded activities, a manual backfill across a local-day boundary, pending-action retry behavior, and an effects response with insufficient-data coverage.

Application rollback only requires deploying the prior image because existing code does not reference the new schema. The additive tables should remain in place during rollback so logged sessions are preserved. Removing them requires a separate, deliberate data migration.
