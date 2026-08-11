# Vitalis health data workspace

Vitalis is a private health-data workspace: Windmill jobs ingest data from
Google Health, Eight Sleep, and Tesla into PostgreSQL; an Express API turns
that data into health summaries and analyses; and a React dashboard presents
daily readiness, trends, interventions, and experiments.

The product is organized around four user jobs:

- **Today** — understand current readiness and the few signals that matter now.
- **Explore** — inspect a health metric or intake history in detail.
- **Changes** — review interventions, correlations, experiments, and insights.
- **Log** — record supplements and medications.

Operational and administrative screens live under **System**. Detailed metric
screens are selected from the Explore picker rather than occupying permanent
navigation space.

Google Health is the sole Fitbit-device ingestion API. Existing database
tables whose names begin with `fitbit_` are retained temporarily as an internal
storage contract; they do not indicate that the retired Fitbit Web API is
still queried.

Vitalis keeps measurement provenance explicit: **Fitbit device** identifies
the physical sensor, while **Google Health** identifies the provider/API that
delivered those measurements. Pipeline status becomes stale five hours after
the last successful run (the four-hour schedule plus one hour of grace).
Daily metrics also have independent freshness policies; sparse weight and
exercise measurements are reported as event-driven rather than falsely stale.

## Repository map

```text
dashboard/
  packages/client/    React, Vite, TanStack Query, charting, and PWA shell
  packages/server/    Express composition root, controllers, services, repos
  packages/shared/    Types shared across the HTTP boundary
ingest_*.py           Windmill ingestion entry points
google_health_points.py
                      Pure Google Health point normalization
google_health_capture.py
                      Testable API pagination and raw-point persistence
dashboard/packages/server/migrations/  Versioned, transactional schema migrations
tests/                Dependency-free Python unit tests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, design decisions, and
the prioritized technical-debt list.

## Dashboard development

The dashboard uses pnpm workspaces and Node.js 24. From `dashboard/`:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @health-dashboard/server migrate
```

The API defaults to port `3001`; the Vite development server proxies `/api` to
it. For a live-data UI pass without a local API, set `VITE_API_PROXY_TARGET` to
the deployed API origin before starting Vite. Server configuration is
environment-based. Database variables include
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`; `USER_TIMEZONE`
defaults to `America/New_York`.

Run the ingestion normalization tests from the repository root:

```bash
python -m unittest discover -s tests -v
```

When deploying `ingest_google_health.py` to Windmill, deploy its helper modules
as `u.kevin.google_health_points`, `u.kevin.google_health_capture`, and
`u.kevin.google_health_rollups` first. The explicit workspace imports keep
production dependencies visible while the helpers remain locally testable
without Windmill credentials.
