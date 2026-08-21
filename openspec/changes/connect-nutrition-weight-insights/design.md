## Context

See `proposal.md` for motivation and `specs/nutrition-weight-insights/spec.md` for behavior. Food is stored as one row per logged local day. Activity already carries estimated total calories out. Weight can have multiple observations per day, and Google Health currently writes the local date but not the measurement time into the compatibility table. The UI reads food and weight independently, while the correlation engine only compares calories with sleep and readiness.

The working tree contains earlier uncommitted health-analysis work. Implementation must preserve those edits and avoid broad rewrites of the same files.

## Goals / Non-Goals

**Goals:**

- Add one focused server collaborator that owns the join, coverage calculations, trend rules, and readiness gates.
- Keep repositories responsible for data access and keep statistical transforms pure and testable.
- Give both existing pages one shared interpretation of energy and weight.
- Preserve existing `/food` and `/weight` contracts.

**Non-Goals:**

- Estimating a true physiological calorie deficit from wearable values.
- Predicting future weight.
- Claiming that food, training, or energy gap caused weight change.
- Adding weight to the existing daily Pearson correlation grid or the current short-window experiment engine.
- Asking the user to manually certify that every meal was logged in this change.

## Decisions

### Add a dedicated joined use case

Create a nutrition-and-weight report service with narrow reader ports for food, activity, weight, and training summary data. It returns a shared contract containing daily rows, food coverage, a weight summary, and readiness metadata. `HealthDataService` delegates to it like the existing correlations and workout-effects collaborators.

This keeps calculation rules out of React and prevents the API, Nutrition page, and Weight page from developing different definitions. Building the join in either page was rejected because the generated AI tools and future reports need the same result.

### Use local calendar dates and completed-day gates

The report uses the existing user-timezone helpers. It creates calendar rows only from the effective observed span through the requested end. The current local date remains visible but provisional. Coverage and readiness calculations stop at the previous local date.

Food absence remains null. The service never fills food gaps with zero. Estimated energy gap exists only when both calories in and calories out exist.

### Treat wearable expenditure as an estimate

Wire and UI names use `estimatedCaloriesOut` and `estimatedEnergyGap`. Copy explains that wearable energy expenditure has systematic error. The report is useful for within-person direction, not a claim about true maintenance calories.

### Use robust weight summaries

Collapse multiple same-day weights to a median for trend calculation while returning every raw observation. Compute a trailing seven-calendar-day median only when that window has at least three observed dates. Seven-day and 30-day change compare valid trend windows rather than isolated measurements.

The alternative, a moving average, gives a single unusually high scale reading too much influence. A seven-observation smoother was also rejected because its calendar span changes with logging cadence.

### Make data readiness explicit

The report has immediate display readiness and a separate long-window readiness gate. The latter requires 42 completed days of observed span, 30 logged food dates, and 18 weight dates. These thresholds permit about six weeks with five food days and three weight days per week. Meeting them only means later weekly analysis can run. It does not create a claim.

The existing correlation engine remains unchanged except that the pages can link to its calorie and recovery panels once its own overlap gate is met. A direct daily calorie-to-weight pair is prohibited because hydration, glycogen, meal mass, sodium, and measurement timing dominate short changes.

### Preserve weight clock time without a schema migration

The compatibility weight table already has a `time` column. The Google rollup resolves source-local clock time from civil sample time first, then from the physical instant and offset. It writes that value during the existing upsert. Old rows remain valid with null time until a refetch or bounded backfill updates them.

### Share the report across two focused pages

Keep the existing routes. Add reusable energy summary and weight-trend components backed by one query. Nutrition leads with coverage and energy, then calories, protein, and fiber. Secondary nutrients remain available in a compact detail section. Weight leads with latest value, measurement cadence, rolling trend, and gated change. It also includes the aligned energy and training context.

The analytics overview receives the missing Nutrition link. No navigation route breaks.

## Risks / Trade-offs

- [Partially logged food can look like low intake] -> Call the metric logging coverage, keep missing days null, show item counts, and avoid claims about dietary completeness.
- [Wearable calories out are biased] -> Label them estimated and avoid translating a gap directly into predicted weight loss.
- [Two queries could fetch overlapping data] -> Put the join in one service and one API response, then share the client query cache across both pages.
- [Rolling medians can disappear with sparse weighing] -> Return collecting reasons and raw observations instead of interpolating.
- [Existing dirty files overlap this change] -> Inspect each diff before editing and apply narrow patches that preserve prior work.
- [A large date range can create many daily rows] -> Bound the standard controller range and calculate in linear time over indexed date reads.

## Migration Plan

1. Add shared contracts and pure trend and coverage tests.
2. Preserve Google weight time and verify rollup compatibility without deleting or rewriting source rows.
3. Add the joined service, endpoint, controller delegation, and server tests.
4. Add the shared client query and update Nutrition, Weight, and Overview with component tests.
5. Update end-to-end fixtures and visual or smoke coverage.
6. Run Python tests, server and client tests, lint, type checks, production build, and relevant browser tests.

Rollback removes the endpoint and UI components while leaving existing food and weight routes intact. The added weight time values are compatible with older readers and need no rollback.
