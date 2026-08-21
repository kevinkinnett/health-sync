## 1. Persistence and contracts

- [x] 1.1 Add an idempotent recovery-schema migration with activity, session, and pending-action tables, indexes, constraints, and seeded Hot blanket and Massage activities; update migration schema fixtures and tests.
- [x] 1.2 Add and export shared recovery activity, session, pending-action, request, and effect-result contracts.
- [x] 1.3 Extend server timezone helpers to normalize local date-times and reject nonexistent or ambiguous daylight-saving inputs; add EST, EDT, spring-forward, and fall-back tests.
- [x] 1.4 Implement the recovery repository for activity management, timezone-bounded session queries, session CRUD, and transactional pending-action state changes.
- [x] 1.5 Implement recovery activity and session services with default-duration, category-specific detail, provenance, range, and archive validation.
- [x] 1.6 Add recovery controllers, routes, application wiring, validation/error behavior, and API tests for activity and session operations.

## 2. Manual recovery logging

- [x] 2.1 Add React Query hooks for recovery activities and sessions with mutation-driven invalidation of session and effect queries.
- [x] 2.2 Build the Recovery page with Log and Library tabs, quick-log cards, editable session confirmation, today's entries, range-filtered history, activity editing, and archive controls.
- [x] 2.3 Add the Recovery route and Log navigation entry with responsive desktop and mobile behavior.
- [x] 2.4 Add client tests for quick logging, activity-specific fields, validation, past-session entry, history editing, deletion, and local-time display.

## 3. Chat-assisted logging

- [x] 3.1 Add read-only v1 endpoints for recovery activities and sessions and verify they generate `query_recovery_*` health tools.
- [x] 3.2 Implement the separate `prepare_log_recovery_session` action registry and pending-action service with activity resolution, timezone normalization, expiry, cancellation, confirmation overrides, and idempotent confirmation.
- [x] 3.3 Extend AI chat orchestration and persistence so action tools are dispatched separately from read tools and pending actions are returned and replayed with conversations.
- [x] 3.4 Update the chat prompt and tests so missing duration or ambiguous activity/time produces a follow-up instead of guessed data.
- [x] 3.5 Add chat confirmation cards and API hooks that allow edit, confirm, cancel, reload, and retry while showing the explicit America/New_York timestamp.
- [x] 3.6 Add server and client tests proving preparation does not create a session, confirmation creates one `ai_chat` session, retries do not duplicate it, and cancelled or expired actions cannot run.

## 4. Recovery effects

- [x] 4.1 Build and test a pure session-to-sleep alignment function using main-sleep timestamps, including evening, after-midnight, missing-sleep, 24-hour-bound, and combined-exposure cases.
- [x] 4.2 Implement and test the matched-period recovery-effect engine with no-replacement controls, required covariates, per-outcome missing-data handling, bootstrap intervals, evidence labels, and the 10-pair threshold.
- [x] 4.3 Add the recovery-effects orchestration service and versioned response, loading recovery sessions, sleep, heart rate, HRV, Eight Sleep restlessness, readiness, and recent training load.
- [x] 4.4 Expose recovery effects through the application API and read-only v1 tool registry with contract and integration tests.
- [x] 4.5 Add a Recovery effects section to Relationships with coverage progress, effect cards, sample counts, timing explanation, uncertainty, and non-causal wording; add responsive UI tests.

## 5. Verification

- [x] 5.1 Run focused server, client, migration, timezone, chat, and analysis tests and fix all failures.
- [x] 5.2 Run repository-wide lint, type-check, test, and production-build commands required by CI.
- [x] 5.3 Validate the OpenSpec change strictly and confirm every requirement scenario has test or implementation coverage.
