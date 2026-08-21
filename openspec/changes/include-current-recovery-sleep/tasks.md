## 1. Recovery dataset and contracts

- [x] 1.1 Extend recovery coverage and event-study contracts with required pending-session counts, then update typed fixtures and response-contract tests.
- [x] 1.2 Update the canonical recovery dataset to load sessions through today, admit only a demonstrably complete current-day main sleep, retain that period only after a recovery exposure aligns, and return pending session IDs.
- [x] 1.3 Add focused dataset tests for a completed current-day sleep, an incomplete current-day row, missing wake-day outcomes, an unexposed current sleep, pending recent sessions, expired unaligned sessions, UTC-to-Eastern boundaries, and unchanged historical behavior.

## 2. Service and presentation

- [x] 2.1 Populate activity-specific pending counts in matched-effect and event-study services while preserving matched-pair thresholds, contamination rules, and method versions.
- [x] 2.2 Update recovery coverage and event-study empty states to distinguish pending sleep from failed alignment and explain when a completed current-day sleep entered the analysis.
- [x] 2.3 Add server and client tests for immediate Massage alignment, pending wording, non-pending unaligned wording, current-day window metadata, accessibility, and narrow layouts.

## 3. Verification

- [x] 3.1 Run focused recovery tests, lint, type checks, all Python and dashboard tests, production build, bundle budgets, browser smoke tests, and strict OpenSpec validation.
