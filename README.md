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

## Repository map

```text
dashboard/
  packages/client/    React, Vite, TanStack Query, charting, and PWA shell
  packages/server/    Express composition root, controllers, services, repos
  packages/shared/    Types shared across the HTTP boundary
ingest_*.py           Windmill ingestion entry points
google_health_points.py
                      Pure Google Health point normalization
tests/                Dependency-free Python unit tests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for boundaries, design decisions, and
the prioritized technical-debt list.

## Dashboard development

The dashboard uses pnpm workspaces and Node.js. From `dashboard/`:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
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

When deploying `ingest_google_health.py` to Windmill, deploy
`google_health_points.py` as `u.kevin.google_health_points` first. The explicit
workspace import keeps the production dependency visible while the helper
itself remains locally testable without Windmill credentials.
