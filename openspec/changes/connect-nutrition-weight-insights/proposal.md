## Why

Food and weight now arrive reliably from Google Health, but the dashboard presents them as isolated raw series. The user cannot see whether logging is complete, how intake compares with estimated expenditure, or whether body weight is moving beyond normal day-to-day noise.

## What Changes

- Add a joined energy-and-weight analysis that aligns logged nutrition, estimated calories out, workouts, and body weight by local calendar date.
- Report logging coverage and treat absent or partial food logging as unknown rather than zero intake.
- Add smoothed weight trend, short-window change, measurement cadence, and data-collection gates instead of interpreting raw scale movement.
- Rework the Nutrition and Weight pages around the joined analysis while retaining detailed nutrient views and unit preferences.
- Preserve Google weight measurement time when the source provides it.
- Gate relationship and experiment claims until the series has enough food coverage and weight observations. Do not add raw daily calorie-to-weight correlations.
- Add Nutrition to the analytics overview navigation and expose the joined report to the read-only API and AI tool registry.

## Capabilities

### New Capabilities

- `nutrition-weight-insights`: Defines coverage-aware nutrition, energy-balance, and body-weight trend reporting, including collection gates and honest missing-data treatment.

### Modified Capabilities

None.

## Impact

- Google Health weight rollup and its tests.
- Provider-neutral health repositories and `HealthDataService` collaborators.
- Shared API contracts, REST endpoint definitions, and generated AI health tools.
- Nutrition, Weight, and Analytics Overview client pages and their tests.
- Dashboard server, client, and end-to-end fixtures.
- No external dependency or destructive database migration is required.
