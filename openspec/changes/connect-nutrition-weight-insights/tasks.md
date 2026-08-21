## 1. Shared report contract and calculations

- [x] 1.1 Add shared nutrition-and-weight report types for joined daily rows, logging coverage, weight observations and trend, and analytic readiness metadata.
- [x] 1.2 Implement pure local-day join, coverage, daily median, seven-day rolling median, gated 7-day and 30-day change, and readiness calculations with unit tests for missing and provisional days.

## 2. Google Health weight fidelity

- [x] 2.1 Extend the Google Health temporal helper or weight rollup adapter to resolve the source-local measurement clock time without changing canonical date semantics.
- [x] 2.2 Write weight time into the existing compatibility row during upsert and add Python tests for civil time, offset fallback, and absent time.

## 3. Server use case and API

- [x] 3.1 Add a focused nutrition-and-weight report service with narrow food, activity, weight, and training reader ports, then compose it without duplicating training-load rules.
- [x] 3.2 Delegate the report through `HealthDataService` and add the controller route using the existing inclusive date-range and user-timezone helpers.
- [x] 3.3 Add the versioned read-only endpoint so the generated AI health-tool registry exposes the same report, while preserving existing `/food` and `/weight` behavior.
- [x] 3.4 Add server tests for joined rows, estimated energy gap nullability, coverage gates, trend gates, current-day exclusion, API validation, and tool registration.

## 4. Client presentation

- [x] 4.1 Add the cached client query and reusable energy summary, collection-readiness, and weight-trend components with accessible loading, empty, and sparse-data states.
- [x] 4.2 Rework Nutrition to lead with logging coverage and calories in versus estimated calories out, keep protein and fiber prominent, and place secondary nutrients in a compact detail section.
- [x] 4.3 Rework Weight to show raw observations, preferred units, rolling median, cadence, gated changes, and aligned energy and training context without implying causation.
- [x] 4.4 Add Nutrition to the Analytics Overview metric links and retain all existing analytics routes.

## 5. Fixtures and regression coverage

- [x] 5.1 Extend server and client fixtures with complete, missing, provisional, multiple-weight, and collecting-data examples.
- [x] 5.2 Add component tests for Nutrition and Weight report states, overview navigation, unit conversion, missing-day rendering, and non-causal copy.
- [x] 5.3 Update smoke and visual browser coverage for the redesigned Nutrition and Weight pages without overwriting unrelated snapshots.

## 6. Verification

- [x] 6.1 Run the Google Health Python tests and the dashboard server and client test suites; fix failures caused by this change.
- [x] 6.2 Run lint, type checks, the production build, and relevant browser tests, then validate the OpenSpec change in strict mode.
