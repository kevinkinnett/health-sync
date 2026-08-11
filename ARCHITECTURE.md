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

`AnalyticsService` is also a stable facade rather than the owner of every
analytics rule. Focused collaborators under `services/analytics/` own pure
intake calendar calculations, canonical daily metric joins, shared intake use
cases, and the supplement- and medication-specific workflows. Controllers and
the v1 tool API depend on the `AnalyticsUseCases` capability contract, while
the concrete facade is wired only at the composition boundary. Each rule set
can therefore be tested and changed independently.

The summary and readiness paths are now focused use cases under
`services/health/`. They consume small `findLatest` capabilities and own their
respective assembly rules; `HealthDataService` remains a stable facade for
controllers while delegating scoring, summary construction, records, heatmaps,
weekly insights, and correlations.

The dossier workflow follows the same shape. `DossierService` coordinates item
lookup, model resolution, generation, usage accounting, and persistence through
small storage, catalog-reader, and chat-completion capabilities. Pure modules
own prompt policy and response decoding/normalization, while
`CatalogDossierItemReader` adapts the supplement and medication repositories at
the composition root. Prompt changes and malformed model output can therefore
be tested without HTTP, PostgreSQL, or an LLM proxy.

The Google Health parser is isolated in `google_health_points.py`. API
pagination and raw persistence live behind separate collaborators in
`google_health_capture.py`, and validated daily transformations live in
`google_health_rollups.py`; neither has a Windmill or run-tracking dependency.
The `ingest_google_health.py` entry point coordinates those independently
deployable collaborators and owns credentials and run lifecycle only.

Ingestion observability follows that same provider boundary. Run history is
filtered to `google_health`, and historical coverage is derived from
`google_health_data_point` rather than the retired Fitbit ingest-state table.
Dashboard repositories read provider-neutral `health_*` views. The Google
Health rollup writer continues writing the `fitbit_*` physical tables during a
compatibility window; a later physical rename can therefore land behind the
stable views without changing repository queries.

Provenance separates the physical sensor from the transport. Readiness still
compares the Fitbit wrist device with the Eight Sleep mattress, but API
responses identify that Fitbit-device measurements arrived through Google
Health. A service-owned freshness policy marks Google Health stale after five
hours without a successful run: the four-hour cadence plus one hour of grace.
The scheduled alert evaluator checks this every two hours. A persisted monitor
state emits one warning when ingestion becomes stale and one recovery notice
when it becomes healthy again; both flow through the same dashboard-controlled
Apprise policy as biometric alerts.

Metric policy is separate from that pipeline heartbeat. `ingestPolicies.ts`
classifies daily and sparse measurements independently, so an old user-entered
weight does not make an otherwise healthy import look broken. Historical
coverage is provider-aware: most metrics retain the 365-day goal, while SpO₂
uses a 90-day useful-history threshold and is explicitly labeled as limited to
the device history Google Health exposes. Repositories return observations;
the service policy layer decides what those observations mean.

Alerts are persisted as episodes rather than cooldown events. One open row per
kind is refreshed while a condition remains present, including an occurrence
count and last-observed timestamp. A later healthy evaluation resolves it, and
a recurrence after the cooldown becomes a new episode. Pipeline stale/recovery
transitions resolve their opposite state. Read acknowledgement is independent
of resolution and can be applied to one episode or the whole inbox.

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
- The notification bell is a compact recent-event surface. Full alert history
  lives at `/alerts`, separates current episodes from resolved history and
  health signals from pipeline incidents, and attaches a relevant next action
  and acknowledgement control to every event.
- Fonts and symbols are bundled locally so the installed PWA does not rely on
  Google Fonts being reachable.
- Page modules are lazy-loaded so charting and insight code are downloaded only
  when those routes are opened.
- The AI Insights page is a composition boundary. Report-generation polling,
  persistence, and selection live in `components/insights/useInsightReports.ts`;
  chat conversation and optimistic-message state live in
  `components/insights/useInsightChat.ts`. Their tab components own rendering
  and browser interactions, while `pages/Insights.tsx` only owns page-level tab
  selection. This keeps server-state rules independently testable without
  hiding them inside a page-sized component.
- Supplement and medication libraries share the intake-library shell, item
  fields, validation, and payload mapping in `components/intake/`. Focused
  domain hooks own each library's queries and mutations; supplement composition
  remains a supplement-specific rule. Cards expose separate Edit and Dossier
  actions so mouse, keyboard, and assistive-technology users get the same
  interaction model.
- Intake logging follows the same boundary. `components/intake/logModel.ts`
  owns pure history-window, day-partitioning, validation, and payload rules.
  Focused shared components separately own quick selection, dose confirmation,
  timeline/history, retry, and deletion interactions; `IntakeLogUi.ts` is only
  their public export boundary. Medication and supplement hooks adapt their own
  queries and mutations. The medication calendar and supplement composition
  preview remain domain-specific extensions rather than flags in the shared UI.
- Pipeline Status is also a composition boundary. `useIngestPage.ts` owns
  server and interaction state, `ingestModel.ts` normalizes display-ready data,
  and the status/job components own presentation. `pages/Ingest.tsx` only
  composes those pieces, keeping refresh, trigger, freshness, coverage, and job
  history behavior testable without a page-sized component.
- Dossiers use an accessible dialog shell that owns focus trapping, focus
  restoration, escape handling, and scroll locking. Pure content parsing stays
  in `dossierContentModel.ts`; loading, refresh, error, content, and citation
  presentation are separate components. Cached dossier content remains visible
  during background refreshes so a network retry does not erase useful safety
  information.
- The API Console follows the same page-composition boundary. `useApiConsole.ts`
  owns its server state, `apiConsoleModel.ts` owns URL, curl-example, and status
  presentation rules, and focused cards and tables own rendering. The route
  module only composes those capabilities, so usage telemetry and onboarding
  can evolve independently.
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

The remaining provider-specific physical storage rename is deliberately
deferred. Dashboard readers already depend only on stable `health_*` views, so
the remaining coupling is confined to the Google Health rollup writer.

When the rename is justified, use a coordinated maintenance cutover:

1. Centralize the rollup writer's physical table mapping without changing its
   current `fitbit_*` targets, and test every generated upsert target.
2. Pause the Windmill schedule and wait for any active import to finish.
3. Apply one database migration that replaces the `health_*` read views with
   provider-neutral physical tables and creates read-only legacy views where
   possible.
4. Deploy the writer mapping to the new physical targets, run a canary import,
   compare row counts and current dashboard responses, then re-enable the
   schedule.

Do not combine that cutover with metric calculation or API contract changes.
`INSERT ... ON CONFLICT` cannot safely continue through ordinary compatibility
views, so database and writer changes must be treated as one operational unit.
