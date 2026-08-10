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

The Google Health parser is similarly isolated in `google_health_points.py`.
It has one responsibility—normalizing and keying a point—and no network,
database, or Windmill imports. The ingestion entry point retains orchestration,
retry, persistence, and rollup responsibilities for now.

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

The first versioned schema retirement lives under `database/migrations/`.
`20260809_retire_fitbit_ingest_state.sql` transactionally renames the obsolete
Fitbit Web API state table to a read-only archive. It is idempotent and refuses
to proceed if active and retired names both exist.

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

1. **Move schema evolution out of repositories.** Several repositories call
   `ensureTables()` during application boot. Replace these with versioned,
   transactional migrations run as a deployment step. Until that migration is
   complete, repository startup DDL remains intentionally visible in
   `createApp.ts`.
2. **Split `HealthDataService` by use case.** It coordinates many repositories.
   Extract summary, correlation, and comparison use cases behind narrow input
   ports as each area changes, instead of doing a high-risk wholesale rewrite.
3. **Decompose Google Health ingestion further.** Separate API pagination,
   raw persistence, and rollup SQL into testable collaborators. Preserve the
   current idempotent and monotone-write behavior during that work.
4. **Add contract tests at the API boundary.** Validate representative server
   responses against the shapes the React query layer expects, especially the
   Today summary and partial-data cases.
5. **Measure route payloads in CI.** Route splitting is in place; add a small
   bundle-budget check so chart or icon dependencies cannot silently return to
   the initial bundle.

These are incremental seams, not a call to rewrite. Each extraction should land
with a test that demonstrates the preserved behavior.
