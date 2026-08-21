## 1. Contracts and canonical analysis data

- [x] 1.1 Add and export shared event-study, trajectory-point, aggregate, comparison-range, and progressive evidence-state contracts.
- [x] 1.2 Extract the existing recovery period loading and session-to-sleep alignment into a canonical analysis dataset builder shared by matched effects and event studies.
- [x] 1.3 Add parity tests proving the extraction preserves current-day exclusion, measurement-regime selection, timezone alignment, matched estimates, and the existing method version.

## 2. Event-study analysis

- [x] 2.1 Implement a pure outcome-specific event-window engine for offsets -7 through +7, including same-activity session grouping and explicit missing points.
- [x] 2.2 Implement descriptive selection of up to eight comparable unexposed windows and return expected medians, observed ranges, deltas, and control counts only when at least three values exist.
- [x] 2.3 Mark anchor and follow-up recovery exposures, exclude contaminated points from aggregates, and add focused tests for combined and later exposures.
- [x] 2.4 Implement provisional median trajectories across all eligible events, cap returned individual overlays at the 20 most recent, and assign outcome-specific collecting, individual, provisional, matched, moderate, and high states.
- [x] 2.5 Add engine tests covering one monthly event, three repeated events, sparse controls, missing outcomes, threshold boundaries, native units, and no conclusions below ten matched pairs.

## 3. Server orchestration and API

- [x] 3.1 Implement the event-study orchestration service using the canonical dataset and the existing matched estimate for the selected activity and outcome.
- [x] 3.2 Add validated activity and outcome query handling to the recovery controller and expose the focused read-only event-study endpoint.
- [x] 3.3 Expose the event study through the versioned read-only health API/tool registry and add response-contract, validation, and application-wiring tests.

## 4. Relationships and Recovery UI

- [x] 4.1 Add an outcome-specific React Query hook and preserve recovery mutation invalidation for event-study queries.
- [x] 4.2 Build the responsive event-study panel with activity and outcome controls, individual overlays, expected comparison band, provisional aggregate, missing and contaminated states, and progressive evidence language.
- [x] 4.3 Add a compact accessible event table or equivalent text view containing dates, offsets, actual values, expected comparisons, control counts, and contamination details.
- [x] 4.4 Keep mature matched-effect cards alongside the event study and ensure sparse timelines never display benefit, cost, or unclear conclusions.
- [x] 4.5 Add a `View effects` action on Recovery that opens the anchored Recovery effects section on Relationships.
- [x] 4.6 Add client tests for individual, provisional, and mature states, outcome switching, accessibility, narrow layouts, missing data, contamination, and direct navigation.

## 5. Verification

- [x] 5.1 Run focused recovery engine, service, controller, API-contract, and client tests and fix all failures.
- [x] 5.2 Run repository-wide lint, type-check, tests, production build, bundle-budget checks, and browser smoke tests required by CI.
- [x] 5.3 Validate the OpenSpec change strictly and confirm every requirement scenario has implementation or test coverage.

## 6. Duration and session-to-sleep analysis

- [x] 6.1 Extend shared trajectory and duration-response contracts with total logged minutes, session-to-sleep minutes, duration display group, availability state, robust slope, rank association, uncertainty, and counts.
- [x] 6.2 Extend the pure event-study engine to derive grouped exposure timing and calculate gated Theil-Sen duration slopes, Spearman correlations, and deterministic bootstrap intervals for offsets 0 through +7 across all eligible uncontaminated events.
- [x] 6.3 Add engine and service tests for 25-minute and 60-minute sessions, grouped durations, latest-session sleep gaps, insufficient count, insufficient variation, threshold availability, follow-up contamination, and response metadata.
- [x] 6.4 Add a responsive duration view with recent event points, offset selection, duration display groups, session-to-sleep context, sparse-state explanations, robust trend details, and non-causal wording.
- [x] 6.5 Extend accessible tables and client tests to cover duration, timing, short and long sessions, outcome and offset changes, withheld trends, available trends, and narrow layouts.
- [x] 6.6 Extend shared contracts and the pure event-study engine with gated session-to-sleep timing responses using ten events, three distinct values, a 60-minute range, Theil-Sen slope per hour, Spearman association, and deterministic uncertainty.
- [x] 6.7 Let the exposure-response UI switch between duration and time before sleep, and add server and client tests for sparse timing, insufficient variation, available timing trends, offset changes, and duration-timing separation.
- [x] 6.8 Run focused and repository-wide verification, enforce bundle and browser checks, validate the revised OpenSpec change strictly, and confirm every new scenario has coverage.
