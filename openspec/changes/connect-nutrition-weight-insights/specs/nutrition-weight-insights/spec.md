## Purpose

Provide a coverage-aware view of nutrition, estimated energy expenditure, training, and body-weight direction without treating missing logs or daily scale noise as evidence.

## ADDED Requirements

### Requirement: Joined local-day report
The system SHALL provide a read-only report that aligns food intake, estimated calories out, training load, and body-weight observations by the user's local calendar date for a requested inclusive date range.

#### Scenario: Fully observed day
- **WHEN** a local date has logged food, estimated calories out, training data, and a weight observation
- **THEN** the report returns those values on one daily row and calculates estimated energy gap as calories in minus estimated calories out

#### Scenario: Missing source on a joined day
- **WHEN** one or more sources have no observation for a local date
- **THEN** the report returns null for each missing value and does not substitute zero

### Requirement: Food logging coverage
The system SHALL report completed-day food logging coverage from the first logged food date within the requested range through the last completed local date. It SHALL describe this as logging coverage, not dietary completeness.

#### Scenario: Unlogged day inside the observed span
- **WHEN** a completed local date between the first and last observed food dates has no food row
- **THEN** the report counts that date as unlogged and leaves calorie and nutrient values null

#### Scenario: Current local date is still open
- **WHEN** the requested range includes the current local date
- **THEN** the report marks that row provisional and excludes it from coverage percentages and analytic readiness gates

### Requirement: Weight trend separates signal from scale noise
The system SHALL show raw weight observations and a seven-local-day rolling median. It SHALL calculate 7-day and 30-day trend changes only when both comparison windows contain enough observations, and SHALL otherwise return an explicit collecting-data state.

#### Scenario: Enough observations for a trend
- **WHEN** a seven-day window contains at least three distinct observed weight dates
- **THEN** the report returns the median weight for that window as its trend value

#### Scenario: Too few observations for a change
- **WHEN** either side of a requested 7-day or 30-day comparison lacks at least three distinct observed weight dates
- **THEN** the corresponding trend change is null and the report explains that more consistent measurements are needed

#### Scenario: Multiple observations on one date
- **WHEN** more than one weight observation exists on the same local date
- **THEN** all raw observations remain available and the daily trend input uses their median

### Requirement: Weight measurement time is retained
The system SHALL preserve the source-local measurement time for new Google Health weight observations when Google supplies civil-time or offset information.

#### Scenario: Google weight contains local time evidence
- **WHEN** a Google Health weight sample includes resolvable local date and time evidence
- **THEN** its compatible daily weight record contains that local measurement time

#### Scenario: Google weight lacks local time evidence
- **WHEN** a weight sample provides a valid local date but no resolvable local clock time
- **THEN** the weight value and date are stored while measurement time remains null

### Requirement: Analytic claims are coverage gated
The system SHALL expose separate readiness states for daily display and long-window relationship analysis. It MUST NOT produce a raw daily calorie-to-weight correlation.

#### Scenario: Early collection period
- **WHEN** the observed span is shorter than 42 completed local days, has fewer than 30 food-logged days, or has fewer than 18 distinct weight dates
- **THEN** the report labels long-window analysis as collecting data and states which thresholds remain unmet

#### Scenario: Long-window thresholds are met
- **WHEN** the report has at least 42 completed local days, 30 food-logged days, and 18 distinct weight dates
- **THEN** it marks the dataset ready for future weekly or smoothed relationship analysis without claiming that a relationship exists

### Requirement: Nutrition and weight pages explain the joined data
The Nutrition and Weight pages SHALL use the same joined report and date range while retaining detailed nutrient values, preferred weight units, raw observations, and clear missing-data labels.

#### Scenario: Nutrition page has joined data
- **WHEN** food and activity overlap in the selected range
- **THEN** the page shows calories in, estimated calories out, estimated energy gap, logging coverage, and detailed nutrient trends

#### Scenario: Weight page has limited history
- **WHEN** weight observations exist but trend gates are unmet
- **THEN** the page shows the raw observations and a collecting-data explanation without presenting a rate of change

#### Scenario: User opens analytics overview
- **WHEN** the analytics overview renders its metric links
- **THEN** Nutrition is available alongside Weight and the other tracked metrics

### Requirement: Report is available to read-only clients
The system SHALL expose the joined report through the versioned read-only health API using the standard date-range and local-time conventions, which also makes it available to the generated AI health-tool registry.

#### Scenario: API client requests a range
- **WHEN** a client requests the nutrition-and-weight report with an inclusive start and end date
- **THEN** the API returns the joined daily rows, coverage, weight trend summary, and analytic readiness metadata
