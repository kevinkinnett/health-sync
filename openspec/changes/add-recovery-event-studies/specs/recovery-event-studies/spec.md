## Purpose

Show the health measurements surrounding infrequent recovery sessions immediately, while keeping sparse observations separate from evidence of a repeatable effect.

## ADDED Requirements

### Requirement: Session-aligned event window
The system SHALL provide an event window for each eligible activity exposure from seven local wake dates before through seven local wake dates after its aligned outcome sleep. Offset zero SHALL represent the first main sleep beginning after the activity ends, using the same timezone and sleep-alignment rules as the matched recovery-effect analysis.

#### Scenario: First eligible massage session
- **WHEN** one massage exposure can be aligned to a completed main sleep
- **THEN** the system returns available outcome values for offsets -7 through +7 around that sleep's local wake date

#### Scenario: Incomplete current day
- **WHEN** an event window would include the current local calendar day
- **THEN** the system excludes that day's incomplete health measurements from the event study

#### Scenario: Multiple same-activity sessions before one sleep
- **WHEN** two sessions of the selected activity align to the same main sleep
- **THEN** the system treats them as one exposed event and identifies both contributing sessions

### Requirement: Exposure duration and sleep timing
The system SHALL report total logged duration for each exposed event and the elapsed minutes between the latest contributing session end and the aligned sleep start. When multiple selected-activity sessions align to one sleep, total duration SHALL equal the sum of their logged durations. Duration and sleep timing SHALL remain separate variables.

#### Scenario: Short Hot blanket session
- **WHEN** a 25-minute Hot blanket session aligns to a main sleep
- **THEN** the event identifies 25 minutes of exposure and its session-end-to-sleep interval

#### Scenario: Grouped Hot blanket sessions
- **WHEN** two Hot blanket sessions with durations of 20 and 25 minutes align to one sleep
- **THEN** the event reports 45 total logged minutes and measures sleep timing from the later session end

### Requirement: Outcome-specific trajectories
The system SHALL support event trajectories for sleep duration, sleep efficiency, wake-day resting heart rate, wake-day HRV, overnight restlessness, and wake-day readiness. Missing measurements SHALL remain explicit and SHALL not remove other available outcomes or dates.

#### Scenario: Select an outcome
- **WHEN** the user selects an available recovery activity and outcome
- **THEN** the system shows that outcome in its native unit across the event window

#### Scenario: Missing sensor value
- **WHEN** an event-window date lacks the selected outcome
- **THEN** the system marks that point unavailable without interpolating or replacing it with zero

### Requirement: Descriptive expected comparison
For each event-window point, the system SHALL attempt to provide an expected center and observed comparison range from comparable unexposed windows. Comparable windows SHALL account for weekday, calendar proximity, prior sleep, prior resting heart rate, prior HRV, and recent training load. The presentation SHALL identify these comparisons as descriptive rather than inferential estimates.

#### Scenario: Comparable windows are available
- **WHEN** enough comparable unexposed windows contain the selected outcome at an offset
- **THEN** the system reports the actual value, expected center, observed comparison range, and difference from the expected center

#### Scenario: Comparable windows are sparse
- **WHEN** too few comparable unexposed values are available for an offset
- **THEN** the system still reports the actual value and marks the expected comparison unavailable

### Requirement: Progressive evidence states
The system SHALL distinguish collection, individual observation, provisional repeated pattern, matched estimate, moderate confidence, and high confidence states. One or two eligible events SHALL remain individual observations. Three or more eligible events MAY produce a provisional aggregate trajectory. Benefit, cost, or unclear effect conclusions SHALL remain hidden until the existing minimum of ten matched pairs is met for the selected outcome. Moderate and high confidence SHALL continue to require at least 20 and 40 matched pairs respectively.

#### Scenario: One observed session
- **WHEN** an activity and outcome have one eligible event but fewer than three
- **THEN** the system labels the timeline an individual observation and makes no repeatability or effect claim

#### Scenario: Three observed sessions
- **WHEN** an activity and outcome have at least three eligible events but fewer than ten matched pairs
- **THEN** the system may show a provisional aggregate trajectory while withholding benefit, cost, and unclear conclusions

#### Scenario: Existing effect threshold is reached
- **WHEN** an activity and outcome have at least ten valid matched pairs
- **THEN** the system shows the matched effect estimate alongside the event study with its existing outcome-specific confidence

### Requirement: Confounded-window disclosure
The system SHALL identify event points that overlap another recovery exposure. Such points MAY remain visible for context but SHALL be marked and excluded from provisional aggregate trajectories for the selected activity.

#### Scenario: Another recovery activity occurs during follow-up
- **WHEN** a massage event window contains a later sleep period exposed to Hot blanket
- **THEN** the corresponding point is visibly marked as another recovery exposure and is excluded from the massage aggregate at that offset

#### Scenario: Combined exposure at the anchor sleep
- **WHEN** more than one recovery activity type aligns to offset zero
- **THEN** the system identifies the event as combined exposure and excludes it from the selected activity's provisional aggregate

### Requirement: Gated duration-response analysis
The system SHALL provide a descriptive plot of event outcome differences against total logged duration for offsets zero through seven. Each plotted event SHALL expose duration, session-end-to-sleep minutes, outcome difference, and contamination state. The system SHALL estimate a duration-response association for an offset only when at least ten eligible uncontaminated events have an expected comparison, contain at least three distinct durations, and span at least 20 minutes. The estimate SHALL remain an association and SHALL not claim that a longer session caused the outcome.

#### Scenario: First short and long sessions
- **WHEN** fewer than ten eligible Hot blanket events include both short and long sessions
- **THEN** the system shows their individual duration and outcome-difference points without a dose-response conclusion

#### Scenario: Duration varies enough for estimation
- **WHEN** an offset has at least ten eligible uncontaminated event differences across at least three durations spanning 20 minutes or more
- **THEN** the system reports a robust change per additional ten minutes, a rank association, uncertainty, and the event count

#### Scenario: Duration does not vary enough
- **WHEN** at least ten events exist but their durations span less than 20 minutes or contain fewer than three distinct values
- **THEN** the system explains that duration variation is insufficient and withholds the trend estimate

#### Scenario: Follow-up session contaminates a duration point
- **WHEN** another recovery session occurs at the selected follow-up offset
- **THEN** the system keeps that point visible, marks it contaminated, and excludes it from the duration-response estimate

### Requirement: Gated session-to-sleep timing analysis
The system SHALL provide a descriptive plot of event outcome differences against elapsed minutes between the latest contributing session end and sleep for offsets zero through seven. The system SHALL estimate a timing-response association for an offset only when at least ten eligible uncontaminated events have an expected comparison, contain at least three distinct timing values, and span at least 60 minutes. Timing results SHALL remain separate from duration results and SHALL not claim that moving a session closer to or farther from bed caused the outcome.

#### Scenario: Timing observations are sparse
- **WHEN** fewer than ten eligible Hot blanket events have session-to-sleep timing and outcome differences
- **THEN** the system shows individual timing points without a timing-response conclusion

#### Scenario: Sleep timing varies enough for estimation
- **WHEN** an offset has at least ten eligible uncontaminated event differences across at least three timing values spanning 60 minutes or more
- **THEN** the system reports a robust change per additional 60 minutes before sleep, a rank association, uncertainty, and the event count

#### Scenario: Sleep timing does not vary enough
- **WHEN** at least ten events exist but their session-to-sleep timings span less than 60 minutes or contain fewer than three distinct values
- **THEN** the system explains that timing variation is insufficient and withholds the timing trend estimate

### Requirement: Event-study presentation and discoverability
The Relationships page SHALL provide activity and outcome selection, an accessible event timeline, duration and session-to-sleep context, progressive evidence wording, data availability, and non-causal caveats. The exposure-response view SHALL let the user switch between duration and time before sleep. The duration view SHALL label sessions up to 30 minutes, 31 through 44 minutes, and 45 minutes or longer as display groups without treating those groups as inferential thresholds. The Recovery page SHALL link directly to this report and show that it is where logged sessions are analyzed.

#### Scenario: Open analysis from Recovery
- **WHEN** the user follows the recovery-analysis action from the Recovery page
- **THEN** the application opens the Recovery effects section on Relationships

#### Scenario: Review without relying on the chart
- **WHEN** a user inspects an event study with assistive technology or on a narrow screen
- **THEN** the application exposes event dates, duration, session-to-sleep timing, offsets, actual values, expected comparisons, and evidence state in text or tabular form
