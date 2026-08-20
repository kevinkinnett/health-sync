# Google Health temporal contract

Google Health points do not share one universal timestamp shape. A UTC instant
is retained for ordering and session joins; the dashboard date is selected by
an explicit per-type health-day policy in `google_health_temporal.py`.

| Shape | Current types | Canonical date |
| --- | --- | --- |
| Daily | daily resting HR, respiratory rate, HRV, sleep temperature | Google's explicit `date` |
| Interval | steps, distance, active-zone minutes | civil start date |
| Sample | weight, VO2 max | civil sample date |
| Session | exercise, nutrition | civil start date |
| Sleep session | sleep | civil end / wake date |
| Overnight sample | HRV and oxygen saturation | containing sleep session's wake date during rollup |

Resolver precedence is Google civil time, embedded UTC offset, then the
configured IANA timezone. There is intentionally no `timestamp[:10]` fallback.
An undeclared data type or unresolvable time shape makes that type's capture
partial instead of silently guessing a day.

`google_health_data_point.point_date` is the declared capture-level analysis
date. `source_local_date` retains the source-local observation/start date and
`date_basis` records why the resolver selected it. Overnight sample rollups do
not trust either date: they join physical sample instants to sleep intervals.

## Capture contract

Every list request uses a closed-open civil date filter generated from the
same type registry. `days_back=3` means the three completed Eastern days plus
the in-progress current day. Pagination drains that bounded range; reaching
`max_pages` while a next token remains marks the ingest partial. Run details
record points, pages, truncation, capture dates, and date-basis counts by type.
Ranges longer than Google's 90-day list limit are split into closed-open
windows, newest first. `max_pages` is a safety ceiling per type per window, so
historical repair remains complete without making routine capture unbounded.

The four-hour production schedule should use `max_pages=20`. A bounded window
normally needs fewer pages, while the larger ceiling covers minute-level types
without returning unbounded history.

## Historical repair

After the temporal resolver and all helper scripts are deployed, run one
manual Google Health ingest with:

```text
days_back=1000
max_pages=100
write_daily=true
rollup_days=1000
include_network_activity=false
```

The raw refetch rewrites canonical dates and provenance. Raw-backed rollups
then rebuild sleep, food, weight, exercise, steps, heart-rate zones, HRV, and
SpO2. Network daily activity rollups are skipped because those civil-day
values are already correct and a 1,000-day rebuild would make hundreds of
unnecessary API requests.

After repair, validate that Aug 13, 2026 contains two nutrition entries and
1,600 calories, while Aug 14 contains seven entries and 1,635 calories. Also
verify all weight samples against their Google civil sample dates and confirm
the ingest finishes without truncation or missing analysis dates.

## Required regression cases

- EDT and EST late-evening food, exercise, and weight points crossing UTC day.
- Sleep spanning midnight and a nap ending before local midnight.
- Spring-forward and fall-back offsets supplied by Google.
- Missing civil time with embedded-offset fallback.
- Missing civil time and offset with configured-timezone fallback.
- Unknown data types and malformed time shapes failing closed.
- Overnight HRV/SpO2 attaching to the sleep session wake date.
