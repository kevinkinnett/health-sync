## Why

Recovery activities such as massage may occur only once a month, so the existing ten-pair evidence floor can delay all useful feedback for nearly a year. The dashboard should show what happened after each session immediately, then progress toward repeated-pattern and matched-effect evidence without presenting sparse observations as causal conclusions.

## What Changes

- Add a recovery event-study response that aligns each logged session with daily health outcomes before and after the event.
- Show an individual aftermath timeline after the first aligned session, including an expected range derived from comparable unexposed days.
- Overlay and summarize event-aligned trajectories after three or more sessions while keeping recent session trajectories inspectable.
- Add progressive evidence states for individual observations, provisional repeated patterns, matched estimates, and moderate or high confidence.
- Preserve the existing minimum of ten matched pairs before displaying inferential benefit, cost, or unclear conclusions.
- Show total logged duration and the interval between the last session end and sleep for every event.
- Add descriptive outcome-versus-duration views immediately, then estimate a dose-response association only after at least ten eligible events span enough distinct durations.
- Add the same descriptive and gated analysis for elapsed time between the latest session end and sleep, while keeping it separate from duration.
- Link recovery logging directly to its analysis so the effect report is discoverable from the Recovery page.
- Limit attribution-oriented presentation to seven days after a session. Longer windows remain outside this change because confounding overwhelms the available evidence.

## Capabilities

### New Capabilities

- `recovery-event-studies`: Present descriptive per-session and repeated event-aligned recovery trajectories before the matched-effect evidence floor is reached.

### Modified Capabilities

None.

## Impact

- Extends shared recovery contracts and adds a focused recovery event-study API response.
- Adds event-window construction, expected-range calculations, and gated duration-response analysis to the recovery analysis layer.
- Updates the Relationships recovery section and the Recovery page navigation.
- Adds server analysis tests, API contract coverage, and responsive client tests.
- Requires no database migration, background job, or change to canonical health measurements.
