## Why

Recovery analysis applies the general completed-day cutoff to sleep records, even when today's main sleep has already ended and has stable start, end, and duration values. This delays valid session alignment until the next day and tells the user that no aligned sleep exists when the sleep is already present.

## What Changes

- Admit today's main sleep to recovery analysis when the recorded main session is demonstrably complete.
- Keep incomplete current-day sleep rows and ordinary partial daytime measurements out of recovery comparisons.
- Never use a current-day recovery period as an unexposed control merely because its sleep is complete.
- Distinguish a recent session that is still waiting for a qualifying sleep from a session that could not be aligned.
- Explain current-day inclusion and pending sessions in the recovery UI and API contract.

## Capabilities

### New Capabilities

- `recovery-analysis-freshness`: Defines when completed current-day sleep can enter recovery analysis and how pending session alignment is reported.

### Modified Capabilities

None.

## Impact

The canonical recovery analysis dataset, recovery coverage contracts and service, recovery event-study empty states, and focused server and client tests will change. The ingestion pipeline, stored health records, and existing matched-effect thresholds remain unchanged.
