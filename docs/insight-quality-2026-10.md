# Insight quality evaluation — October 2026

Does the analysis stack reach correct conclusions on this user's real data?
This report runs the **current `main`** "Did it work?" experiment engine and
the recovery event study on production data. It scores each verdict against
the known ground truth, then measures how the engines behave on **placebo
changepoints** (dates where nothing changed) and **shifted changepoints**
(a known effect's date moved around).

Everything was read-only. Nothing was written to the database, deployed, or
edited in `universe.intervention`.

## TL;DR

- **The engine finds real effects. It also "finds" effects nearly everywhere
  else.** On clean placebo dates (no logged change and no flagged
  measurement change in either window), **94–98% of reports would put a
  headline on the home screen, and 100% of them are graded `strong`.**
  Per metric, 8–77% of placebos get flagged `meaningful`. The worst are
  resting HR (52–77%) and HRV (58–67%).
- The cause is the `meaningful` rule (|Cohen's d| ≥ 0.3 plus a small
  minimum delta). It sits inside this person's own noise. Daily metrics
  drift and are autocorrelated, so two adjacent 30-day windows differ by
  |d| ≈ 0.94 (median) for resting HR. The `strong` grade only means "no
  confound found". It says nothing about whether the effect beats noise.
- **The true effect is detected and dated correctly.** For the Eight Sleep
  Pod, efficiency, time asleep, awake time and REM all peak within ±5 days
  of 2026-05-02. They stand out from the placebo null (exceedance
  0.009–0.07 at 30-day windows). Calibrating against the person's own
  placebo null would keep these claims and drop most false ones.
- **The 2026-06-12 Google Health "measurement change" confound is stale.**
  The whole sleep and HRV history has since been re-ingested through Google
  Health: every row is `main_sleep_v2` / `daily_hrv_v1` back to 2024-01. No
  step is detectable at the cutover in any metric. The confound still caps
  3 of the 4 real reports at `weak`. For strength training it is the only
  thing hiding a probably-spurious HRV headline, so don't remove it before
  calibrating (see the ranking).
- **A data artifact drives one report's biggest effect.** From 2026-03-18 to
  2026-04-02 the activity rows show 138–519 "very active" minutes a day on
  1.4k–7.4k steps. That makes the Escitalopram 20 mg report claim active
  minutes rose 584%, graded `moderate`. It also makes the Eight Sleep report
  claim active minutes "went the wrong way".
- **Recovery event study:** the real data has 2 eligible hot-blanket events
  and 0 massage events. The engine correctly refuses an aggregate. On
  placebo and planted-effect checks it is **unbiased but badly
  underpowered**. With 3 events, chance alone gives median deltas up to
  ±8.5 efficiency points. A real +3-point effect is recovered beyond the
  null only 30% of the time at 10 events and 61% at 20.
- **One small fix is implemented (test-first).** A dose change seen from
  another intervention's report is now counted once, not twice. Before the
  fix, "20 mg ended 5/4" and "10 mg started 5/8" were listed as two HIGH
  confounds.

## Method

- **Harness:** `dashboard/packages/server/scripts/eval/insightQuality.ts`.
  It runs the real repositories, `HealthDataService`, `HealthSeriesSource`,
  `ExperimentService`, `RecoveryAnalysisDatasetBuilder` and
  `RecoveryEventStudyService`, unmodified, on a `SnapshotPool`. That is a
  read-only stand-in for `pg` (`src/services/evaluation/snapshotPool.ts`)
  that replays result sets recorded from the exact SQL the repositories
  issue. The snapshot is fetched through a Windmill python3 preview on a
  `read_only` connection, because this machine has no route to Postgres.
  The pool also refuses write statements itself.
- **Fidelity check:** for all four interventions the harness output matches
  `GET /api/experiments/interventions/:id` on the deployed build (4400a3b)
  exactly: every n, mean, d, meaningful flag and confidence grade. The one
  intended difference is the confound dedupe below.
- **Today:** 2026-10-16. The data runs from 2024-01-26 to 2026-10-16: 924
  sleep nights and 660 recovery-aligned periods.
- **Placebos:** a fixed-window period intervention every 7 days through the
  whole history. Window lengths are 30 days, 59 days (the Escitalopram 20 mg
  span) and 90 days (the cap every open-ended real report hits). The real
  intervention list stays in place, so confounds are scanned exactly as in
  production. A placebo is **clean** when the engine's own scan finds no
  `nearby_intervention` and no `measurement_change`. Only clean placebos
  have no possible real effect to pick up.
- **Shifted changepoints:** each known effect date is moved by −28…+28 days
  with fixed 14- and 30-day windows.
- **Exceedance:** the share of clean placebos of the same window length
  with |d| at least the observed value. It is an empirical,
  autocorrelation-honest p-value analogue. With 85–108 placebos the
  smallest possible value is about 0.01.
- **Re-run:** see the header of `insightQuality.ts`. Real data stays in the
  gitignored `scripts/eval/.snapshot/`. This document holds only
  aggregates.

## Scorecard

| Intervention | Ground truth | Engine verdict (current main) | Grade |
|---|---|---|---|
| **Eight Sleep Pod** (2026-05-02) | Large sleep improvement on the same instrument: efficiency ~79.5→91, asleep +~43 min, awake −59%, REM up, time in bed unchanged. Confounded by escitalopram 20→10 mg on 05-08. | `weak`, headline REM +50% (d 1.10). Asleep +45.9 min (d 0.57), efficiency 86.0→90.8 (+4.8, d 0.67), awake −32.7% (d −0.51), time in bed +24 min (not meaningful). Escitalopram flagged HIGH. Also claims resting HR and HRV "improved" and active minutes "went the wrong way". | **Correct**: right direction, right date, right confound. Efficiency and awake are **understated** (see F4). Three extra claims are **overstated**: RHR p=0.12, HRV p=0.56, active minutes is the F3 artifact. |
| **Escitalopram 10 mg** (2026-05-08) | Not independently known. It is the confound of the Pod. | `weak`. Same sleep improvements as the Pod, with the Pod flagged HIGH, 6 days apart. | **Correct.** The two cannot be separated from this data, and the report says so. |
| **Escitalopram 20 mg** (2026-03-07 → 05-04) | Nothing known. | `moderate`. Ten metrics "moved", headline time in bed −114 min (d −0.96). Biggest d is active minutes +584% (d 0.90). | **Overstated.** Active minutes is the F3 artifact. Only asleep/in-bed beat the placebo null (p=0.011), and the after window has 8 missing nights and 5 nights shorter than 4 h. `moderate` is too generous for the most artifact-exposed report. |
| **Strength training 3x/week** (2026-07-06) | MET-based active minutes fell while training load rose. | `weak`. Headline HRV +17.4% (d 0.77). Asleep +24 min "improved", steps −21% "wrong way". Active minutes 32.5→23.3 (−28%) **not meaningful** (d −0.23). Weak *only* because of the stale 06-12 measurement change. | **Missed / overstated.** The active-minutes drop is computed but not called. In 30-day shifted windows it does not step at 07-06 (d 0.17; it peaks at −17 days, mid-June), so the 90-day comparison mostly measures a May→June decline. The HRV headline is drift (p=0.081, no peak). Training load is not a metric, so the intended effect is invisible (see R7). |
| **Google Health cutover** (2026-06-12, measurement) | HRV level shift ~+17%. | Not an intervention. A placebo at 06-12 shows HRV +4.4 ms (d 0.54) at 30 days, but the shifted sweep is a **plateau** (d 0.4–0.6 from −28 to +16 days), exceedance p=0.39. | **No longer present in the stored data.** The history was re-ingested with uniform regimes, so the ground-truth shift has been normalized away. The engine's hard-coded confound is now stale (F2). |

Totals: **2 correct, 2 overstated (one of them also missed its real
effect), 0 understated as a verdict.** Within the Pod report, efficiency
and awake time are understated.

## Placebo false-positive rate

This is the share of clean placebo reports in which each metric is flagged
`meaningful`. Every clean placebo was graded `strong`, so this is also the
rate of claims a reader would take at face value.

| Metric | 30-day (n=108) | 59-day (n=94) | 90-day (n=85) | Null \|d\| p95, 30 / 59 / 90 d |
|---|---|---|---|---|
| Time asleep | 32.4% | 14.9% | 8.2% | 0.58 / 0.44 / 0.35 |
| Time in bed | 35.2% | 23.4% | 23.5% | 0.61 / 0.49 / 0.51 |
| Sleep efficiency | 42.6% | 38.3% | 27.1% | 0.99 / 1.14 / 1.42 |
| Awake in bed | 42.6% | 35.1% | 27.1% | 0.88 / 1.08 / 1.34 |
| Deep sleep | 39.8% | 29.8% | 29.4% | 0.74 / 0.53 / 0.54 |
| REM sleep | 50.9% | 40.4% | 22.4% | 0.82 / 0.58 / 0.46 |
| Resting HR | **76.9%** | **66.0%** | **51.8%** | **2.77** / 1.21 / 0.94 |
| HRV (RMSSD) | **66.7%** | **59.6%** | **57.6%** | 1.36 / 0.78 / 0.78 |
| Steps | 49.1% | 47.9% | 35.3% | 0.99 / 0.68 / 0.61 |
| Active minutes* | 45.8% | 36.8% | 32.4% | 0.64 / 0.55 / 0.47 |

| Report level (clean placebos) | 30-day | 59-day | 90-day |
|---|---|---|---|
| Home-screen headline shown | 98.1% | 94.7% | 94.1% |
| Graded `strong` | 100% | 100% | 100% |
| Headline under per-metric p95 calibration (leave-one-out) | 28.7% | 34.0% | 36.5% |

\* Active minutes is only judged on 34–48 placebos. Both activity columns
were NULL before 2025-04.

Reading notes:

- Including non-clean placebos changes little: headline 95.7–98.5%, `weak`
  13–18%.
- Consecutive placebos overlap, so they are correlated draws, not 100+
  independent trials. Treat the rates as ±~10 points.
- The null includes **unlogged real changes**. The largest clean-placebo
  efficiency/awake "effect" is 2025-07-06 (efficiency −6.7 pts, awake
  +33 min). Monthly means confirm a level shift: efficiency 94.5 in June
  2025 vs 88.6 in July, awake 27.6 vs 56.1 min. Summer 2024 has ±6.5 bpm
  RHR and ±15 ms HRV swings. These widen the null. A calibrated threshold
  built from it is conservative, not lax.
- Per-metric calibration alone still leaves ~30% of reports with *some*
  headline, because ten metrics are tested at once. Report-level control
  needs a multiplicity step (R1).

## Shifted changepoints

The 30-day window is the clean test. The 14-day window is noisier but
sharper.

| Known effect | Metric | Peak offset (30d / 14d) | d at true date (30d) | Reading |
|---|---|---|---|---|
| Eight Sleep 05-02 | efficiency | +2 / −3 | 1.07 | Step at the true date ✓ (plateau ≈1.0 from −3 to +4) |
| | awake | +3 / −3 | −0.84 | Step ✓ |
| | REM | −2 / −5 | 1.37 | Step ✓ |
| | asleep | −5 / +17 | 1.04 | Broad plateau from −8 to +2. Partly the late-April short nights |
| Cutover 06-12 | HRV | −25 / +7 | 0.54 | **No step**: flat 0.4–0.6 across −28…+16 |
| | efficiency | −28 / −9 | −0.20 | No step |
| Strength 07-06 | active minutes | −17 / −23 | 0.17 | **No step at 07-06**. The decline is in mid-June |
| | resting HR | −12 / −13 | −1.08 | Drift or an earlier event: d −2.48 at −12, +1.48 at +20 |

So the engine's arithmetic locates a real step correctly. What it lacks is
any check of whether the step is at the pivot. The strength-training
resting-HR effect (−1.08 at 30 days) would be reported as `meaningful`,
yet it is clearly not anchored on 07-06.

## Recovery event study

| | Value |
|---|---|
| Real sessions | Hot blanket 3 (2 eligible), massage 1 (0 eligible) |
| Engine state | `individual` / `collecting`: **no aggregate shown** ✓ |
| Matched pairs | 2 (requires 10) ✓ |

Placebo anchors are random session-free nights at least 15 days apart, with
no real session within ±7 days. Each row is 300–400 draws.

| Events | Chance \|median Δ\| p95, efficiency d0 / d1 | Same, HRV d0 / d1 | Power: +3 eff @ d0 | Power: +5 ms HRV @ d1 |
|---|---|---|---|---|
| 3 | 8.5 / 10.0 pts | 12.9 / 14.0 ms | 2.7% | 9.3% |
| 5 | 6.0 / 5.0 | 10.2 / 11.7 | 7.3% | 10.4% |
| 10 | 4.0 / 4.5 | 7.8 / 8.3 | 30.0% | 29.0% |
| 20 | 2.7 / 3.0 | 5.3 / 6.1 | 61.3% | 39.7% |

The planted effect is recovered without bias: median recovered +3.0
efficiency and +4.4–4.8 ms HRV against +3 and +5 planted. The control
selection is sound. But the engine shows a "provisional" aggregate from
**3** eligible events. At 3 events, ±8–14 units arises from nothing, and a
real, plausible effect is visible beyond chance under 10% of the time.

## Failure cases

**F1. `meaningful` and `strong` do not discriminate.** On 108 clean
30-day placebos the engine produced 106 headlines, all graded `strong`.
Resting HR is flagged on 77% of them. Its null |d| median is 0.94 at 30
days, against a 0.3 threshold. Cohen's d with a within-window SD is the
wrong yardstick for a series whose level wanders by more than its daily
noise. `gradeConfidence` never looks at effect evidence: no confounds plus
30-day windows gives `strong`.

**F2. A stale measurement-change confound.**
`MEASUREMENT_CHANGES` hard-codes 2026-06-12 for sleep, HRV and activity.
The stored data no longer carries that change. Every sleep row since
2024-01-26 is `_src=google_health, method=main_sleep_v2` (924 rows). HRV is
`daily_hrv_v1` (901 of 906 rows; the 5 others are stray single days). No
metric steps at 06-12 in the shifted sweep. The confound is HIGH whenever
06-12 falls anywhere inside the span: the "straddles" test is
`> before.start && < after.end`, so `medium` is effectively unreachable. It
caps the Pod, Escitalopram 10 mg and strength-training reports at `weak`.
For strength training it is the *only* HIGH confound, so removing it alone
would promote a drift-driven HRV headline to `moderate`.

**F3. Implausible activity days enter the activity metrics.** 21 days have
fairly+very active > 120 min on < 8,000 steps. 16 of them are consecutive,
2026-03-18 → 04-02: 138–519 very-active and 500–930 lightly-active minutes
a day at 1,386–7,438 steps, with no sleep rows for 03-18 → 03-23. That is
consistent with the tracker being off-wrist, but unconfirmed. Effects:

- Escitalopram 20 mg: active minutes 16.6 → 113.4 (+584%, d 0.90, the
  report's largest).
- Eight Sleep Pod: active minutes 80.1 → 25.1, "went the wrong way".
- Escitalopram 10 mg: 83.3 → 23.8.

`isWearDay` (steps > 0) does not catch it.

**F4. Window choice dilutes a real step.** For the Pod, the 90-day before
window (02-01 → 05-01) starts before Escitalopram 20 mg (03-07). It spans a
period when efficiency was already rising (Feb 82.1 → Mar 89.8). The
reported efficiency gain is therefore +4.8 (d 0.67, p=0.20 against
90-day placebos). At 30 days it is +7.0 (d 1.07, p=0.046); at 14 days,
d 1.24. Fragmented "main sleep" nights (< 4 h in bed, 6 in that before
window) barely matter (efficiency 86.0 vs 85.6 without them). I could not
reproduce the ground truth's 79.5 pre-level from the stored data in any
window. The likely reason is that the ground truth used Fitbit-supplied
efficiency, while the re-ingested history uses the derived value.

**F5. Drift reported as an effect.** Strength-training resting HR: d −1.08
at 30 days, `meaningful`, yet its |d| peaks 12 days *before* the pivot
(d −2.48) and reverses sign by +16 days. HRV after the cutover is a flat
plateau. Nothing in the report distinguishes a step from a trend, even
though the series it already returns would allow it.

**F6. Duplicate confound for one dose change (fixed).** The Pod report
listed "Escitalopram 20 mg ended 2 days from this change" and
"Escitalopram 10 mg started 6 days from this change" as two HIGH
confounds. Strength training had the same pair as two MEDIUM ones.

**F7. The event study aggregates far below its noise floor.** See the table
above: 3 events, and ±8.5 efficiency points arise by chance.

## Recommended engine changes (ranked by impact)

1. **Calibrate `meaningful` against the person's own placebo null (fixes
   F1, most of F5).** At report time, compute |d| for the same metric and
   window length at historical placebo dates. Exclude windows that touch
   any intervention or the report's own windows. Call a metric meaningful
   only above the null p95. The engine already has the data port, and
   `src/services/evaluation/counterfactuals.ts` has the mechanics. For the
   headline, control multiplicity: take the minimum over metrics of
   per-metric exceedance, and compare it with the same statistic across
   placebos. That gives ≈5% report-level. On this data it keeps the Pod's
   asleep/REM (p≈0.01) and its efficiency at ≤30 days. It drops RHR/HRV
   everywhere and drops strength training's HRV headline. Expose the
   exceedance in the report instead of a bare d. Large change: needs an
   API field and UI copy.
2. **Make `strong` require evidence, not just absence of confounds (F1).**
   Grade on the calibrated exceedance of the headline: `strong` only if it
   beats the report-level null and is clean. Today 100% of clean placebos
   are `strong`.
3. **Exclude implausible activity days (F3).** In `HealthSeriesSource`,
   drop days where fairly+very active minutes are inconsistent with steps,
   for example very-active > 120 min with < 8,000 steps. Also flag the
   2026-03-18 → 04-02 rows to the ingest owner (see the shared notes). This
   removes the largest single false effect and is small. I did not make it
   here because the threshold is a judgement call the user should approve.
4. **Derive measurement changes from provenance, not a constant (F2).**
   Every point already carries `provenance.regimes`. Flag
   `measurement_change` only when the regimes in the before and after
   windows differ. Fix severity to mean what the comment says. **Ship
   after (1)**, or it will upgrade spurious headlines.
5. **Step-vs-drift diagnostic (F5).** Re-run the comparison at pivot ±7 and
   ±14 days, which is cheap with data already fetched. If |d| at the pivot
   is not within ~80% of the local max, label the metric "trend, not a
   step at this date" and keep it out of the headline.
6. **Bound the before window at the previous relevant boundary (F4).** When
   another intervention boundary sits in the before window, truncate it
   there, with a 14-day minimum, or show the 30-day comparison next to the
   90-day one. For the Pod, the 30-day comparison gives efficiency d 1.07 against
   0.67 at 90 days.
7. **Training-load metric.** Strength training's intended effect (load up,
   MET minutes not) has no metric. Add a training-load series from
   `buildTrainingDays` so the engine can see it.
8. **Event study: show the noise floor (F7).** Attach the placebo null band
   to the provisional aggregate, or raise the aggregate minimum from 3 to
   about 10 events and say "needs ~20 sessions to see a 3-point change".
   `eventStudyNull` / `eventStudyPower` compute both.
9. ~~Dedupe dose-handoff confounds (F6).~~ **Done in this PR.**

## What changed in this PR

- `confounds.ts`: a medication's old-dose end is no longer reported as a
  separate confound in **another** intervention's report when the next
  dose starts within 10 days and inside the windows. The new dose's start
  stands for the change. Tests are in `experimentEngine.test.ts`: written
  first, failed, now pass.
- `src/services/evaluation/counterfactuals.ts`: reusable placebo,
  shifted-changepoint, exceedance, event-study null and planted-power
  checks that drive the production engines through their public ports.
  Tests on synthetic data are in `counterfactuals.test.ts`: pure noise,
  planted steps, linear drift, planted event effects.
- `src/services/evaluation/snapshotPool.ts`: read-only replay pool, tested
  in `snapshotPool.test.ts`.
- `scripts/eval/insightQuality.ts` + `windmillFetch.ts`: the harness.

## Caveats

- "Clean" means no *logged* change. Unlogged changes (July 2025, summer
  2024) sit in the null and make it wider. That makes the false-positive
  rates conservative, but a calibrated threshold slightly less sensitive.
- The ground-truth numbers come from an earlier manual analysis on data
  that has since been re-ingested. Direction and date are reproducible;
  the pre-level of 79.5 is not.
- The event-study power uses a fixed planted delta on random nights. Real
  effects may vary with session duration and timing.
