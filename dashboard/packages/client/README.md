# Vitalis client

The React client is the workflow-focused front end for the Vitalis health-data
workspace. It uses Vite, TanStack Query, React Router, Recharts, Observable
Plot, and Tailwind CSS.

The permanent navigation is defined in `src/components/navigation.ts` and the
analytics picker in `src/components/AnalyticsLayout.tsx`. Keep route modules
lazy in `src/App.tsx`; the analytics screens pull in charting libraries that do
not belong in the initial application shell.

Shared visual primitives live in `src/components/ui`. Pages should distinguish
initial loading, full failure, and partial-data states, and give users a retry
path when a request can be safely repeated.

From the `dashboard` workspace root:

```bash
pnpm --filter @health-dashboard/client dev
pnpm --filter @health-dashboard/client lint
pnpm --filter @health-dashboard/client typecheck
pnpm --filter @health-dashboard/client test
pnpm --filter @health-dashboard/client e2e
pnpm --filter @health-dashboard/client build
```
