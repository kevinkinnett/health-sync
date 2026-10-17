# Health data integrity sweep — 2026-10-16

Read-only sweep of `universe.fitbit_*` against `universe.google_health_data_point`
(nothing was written, backfilled, deployed or rescheduled). Window: the last
120 local days (2026-06-19 → 2026-10-16) for recomputation and the last 60 days
for null rates. Today (2026-10-16) is in progress and excluded from diffs.

**Bottom line:** every rollup recomputed from raw points matches the stored
value on every settled day: about 1,390 metric-days, zero drift. That covers steps,
RHR, respiratory rate, skin temp, HRV ×3, HR zones ×3, sleep, SpO2, food and
weight. The problems are around the edges:

| # | Finding | Severity | Days affected | Fix type |
|---|---|---|---|---|
| 1 | `distance_km` folds in phone (Health Connect) distance; steps don't | medium | 4 beyond 3% (7 differ) since 2026-09-30 | code + optional SQL |
| 2 | Legacy `API` + `google_health` duplicate weigh-ins | medium | 7 days, 2025-10-10 → 2026-04-29 | SQL |
| 3 | Manual exercise with NULL `source_platform` is never rolled up | low | 1 session (2026-09-24) | code + SQL |
| 4 | HR-zone minutes NULL instead of 0 on worn days with no zone minutes | low | 9 days | code + SQL |
| 5 | Orphan SpO2 rows with no Fitbit sleep night behind them | low | 2 days | SQL |
| 6 | No Fitbit sleep on 4 nights (watch didn't record; Eight Sleep did) | info | 4 nights | none |
| 7 | Watch-derived activity artifact: 138–519 very-active min/day on 1.4k–7.4k steps (§6) | high | 16 days, 2026-03-18 → 04-02 | SQL (quarantine) |

No edge-day truncation, no DST artefacts, no FITBIT/HEALTH_CONNECT double
counting in any rolled-up column, and no duplicate raw points.

---

## 1. Column inventory (last non-null, 60-day null rate)

Each numeric column is marked **live**, **frozen** (it legitimately stopped
because Google has no equivalent) or **broken**.

| Table.column | Last non-null | Null % (60d) | Verdict |
|---|---|---|---|
| activity.steps / calories_out / distance_km / floors / minutes_{lightly,fairly,very}_active | 2026-10-16 | 0 | live (distance: see §2.1) |
| activity.calories_bmr / active_calories / minutes_sedentary | 2026-06-11 | 100 | frozen: unmapped at cutover, different Google definitions |
| body_weight.weight_kg | 2026-09-29 | 0 | live but sparse (6 weigh-ins in 120d) |
| body_weight.bmi | 2026-04-29 | 100 | frozen: legacy `API` rows only; Google weight has no BMI |
| body_weight.fat_pct | never | 100 | frozen: never populated |
| breathing_rate_daily.breathing_rate | 2026-10-16 | 0 | live |
| cardio_score_daily.vo2_max (text) | 2026-06-11 | — | frozen: Google vo2-max returns `{}` |
| exercise_log.calories / duration_ms / average_heart_rate | 2026-10-16 | 0 | live |
| exercise_log.steps / distance | 2026-09-23 | 80.6 | live, legitimately sparse: only WALKING/TREADMILL sessions carry `steps`/`distanceMillimeters`; the other 25 of 31 sessions (WORKOUT, manual strength) don't |
| exercise_log.elevation_gain | 2026-08-12 | 100 | frozen (provider): no session since 2026-08-12 includes `elevationGainMillimeters`. The 2026-08-25 walk has none. The device label also changed from "Google Pixel Watch 4 (45mm)" to "Pixel Watch 4" on 2026-08-23 |
| exercise_log.activity_type_id | 2026-06-04 | 100 | frozen: not in Google payload |
| food_log_daily.* (calories_in, macros, nutrients, food_count) | 2026-08-23 | 0 | live; raw `nutrition-log` also ends 2026-08-23, so logging stopped (not broken). 10/10 days in window match raw exactly |
| food_log_daily.water / calorie_goal | 2026-06-11 / never | 100 | frozen: absent from Google nutrition-log |
| heart_rate_daily.resting_heart_rate | 2026-10-16 | 0 | live |
| heart_rate_daily.zone_{fat_burn,cardio,peak}_min | 2026-10-16 | 10.2 | live; NULLs are finding #4 |
| heart_rate_daily.zone_*_cal, zone_out_of_range_min | 2026-06-11 | 100 | frozen: AZM records only zone-earning minutes, no calories |
| hrv_daily.daily_rmssd / deep_rmssd / non_rem_heart_rate | 2026-10-16 | 0 | live (deep RMSSD fix is holding) |
| skin_temp_daily.nightly_relative | 2026-10-16 | 0 | live |
| sleep_daily.* (asleep, in bed, stages, efficiency, naps, records) | 2026-10-16 | 0 | live |
| spo2_daily.avg/min/max | 2026-10-16 | 0 | live |

`fitbit_ingest_state_retired_20260809` is retired and was ignored.

## 2. Recompute-from-raw diffs (2026-06-19 → 2026-10-15)

| Rollup | Raw days | Stored days | Disagreeing days |
|---|---|---|---|
| steps (FITBIT, local date, windowless) | 119 | 119 | 0 |
| resting HR | 119 | 119 | 0 |
| respiratory rate | 115 | 115 | 0 |
| skin temp deviation | 115 | 115 | 0 |
| daily / deep RMSSD, non-REM HR | 115 | 115 | 0 / 0 / 0 |
| HR zones fat-burn / cardio / peak | 110 | 119 (9 NULL) | 0 on days with AZM points |
| sleep (main session: asleep, in bed, stages, records, naps) | 116 | 116 | 0 |
| SpO2 avg/min/max (wake-date join) | 115 | 117 | 2 orphans (§5) |
| food (calories, entry count) | 10 | 10 | 0 |
| weight (6 logs) | 6 | 6 | 0 |
| exercise (log ids, dates) | 60 | 59 | 1 missing (§3) |
| distance_km vs FITBIT raw | 119 | 119 | 4 beyond tolerance (§2.1) |

**Steps across all history (2024-01-26 → today):** 985 stored days. 937 equal
raw, 46 are *above* raw, 0 below, and 2 have no raw. All 46 "above" days fall
on or before 2026-05-08, before the cutover. These are legacy Fitbit-API values
that `GREATEST` deliberately keeps (largest: 2026-04-03, 2,549 stored vs 2,418
raw). Expected, no action.

**Edge days:** none. `source_local_date` always equals the local date of
`start_time` for steps (0 mismatched points), and the windowless rollups leave
no window edge.

**DST:** 2025-11-02 (fall back) and 2026-03-08 (spring forward) are clean.
Steps equal raw, and sleep in-bed is physical minutes (401 min for 04:32→11:13Z
on 3/8), not wall-clock. The next transition is **2026-11-01**. The invariant
job below will cover it.

**FITBIT vs HEALTH_CONNECT:** every SQL/Python rollup filters
`source_platform='FITBIT'`, so nothing in the stored columns double counts.
The Health Connect copies are different series, not duplicates:

- HC resting HR differs from Fitbit RHR on 104/116 days (typically 1–3 bpm, up to 9). It
  is a different algorithm and is correctly ignored.
- HC steps come from the phone pedometer. They're usually below the watch, but
  above it on days the watch was off-wrist: 2026-07-03 (2,136 vs 1,337),
  2026-10-10 (2,449 vs 1,750), 2026-10-14 (3,050 vs 2,542).
- HC sleep is entirely Eight Sleep (`com.eightsleep.eight`).
- The HC `source_app` package name rotates every few days
  (`com.android.healthconnect.phone.j<hash>`, 7 different hashes since 9/24).
  Never key a filter on it.

### 2.1 Distance mixes sources (finding #1)

Steps are summed from FITBIT raw points. `distance_km` comes from Google's
`dailyRollUp`, which **merges** sources. HC phone distance first appears
2026-09-24. From 2026-09-30, stored distance exceeds the watch's own distance
on 7 of 16 settled days:

| Date | Steps | Stored km | Watch raw km | HC km | Gap | Steps/km stored |
|---|---|---|---|---|---|---|
| 2026-09-30 | 4,337 | 3.465 | 3.212 | 2.370 | +0.253 | 1,252 |
| 2026-10-02 | 5,080 | 3.642 | 3.625 | 2.453 | +0.017 | 1,395 |
| 2026-10-05 | 3,242 | 2.590 | 2.200 | 1.500 | +0.390 | 1,252 |
| 2026-10-08 | 5,991 | 4.049 | 4.033 | 3.816 | +0.016 | 1,480 |
| 2026-10-10 | 1,750 | 1.908 | 1.184 | 1.586 | +0.724 (+61%) | **917** |
| 2026-10-14 | 2,542 | 2.439 | 1.746 | 1.965 | +0.693 (+40%) | **1,042** |
| 2026-10-15 | 5,652 | 3.872 | 3.849 | 2.717 | +0.023 | 1,460 |
| (2026-10-16, partial) | 2,469 | 1.793 | 1.681 | 1.292 | +0.112 | 1,377 |

The stored value is neither watch+phone nor max(watch, phone). It looks like
Google gap-fills watch-off periods with phone distance. Steps are not
gap-filled the same way, so steps/km collapses to 917 on 2026-10-10.

Before 9/24 the stored distance tracks watch raw within ±0.015 km (Google's
own revisions, e.g. 2026-06-25 4.522 vs 4.537). That is noise.

Steps/km outside the 1,342–1,500 walking band also occurs on *consistent*
days, e.g. 2026-08-26 at 1,201 and 2026-07-26 / 08-22 at 1,263, where stored
equals raw. Those are faster-cadence days and real. The invariant job therefore
uses a wider 1,150–1,600 band and checks the source mismatch separately.

**Suggested repair:** make the two columns agree on a source. The
recommendation is to compute `distance_km` from FITBIT raw `distance` points
in `_sql_rollups`, the same way as steps (windowless, `GREATEST`, local date).
`dailyRollUp` would then remain only for `total-calories`, `active-minutes`
and `floors`, which can't be listed. That is a code change for the ingest
owner. Until it ships, any SQL repair is overwritten by the next run within
`rollup_days`. Once it ships, history can be realigned with:

```sql
-- Preview
SELECT a.date, a.distance_km, r.km AS watch_km
FROM universe.fitbit_activity_daily a
JOIN (SELECT source_local_date d,
             round(sum((value_jsonb->'distance'->>'millimeters')::numeric) / 1e6, 3) km
      FROM universe.google_health_data_point
      WHERE data_type = 'distance' AND source_platform = 'FITBIT'
        AND source_local_date >= '2026-09-24'
      GROUP BY 1) r ON r.d = a.date
WHERE a.date >= '2026-09-24' AND abs(a.distance_km - r.km) > 0.005
ORDER BY 1;

-- Apply (only after the rollup stops writing merged distance)
BEGIN;
UPDATE universe.fitbit_activity_daily a
SET distance_km = r.km, fetched_at = NOW()
FROM (SELECT source_local_date d,
             round(sum((value_jsonb->'distance'->>'millimeters')::numeric) / 1e6, 3) km
      FROM universe.google_health_data_point
      WHERE data_type = 'distance' AND source_platform = 'FITBIT'
        AND source_local_date >= '2026-09-24'
      GROUP BY 1) r
WHERE r.d = a.date AND a.date >= '2026-09-24' AND abs(a.distance_km - r.km) > 0.005;
-- expect ~8 rows (more if new days accrue)
COMMIT;
```

The alternative is to keep Google's merged distance as "what the Fitbit app
shows" and accept that steps/km is meaningless on gap-filled days. That is a
legitimate choice. Then the invariant's `distance_source_mismatch` warning
becomes informational.

## 3. Plausibility

- **Steps/km:** see §2.1. The only out-of-band days with a non-source cause
  are the cadence days noted there.
- **Sleep vs in-bed:** 0 nights with asleep > in bed. 0 outside 120–900 min.
  0 with efficiency outside 50–100. 0 with stage sum > in bed (116 nights).
- **Resting HR:** 61–71 bpm (mean 65.0), with no day-over-day jump > 15.
- **SpO2** avg ≥ 92.52 and min ≥ 80.0 (the artefact floor). **HRV** 23.6–64.3 ms.
  **Respiratory rate** 10.8–13.8. Nothing implausible.
- **Activity:** no day with calories_out < 1,200 or > 5,000, steps > 40,000, or
  active minutes > 1,000.
- **Duplicate days:** daily tables are PK'd on `date`, and raw has 0 duplicate
  `(data_type, platform, point_date)` daily points and 0 duplicate
  interval-start points in 120 days. The duplicates are in weights (§4.2).

## 4. Findings and repairs

Run every block in a transaction and check the preview counts first.

### 4.1 Manual exercise dropped (finding #3)

Raw point `.../exercise/dataPoints/7268628341612821960` (2026-09-24, Strength
training 16:00–16:45 EDT, 139 kcal, `recordingMethod: MANUAL`) has
`source_platform IS NULL`. `_rollup_exercise` filters `source_platform='FITBIT'`,
so the session is missing from `fitbit_exercise_log`. It is the only NULL-platform
raw point. **Code fix:** route `exercise` on
`source_platform IS DISTINCT FROM 'HEALTH_CONNECT'`, or explicitly accept
`dataSource.recordingMethod = 'MANUAL'`. **Data repair** (mirrors the rollup's
column mapping):

```sql
BEGIN;
INSERT INTO universe.fitbit_exercise_log
    (log_id, date, start_time, activity_name, log_type, calories, duration_ms,
     has_active_zone_minutes, raw_jsonb)
SELECT 7268628341612821960, DATE '2026-09-24', start_time,
       value_jsonb->'exercise'->>'displayName', 'manual',
       round((value_jsonb->'exercise'->'metricsSummary'->>'caloriesKcal')::numeric),
       (rtrim(value_jsonb->'exercise'->>'activeDuration', 's')::numeric * 1000)::bigint,
       false, value_jsonb
FROM universe.google_health_data_point
WHERE data_type = 'exercise'
  AND name LIKE '%/exercise/dataPoints/7268628341612821960'
ON CONFLICT (log_id) DO NOTHING;
-- expect INSERT 0 1
COMMIT;
```

### 4.2 Duplicate weigh-ins (finding #2)

Seven days carry both the legacy Fitbit-API row and the Google-rollup row for
the same weigh-in (0.01–0.10 kg apart). Counts and averages on the weight
chart double-weight those days:

| Date | API log_id / kg | google_health log_id / kg |
|---|---|---|
| 2025-10-10 | 1760128680000 / 95.70 | -137690273354526 / 95.71 |
| 2026-03-17 | 1773779072000 / 92.00 | -251426931513632 / 92.08 |
| 2026-03-27 | 1774643131000 / 88.90 | -248387983614082 / 89.00 |
| 2026-03-28 | 1774729597000 / 88.50 | -105809471495785 / 88.59 |
| 2026-03-29 | 1774816134000 / 88.20 | -105121931122157 / 88.22 |
| 2026-04-10 | 1775852965000 / 85.90 | -266116726176278 / 85.96 |
| 2026-04-29 | 1777446180000 / 84.50 | -28658467197167 / 84.59 |

The recommendation is to delete the **API** copies. The google_health rows are
reproducible from raw, so a future long `rollup_days` repair would just recreate
them if those were deleted instead. Their `time` is NULL (written before the
temporal resolver), and any full-history rollup re-run fills it.

```sql
BEGIN;
DELETE FROM universe.fitbit_body_weight api
USING universe.fitbit_body_weight g
WHERE api.source = 'API' AND g.source = 'google_health'
  AND api.date = g.date AND abs(api.weight_kg - g.weight_kg) <= 0.5;
-- expect DELETE 7
COMMIT;
```

### 4.3 HR-zone minutes NULL on worn days (finding #4)

The zone rollup only inserts days that have `active-zone-minutes` points. A day
with no zone-earning minute keeps the row created by the resting-HR insert,
with NULL zones. Downstream that reads as "no data" rather than "0 minutes".
Affected days: 2026-07-05, 07-22, 08-15, 08-27, 09-16, 09-26, 10-03, 10-11,
10-12 (steps 2,207–7,337, RHR present). **Code fix:** in the zone insert, write
`COALESCE(..., 0)` for every heart_rate_daily row since the cutover that has a
resting HR, or seed zeros from the RHR insert. `GREATEST(0, x) = x` keeps it
monotone. **Data repair:**

```sql
BEGIN;
UPDATE universe.fitbit_heart_rate_daily h
SET zone_fat_burn_min = 0, zone_cardio_min = 0, zone_peak_min = 0, fetched_at = NOW()
WHERE h.date >= DATE '2026-06-12' AND h.date < CURRENT_DATE
  AND h.zone_cardio_min IS NULL AND h.zone_fat_burn_min IS NULL AND h.zone_peak_min IS NULL
  AND h.resting_heart_rate IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM universe.google_health_data_point p
                  WHERE p.data_type = 'active-zone-minutes' AND p.source_platform = 'FITBIT'
                    AND p.source_local_date = h.date);
-- expect UPDATE 9
COMMIT;
```

### 4.4 Orphan SpO2 rows (finding #5)

`fitbit_spo2_daily` rows for 2026-07-04 (avg 92.52) and 2026-07-12 (92.84)
were last written 2026-08-15. That was before overnight samples were keyed to
the Fitbit sleep wake date. Those nights have no Fitbit sleep session (§4.5),
so the current rollup produces nothing for them. It never deletes, so the old
rows linger. Their HRV, skin-temp and respiratory-rate rows are already absent.

```sql
BEGIN;
DELETE FROM universe.fitbit_spo2_daily
WHERE date IN (DATE '2026-07-04', DATE '2026-07-12')
  AND raw_jsonb->>'_src' = 'google_health' AND fetched_at < '2026-08-16';
-- expect DELETE 2
COMMIT;
```

### 4.5 Nights without a Fitbit sleep session (finding #6, no repair)

2026-07-04, 07-12, 07-16 and 09-24 have no FITBIT `sleep` point, so sleep,
HRV, skin temp and respiratory rate have no row. SpO2 also lacks 07-16 and
09-24. Eight Sleep recorded all four nights via Health Connect: 389/421/455/391
min asleep. The watch didn't record, and the data is otherwise correct.
If the dashboard should fill these, use an Eight Sleep fallback in the read
model rather than writing into `fitbit_sleep_daily`.

## 5. Ongoing guard: `health_data_invariants.py`

New Windmill-ready script at the repo root (not deployed). It is read-only and
reruns this sweep's checks daily over a 120-day window:

- column freshness / null rate, with an explicit frozen-column allowlist and
  reasons
- recompute-vs-stored drift for every raw-backed daily rollup (monotone sums
  only warn when stored > raw)
- distance source mismatch and steps/km band
- sleep, RHR plausibility
- zone-NULL worn days, duplicate weigh-ins, NULL-platform raw points, and
  missing days
- very-active minutes with neither the steps nor the HR-zone minutes to back
  them (`very_active_implausible`, alert; added for finding #7, see §6.4)

The output style matches `evaluate_health_alerts.py`: it prints and returns a
summary plus details. An optional Apprise push is off by default.

A read-only preview against production on 2026-10-16 took 3.7 s and returned
**0 alerts and 29 warnings**: exactly findings #1–#6 above (4 distance + 2
steps/km, 7 weights, 1 unrouted exercise, 9 zone-NULL days, 2 SpO2 orphans, 4
missing sleep nights). After the repairs in §4, the expected steady state is
the 4 missing-sleep warnings plus any new distance mismatches until §2.1 is
decided. Check logic is covered by `tests/test_health_data_invariants.py`
(26 tests, fake rows).

Activation steps are in the script's docstring. Schedule it after the 4-hourly
ingest, and enable `push` once the known warnings are cleared.

## 6. Very-active-minutes artifact, 2026-03-18 → 2026-04-02 (finding #7)

Added after the insight-quality report (`docs/insight-quality-2026-10.md`)
found this window drives the experiment engine's biggest false effect: it says
Escitalopram 20 mg raised active minutes 584%, and that Eight Sleep moved them
the wrong way. The investigation was read-only: DB queries plus `dailyRollUp`
and `dataPoints` reads against the Google Health API.

**Root cause: a device-side artifact.** The Pixel Watch 4 itself derived these
active minutes and calories. Fitbit/Google stored them as real data. There is
no unit, aggregation or double-count bug in our ingest or rollups, and no code
fix. The repair quarantines the rows (§6.3), and a new invariant catches a
recurrence (§6.4).

### 6.1 Who wrote the rows

- All 16 rows have `raw_jsonb = {"_src": "google_health"}`. They were written by
  `_rollup_activity_daily` from Google's `active-minutes` `dailyRollUp`, mapped
  LIGHT/MODERATE/VIGOROUS → lightly/fairly/very. `fetched_at` is recent only
  because the windowless steps/zone upserts touch every row. The legacy Fitbit
  API values for these days were overwritten earlier and no longer exist in the
  DB.
- A fresh `dailyRollUp` read (2026-10-16) returns exactly the stored VIGOROUS
  values, e.g. 03-24 = 519 and 03-26 = 485. It returns them identically for
  `dataSourceFamily` = `all-sources`, `google-sources` and `google-wearables`. So
  no phone, Health Connect or manual source is merged in, unlike `distance_km`
  in §2.1. LIGHT and calories differ by ≤ 1–2% from the stored values (Google's
  later revision), but are equally inflated.
- The raw `active-minutes` points are per-minute,
  `dataSource = {device: "Pixel Watch 4", platform: FITBIT, recordingMethod: DERIVED}`.
  Every FITBIT raw point in March–April comes from the single
  `Google Pixel Watch 4 (45mm)` device. There was no second tracker.

### 6.2 Evidence against real activity

| | 03-12 → 03-17 (before) | **03-18 → 04-02** | 04-04 → 04-08 (after) |
|---|---|---|---|
| very-active min/day | 0–43 | **138–519** | 0–18 |
| lightly-active min/day | 113–316 | **485–933** | 87–165 |
| sedentary min/day | 735–1,280 | **8–544** | 832–940 |
| calories_out | 2,303–3,595 | **6,120–9,853** | 2,277–2,880 |
| steps | 2,246–10,590 | 1,386–7,438 | 2,351–8,129 |
| HR-zone min (fat burn + cardio + peak) | 0–84 | **0–57** | 0–28 |
| resting HR | 63–68 | 65–71 | 65–66 |
| raw FITBIT points/day | 293–995 | **163–468** | 622–997 |
| nights missing HRV / SpO2 / sleep raw | — | **03-17 → 03-26 / 03-17 → 04-02 / 03-18 → 03-23** | none |

- **Minute level (03-24):** the watch emitted 1,001 active-minute points, against 145 on
  03-14. Vigorous minutes filled hours with few steps. 13:00 had 22 vigorous min on 71
  steps. 18:00 had 60 vigorous min on 1,141 steps (19/min). 19:00 had 52 vigorous min
  on 133 steps.
- **Heart rate disagrees:** the HR-zone signal (`active-zone-minutes`, the same
  watch) stayed at its normal 5–30 min/day. A vigorous (≥ 6 MET) minute without
  a fat-burn-or-higher HR minute is not physiological. Neither is ~9,800 kcal
  on 7,208 steps.
- **The watch was degraded throughout:** overnight HRV, SpO2 and sleep staging
  vanished in the same window, and the raw point volume halved. HRV
  returns 03-27; SpO2 and activity return 04-03/04-04. That fits a firmware or sensor-fusion
  fault on the watch, not a change in behaviour. Weights logged in the window
  (92.0 → 88.2 kg) are normal, so a bad profile weight did not inflate
  calories.
- **04-03 is a partial recovery day:** very-active 25 but lightly 541 and
  4,309 kcal (both still about 2× normal). Steps and very-active look normal
  that day, so the invariant does not flag it. The repair includes it as an
  optional line.

Steps and distance in the window are raw-backed. They look plausible for a
low-activity stretch and are kept.

### 6.3 Proposed repair (not executed)

The repair NULLs the derived activity columns and stamps a quarantine marker,
so the experiment engine and dashboards treat the days as missing instead of
as an effect. `_rollup_activity_daily` only rewrites days inside `rollup_days`
(scheduled: 45), so the repair holds. A manual rollup with `rollup_days ≥ 212`
(as of 2026-10-16) would re-fetch the same bad values from Google and undo it.
If that is ever needed, re-run this block afterwards, or teach the upsert to
skip rows carrying the `quarantine` key.

```sql
BEGIN;
UPDATE universe.fitbit_activity_daily
SET minutes_lightly_active = NULL, minutes_fairly_active = NULL,
    minutes_very_active = NULL, minutes_sedentary = NULL, calories_out = NULL,
    raw_jsonb = coalesce(raw_jsonb, '{}'::jsonb) || jsonb_build_object(
        'quarantine', 'watch-derived activity artifact; see docs/data-integrity-2026-10.md §6',
        'quarantined_values', jsonb_build_object(
            'lightly', minutes_lightly_active, 'fairly', minutes_fairly_active,
            'very', minutes_very_active, 'sedentary', minutes_sedentary,
            'calories_out', calories_out)),
    fetched_at = NOW()
WHERE date BETWEEN DATE '2026-03-18' AND DATE '2026-04-02'
  AND minutes_very_active >= 120;
-- expect UPDATE 16
-- Optional, partial-recovery day (very 25, lightly 541, 4,309 kcal):
--   rerun the UPDATE above with WHERE date = DATE '2026-04-03'  -- expect UPDATE 1
COMMIT;
```

The original values stay in `raw_jsonb->'quarantined_values'`, so the repair
can be undone. If NULL `calories_out` breaks a consumer that assumes it is
always present, drop that column from the SET. The calories are equally
wrong, though.

### 6.4 Guard

`check_very_active_plausibility` in `health_data_invariants.py` raises
`very_active_implausible` (alert) when all three of these hold:

- very-active ≥ 120 min, and
- steps < 50 per very-active minute, and
- HR-zone minutes (fat burn + cardio + peak) are missing or fewer than half the
  very-active minutes.

The zone test keeps low-step workouts with raised HR (cycling, rowing) from
alerting. Run read-only over the full history (986 rows, 2024-01-25 → 2026-10-16),
it flags **exactly the 16 days above and nothing else**. The nearest clean days
that stay quiet:

- 2025-09-28: 124 very-active on 6,048 steps, backed by 156 zone min and a
  logged exercise.
- 2026-04-17: 295 very-active on 18,984 steps.

The daily run's 120-day window doesn't reach March. Run
`main(window_days=240)` once to confirm the alerts before the repair and
their absence after it. Tests: `VeryActivePlausibilityTests` in
`tests/test_health_data_invariants.py`.
