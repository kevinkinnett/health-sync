## Context

The current recovery-effect service builds a 700-day sleep-period dataset, aligns sessions to the first subsequent main sleep, and withholds effect estimates below ten no-replacement matched pairs. The Relationships page receives coverage and mature estimates from one endpoint. See `proposal.md` for why low-frequency activities need a descriptive path before that threshold.

The event-study capability must reuse the existing timezone, measurement-regime, outcome, and alignment definitions. A separate implementation that derives dates or sensor values differently would make the early timeline disagree with the later matched estimate.

## Goals / Non-Goals

**Goals:**

- Produce useful per-event context after the first aligned recovery exposure.
- Show repeated temporal patterns after three eligible events without assigning inferential confidence.
- Preserve the current matched-effect thresholds and non-causal language.
- Keep event-study calculations pure and independently testable.
- Bound response size and chart complexity for frequent activities.
- Preserve logged duration and session-to-sleep timing so short and long exposures can be compared.
- Estimate duration-response associations only after the observed durations support the calculation.
- Estimate session-to-sleep timing associations separately when the observed timing range supports the calculation.

**Non-Goals:**

- Add subjective stress, pain, soreness, or relaxation surveys.
- Attribute changes beyond seven post-event wake dates to a recovery activity.
- Replace the existing matched-effect estimator with a predictive or Bayesian causal model.
- Persist derived event-study rows or add a scheduled pipeline job.
- Treat multiple sessions before one sleep as independent observations.
- Claim that longer exposure caused an outcome change.

## Decisions

### Build one canonical recovery analysis dataset

Extract the period-building work currently owned by recovery-effect orchestration into a focused collaborator that returns completed sleep periods, aligned recovery exposures, outcome maps, prior-state covariates, and measurement-regime metadata. Both the matched-effect service and the event-study service will consume this dataset.

This keeps UTC-to-local alignment, the current-day exclusion, sensor regime filtering, and outcome definitions identical. Duplicating the repository loading in a second service was rejected because the two reports could silently attach a session to different days.

### Model events as exposed sleep periods

An event is one selected-activity exposure attached to an outcome sleep, not one database session row. Multiple sessions of the same activity before one sleep contribute their identifiers to a single event. An anchor sleep exposed to another activity is flagged as combined and excluded from aggregate patterns.

Each event also carries total logged duration and session-to-sleep minutes. Total duration sums the contributing selected-activity sessions. Session-to-sleep minutes measure from the latest contributing session end to the aligned sleep start. These values answer different questions and remain separate throughout the response and UI.

This avoids pseudo-replication when a user logs two parts of what is effectively one pre-sleep treatment.

### Use a focused, outcome-specific event-study endpoint

Add a read-only endpoint that requires `activityId` and `outcome`. Its response will contain:

- the selected activity, outcome, native unit, and better direction;
- eligible and total exposure counts plus the outcome-specific evidence state;
- offsets -7 through +7 and up to the 20 most recent individual trajectories;
- total duration and session-to-sleep minutes for each returned trajectory;
- a provisional aggregate across every eligible, uncontaminated event when at least three exist;
- duration-response availability and estimates for offsets 0 through +7;
- session-to-sleep timing-response availability and estimates for offsets 0 through +7;
- comparison availability and caveats;
- the existing matched estimate for the selected outcome when its ten-pair floor is met.

The existing effects endpoint remains the lightweight overview and receives only the data needed to advertise progressive evidence and link into a selected event study. Fetching one activity and outcome on demand avoids returning every outcome for hundreds of frequent Hot blanket sessions. The response states when individual trajectories are limited to the most recent 20; aggregate counts still use all eligible events.

### Reuse matching distance for descriptive comparison windows

For each event anchor, select up to eight nearest unexposed anchor sleeps on the same weekday and within the existing 84-day distance. Rank candidates with the same prior sleep, prior resting-heart-rate, prior HRV, recent training-load, and calendar-distance terms used by the matched estimator. Descriptive controls may be reused across events because this is a visual expected range, not an independent effect estimate.

At each offset, three or more available control values produce an expected median and an observed control range. Fewer than three values produce no expected comparison. The API returns the control count so the UI never implies precision that is not present.

An adjusted time-series model was rejected for the first version. With one monthly event it would generate precise-looking predictions from modeling assumptions rather than user-specific repeat evidence.

### Keep individual and aggregate evidence separate

Each trajectory point contains its local date, offset, actual value or missing status, expected center and range when available, delta, and contamination flag. The aggregate at each offset uses the median of eligible event deltas and an observed across-event range. It appears only with at least three non-contaminated values and is labelled provisional below the matched-effect floor.

Evidence state is outcome-specific:

- `collecting`: no eligible event;
- `individual`: one or two eligible events;
- `provisional`: at least three eligible events but fewer than ten matched pairs;
- `matched`: at least ten matched pairs with limited confidence;
- `moderate`: at least 20 matched pairs;
- `high`: at least 40 matched pairs.

The state does not change the existing conclusion calculation. Below ten matched pairs, the response has no effect conclusion even if every observed event moved in the same direction.

### Gate duration-response estimates on count and variation

The UI can plot returned individual event deltas against total duration immediately. For display only, it labels durations up to 30 minutes as short, 31 through 44 minutes as medium, and 45 minutes or longer as long. These labels do not define the statistical calculation.

For each offset from 0 through +7, the engine considers every eligible event with an actual outcome, an expected comparison, and no contamination at that offset. It returns availability counts for all offsets. It estimates a duration response only when an offset has at least ten eligible points, at least three distinct total durations, and a duration range of at least 20 minutes.

The estimate contains a Theil-Sen slope expressed as outcome-unit change per ten additional minutes, Spearman rank correlation, a deterministic bootstrap interval for the slope, and the number of events. Theil-Sen uses the median of pairwise slopes and is less sensitive to one unusual night than ordinary least squares. The trend calculation uses all eligible events even when the response limits individual trajectories to the 20 most recent.

The model does not adjust for session-to-sleep minutes. With ten observations, a multivariable model would look more precise than the data warrants. The UI shows the gap for every point and warns that duration may track available time, stress, bedtime, or other unrecorded conditions. A duration association never changes the matched-effect conclusion.

### Analyze session-to-sleep timing separately

The same recent event points can use session-to-sleep minutes on the horizontal axis. For each offset from 0 through +7, the timing calculation uses every eligible event with an actual outcome, expected comparison, and no contamination. It requires at least ten events, three distinct timing values, and a timing range of at least 60 minutes. Available estimates contain a Theil-Sen slope per additional 60 minutes before sleep, Spearman rank correlation, and deterministic bootstrap interval.

The UI switches one exposure-response panel between duration and timing so the relationship stays visible without duplicating charts. The two one-variable associations remain separate. Neither estimate controls for the other variable, and the report says that longer sessions may end closer to sleep. A future multivariable analysis would need materially more observations.

### Mark later recovery exposures instead of hiding the timeline

If another recovery activity aligns to a later sleep in the +1 through +7 window, return the actual point with its exposure names but exclude it from the selected activity's aggregate at that offset. Pre-event points remain context. The UI explains that workouts, illness, medication changes, and unrecorded behavior can still confound any point.

Removing the entire follow-up window after another exposure was rejected because frequent Hot blanket use would erase nearly all massage context. Keeping and marking the point is more honest and more useful.

### Add a direct analysis action to Recovery

Add a `View effects` action in the Recovery page header that navigates to the anchored Recovery effects section on Relationships. The event-study chart will have a compact table or equivalent textual disclosure for the selected outcome, so color, hover, and screen width are not required to inspect values.

## Risks / Trade-offs

- [A single unusual night looks persuasive] -> Label one and two events as individual observations, show the pre-event context, and never emit a conclusion below ten matched pairs.
- [Repeated controls make descriptive bands look inferential] -> Call them observed comparison ranges, return control counts, and keep them separate from bootstrap intervals in matched estimates.
- [Frequent activities create large responses] -> Fetch one outcome on demand, return the 20 most recent individual trajectories, and aggregate all eligible events server-side.
- [Another intervention affects a follow-up day] -> Mark recorded recovery exposures, exclude those points from aggregates, and retain explicit unmeasured-confounder caveats.
- [Sparse sensor coverage fragments a trajectory] -> Return missing points explicitly and compute each outcome and offset independently.
- [Refactoring period construction changes mature estimates] -> Add parity tests proving the existing matched-effect fixtures and method version remain unchanged.
- [Longer sessions occur on systematically different days] -> Show session-to-sleep timing and explicit confounding language, and describe the duration result as an association.
- [A narrow set of durations creates an unstable slope] -> Require ten eligible events, three distinct durations, and at least a 20-minute range before estimating a trend.
- [Dose points make frequent-activity responses too large] -> Calculate estimates across all eligible events but plot only the already bounded recent trajectories.
- [Duration and timing move together] -> Keep separate views, disclose the dependency, and avoid a two-variable model at the minimum sample size.
- [Small timing differences create noise] -> Require at least a 60-minute timing range before estimating a timing association.

## Migration Plan

1. Add shared contracts and the new read-only endpoint without changing persistence.
2. Extract and parity-test the canonical analysis dataset builder.
3. Add the pure event-study engine and orchestration tests.
4. Add the Relationships visualization and Recovery-page link.
5. Add duration metadata, gated robust duration-response estimates, and accessible duration presentation.
6. Deploy normally. Older clients ignore the new endpoint, and rollback requires only the prior image because no stored data changes.
