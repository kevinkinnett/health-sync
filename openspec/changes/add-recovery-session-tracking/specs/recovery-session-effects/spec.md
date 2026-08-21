## Purpose

Estimate understandable within-person associations between recovery sessions and the sleep or recovery measurements that follow them.

## ADDED Requirements

### Requirement: Session-to-outcome alignment
The system SHALL associate a recovery session with the first main overnight sleep session that begins after the recovery session ends, within a bounded interval, and with next-morning measurements on that sleep session's local wake date.

#### Scenario: Evening session precedes next-day wake metrics
- **WHEN** a recovery session ends before an overnight sleep that wakes on the following local date
- **THEN** the system uses that sleep and its wake-date recovery measurements as outcomes

#### Scenario: After-midnight session precedes same-date wake metrics
- **WHEN** a recovery session occurs after local midnight but before the main sleep that wakes later that same local date
- **THEN** the system associates it with that sleep instead of shifting the outcome to the next calendar date

### Requirement: Matched comparison estimates
For each eligible activity type and outcome, the system SHALL compare exposed sleep periods with unexposed periods matched without replacement. Matching SHALL account for weekday, temporal proximity, prior sleep, prior resting heart rate, prior HRV, and recent training load when those covariates are available.

#### Scenario: Build an activity-specific estimate
- **WHEN** an activity and outcome have enough eligible exposed and control periods
- **THEN** the system reports the exposed mean, matched-control mean, adjusted difference, uncertainty interval, sample counts, and method version

#### Scenario: Avoid mixed-session attribution
- **WHEN** more than one recovery activity type occurs before the same outcome sleep
- **THEN** the system excludes that sleep from single-activity estimates and identifies it as a combined exposure in coverage counts

### Requirement: Evidence threshold and interpretation
The system SHALL require at least 10 matched pairs before reporting an effect estimate. Below that threshold, it SHALL report collection progress. Estimates SHALL use association language and SHALL not claim that a recovery activity caused an outcome.

#### Scenario: Insufficient history
- **WHEN** an activity has fewer than 10 valid matched pairs for an outcome
- **THEN** the system shows the available and required counts without an effect conclusion

#### Scenario: Uncertain estimate
- **WHEN** an estimate's uncertainty interval includes no difference
- **THEN** the system labels the result unclear and reports the plausible range

### Requirement: Recovery outcomes
The analysis SHALL consider the subsequent main sleep's duration and efficiency and the corresponding wake-date resting heart rate, HRV, restlessness, and readiness when valid measurements exist.

#### Scenario: Missing outcome measurement
- **WHEN** an exposed or candidate control period lacks the selected outcome
- **THEN** the system excludes that period only from that outcome's estimate and retains it for other available outcomes

### Requirement: Relationships presentation
The Relationships page SHALL present recovery-session coverage and eligible effect estimates separately from ordinary Pearson correlations and workout effects, including the activity, outcome timing, evidence level, sample counts, and non-causal interpretation.

#### Scenario: Review recovery effects
- **WHEN** the user opens Relationships with recovery-session history
- **THEN** the page shows each activity's collection state or matched estimates and explains that outcomes refer to the first sleep after the session
