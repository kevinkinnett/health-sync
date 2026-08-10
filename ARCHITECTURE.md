# Architecture and improvement plan

## System boundaries

```text
External providers -> Windmill ingestion -> PostgreSQL universe.*
                                           |
Browser -> React client -> Express routes -> controllers -> services -> repositories
                         shared request/response TypeScript types
```

`dashboard/packages/server/src/createApp.ts` is the composition root. It is the
only place that should know all concrete repositories, services, controllers,
and routes. `index.ts` owns process concerns: environment configuration, the
database pool, and listening on a port.

The intended request path is:

1. A route validates HTTP shape and delegates to a controller.
2. A controller translates HTTP input/output only.
3. A service owns application rules and cross-domain coordination.
4. A repository owns PostgreSQL queries and row mapping.

Shared types define the compile-time API boundary. High-risk dashboard
responses also pass Zod schemas in the controller, making the deployed boundary
executable. Response changes are additive for at least one deployment window:
the server emits both old and new fields until cached PWA clients have had a
chance to update. Removing or changing a field requires a new endpoint version.

The client compares its build stamp with the uncached `/api/version` response.
If commits differ during a rolling deployment, route content is gated and the
user is prompted to activate the new service-worker build. An unidentified old
server remains usable, because absence of version metadata is not proof of an
incompatible contract.

## SOLID assessment

The project already has useful controller/service/repository separation and a
testable composition root. The main pressure points are class size and concrete
dependencies, not a need to introduce a framework or a container.

The first dependency-inversion slice is
`services/analytics/ports.ts`. `AnalyticsService` now asks for six narrow,
read-only capabilities instead of six concrete PostgreSQL repository classes.
Concrete repositories still satisfy those interfaces structurally. This makes
the service's actual needs explicit and gives tests small seams without adding
runtime machinery.

The summary and readiness paths are now focused use cases under
`services/health/`. They consume small `findLatest` capabilities and own their
respective assembly rules; `HealthDataService` remains a stable facade for
controllers while delegating scoring, summary construction, records, heatmaps,
weekly insights, and correlations.

The Google Health parser is isolated in `google_health_points.py`. API
pagination and raw persistence live behind separate collaborators in
`google_health_capture.py`, with no Windmill or run-tracking dependency. The
entry point coordinates those collaborators and a dedicated rollup writer;
validated rollup SQL remains physically co-located until its Windmill module
can be deployed atomically with the import change.

Ingestion observability follows that same provider boundary. Run history is
filtered to `google_health`, and historical coverage is derived from
`google_health_data_point` rather than the retired Fitbit ingest-state table.
The `fitbit_*` daily tables remain a storage-compatibility seam until versioned
migrations can rename them without breaking dashboard queries.

Provenance separates the physical sensor from the transport. Readiness still
compares the Fitbit wrist device with the Eight Sleep mattress, but API
responses identify that Fitbit-device measurements arrived through Google
Health. A service-owned freshness policy marks Google Health stale after five
hours without a successful run: the four-hour cadence plus one hour of grace.
The scheduled alert evaluator checks this every two hours. A persisted monitor
state emits one warning when ingestion becomes stale and one recovery notice
when it becomes healthy again; both flow through the same dashboard-controlled
Apprise policy as biometric alerts.

Versioned schema changes live under `dashboard/packages/server/migrations/`.
`20260809_retire_fitbit_ingest_state.sql` transactionally renames the obsolete
Fitbit Web API state table to a read-only archive. It is idempotent and refuses
to proceed if active and retired names both exist. The deployment entry point
runs pending files under an advisory lock, verifies immutable checksums, and
records each migration in the same transaction as its SQL. Repositories never
create or alter tables during application construction.

## UI decisions

The dashboard shell follows a workflow-first information architecture:

- A compact permanent navigation covers Today, Explore, Changes, Log, and
  System workflows.
- Detailed analytics live in one Explore picker, avoiding a sidebar with a
  route for every metric.
- Today is a briefing, not a second analytics catalog. It loads readiness,
  summary signals, goals, and supporting insights; detailed charts stay in
  Explore.
- Global date controls appear only where the route consumes them.
- Loading, full-page failure, partial-data, and retry states use shared UI
  primitives and disclose what is actually unavailable.
- Settings reports live API/database state. Windmill is labeled as externally
  managed, and database credentials are explicitly not exposed to the browser.
- Fonts and symbols are bundled locally so the installed PWA does not rely on
  Google Fonts being reachable.
- Page modules are lazy-loaded so charting and insight code are downloaded only
  when those routes are opened.
- CI builds the production client and enforces budgets for the initial entry,
  largest lazy chunk, total JavaScript, and stylesheets. Dependency growth must
  therefore be an explicit threshold decision rather than an invisible deploy.

## Guardrails

- Keep `createApp.ts` as the concrete wiring boundary.
- Prefer capability interfaces at the consuming service, not large generic
  repository interfaces.
- Keep health calculations pure where practical and cover boundary dates,
  timezones, missing data, and minimum sample sizes.
- Never represent an unverified external service as connected.
- Treat partial provider data as a first-class UI state; do not turn it into a
  zero value or an empty success state.
- New top-level navigation requires a distinct user workflow. New metrics
  belong in Explore by default.

## Prioritized technical debt

1. **Move validated Google Health rollup SQL into its own module.** API
   pagination and raw persistence are now separate testable collaborators, and
   rollup execution has its own writer boundary. Move the already-validated SQL
   physically only when the Windmill module deployment can land atomically with
   the import change; preserve current idempotent and monotone-write behavior.

These are incremental seams, not a call to rewrite. Each extraction should land
with a test that demonstrates the preserved behavior.
