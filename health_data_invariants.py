"""
Windmill scheduled script — daily health-data integrity invariants.

Recomputes the raw-backed rollups from universe.google_health_data_point,
diffs them against the universe.fitbit_* compatibility tables the dashboard
reads, and runs plausibility checks over the stored days. It is strictly
READ-ONLY: the connection is opened read-only and nothing here repairs data.
Repairs are reviewed by a human (see docs/data-integrity-2026-10.md).

Why this exists: every serious health-data bug so far was found by checking
stored values against raw points after the fact — the steps rollup
truncating the window-edge day, HR-zone columns frozen at cutover, deep RMSSD
missing. Each would have been caught on day one by an invariant like these.

Shape: SQL fetchers return plain dict rows; every check is a pure function
over those rows returning violation dicts, so tests drive the checks with
fake rows and no database. Violations carry a severity:

  alert  stored data disagrees with raw, or is impossible
  warn   implausible but possibly real, or a known-soft source mismatch

Like evaluate_health_alerts.py, the summary is printed and returned, and
alert/warn violations can be fanned out to Apprise. Push is OFF by default:

Activation checklist:
  1. Deploy at u/kevin/health_data_invariants (imports u/kevin/ingest_common).
  2. Run once by hand and confirm the known findings in the 2026-10 report
     are the only violations (or have been repaired).
  3. Schedule daily (after the 4-hourly ingest, e.g. 11:00 UTC) with
     push=true.
"""

from datetime import date, timedelta
from decimal import Decimal

# Plain top-level imports: Windmill's dependency inference ignores imports
# made inside functions or try blocks. Tests stub psycopg/wmill when absent.
import psycopg
import requests
import wmill

USER_TZ = "America/New_York"

# ---------------------------------------------------------------------------
# Column policy
# ---------------------------------------------------------------------------

# Columns with no Google Health equivalent. They legitimately stop at the
# cutover (or earlier) and must never be reported as stale. Keep each entry's
# reason next to it so a later reader can challenge it.
FROZEN_COLUMNS = {
    ("fitbit_activity_daily", "calories_bmr"): "no Google equivalent (unmapped at cutover)",
    ("fitbit_activity_daily", "active_calories"): "Google active-energy-burned is a different definition",
    ("fitbit_activity_daily", "minutes_sedentary"): "Google sedentary-period differs; unmapped",
    ("fitbit_body_weight", "bmi"): "Google weight carries no BMI; legacy-only",
    ("fitbit_body_weight", "fat_pct"): "never populated",
    ("fitbit_cardio_score_daily", "vo2_max"): "Google vo2-max returns {} for this account",
    ("fitbit_exercise_log", "activity_type_id"): "not in Google exercise payload",
    ("fitbit_exercise_log", "elevation_gain"): "Pixel Watch 4 stopped reporting elevation after 2026-08-12",
    ("fitbit_food_log_daily", "water"): "no hydration type captured",
    ("fitbit_food_log_daily", "calorie_goal"): "not in Google nutrition-log",
    ("fitbit_heart_rate_daily", "zone_out_of_range_min"): "AZM only records zone-earning minutes",
    ("fitbit_heart_rate_daily", "zone_fat_burn_cal"): "no per-zone calories from Google",
    ("fitbit_heart_rate_daily", "zone_cardio_cal"): "no per-zone calories from Google",
    ("fitbit_heart_rate_daily", "zone_peak_cal"): "no per-zone calories from Google",
    ("fitbit_heart_rate_daily", "zone_out_of_range_cal"): "no per-zone calories from Google",
}

# Columns filled only when the user does something (logs food, weighs in,
# records a walk). Staleness there is behaviour, not breakage, so they are
# exempt from freshness and null-rate checks.
SPARSE_COLUMNS = {
    ("fitbit_body_weight", "weight_kg"),
    ("fitbit_body_weight", "log_id"),
    ("fitbit_exercise_log", "steps"),
    ("fitbit_exercise_log", "distance"),
    ("fitbit_exercise_log", "calories"),
    ("fitbit_exercise_log", "duration_ms"),
    ("fitbit_exercise_log", "average_heart_rate"),
    ("fitbit_exercise_log", "log_id"),
}
SPARSE_TABLES = {"fitbit_food_log_daily", "fitbit_ingest_state_retired_20260809"}

# Daily tables written every day the watch is worn. Freshness is judged
# against "yesterday", since today's row may not exist before the first run.
MAX_STALE_DAYS = 2
MAX_NULL_RATE = 0.15

# Steps per km on days with enough walking to be meaningful. 1342-1500 is the
# validated walking band; running/treadmill days legitimately reach ~1200.
STEPS_PER_KM_BAND = (1150, 1600)
STEPS_PER_KM_MIN_STEPS = 1000
DISTANCE_TOLERANCE_KM = 0.05
DISTANCE_TOLERANCE_PCT = 0.03

RHR_RANGE = (35, 100)
RHR_MAX_DAY_JUMP = 15
SLEEP_ASLEEP_RANGE = (120, 900)

# Very-active (MET-based VIGOROUS) minutes need movement or a raised heart
# rate behind them. 2026-03-18..04-02 the watch derived 138-519/day on
# 1.4k-7.4k steps with only 5-57 HR-zone minutes (see the data-integrity
# report). Implausible = at least VERY_ACTIVE_MIN_FLAG minutes, fewer than
# MIN_STEPS_PER_VERY_ACTIVE_MIN steps per such minute, and (when zone data
# exists) more than MAX_VERY_ACTIVE_PER_ZONE_MIN very-active per HR-zone minute.
VERY_ACTIVE_MIN_FLAG = 120
MIN_STEPS_PER_VERY_ACTIVE_MIN = 50
MAX_VERY_ACTIVE_PER_ZONE_MIN = 2

# Recomputed-vs-stored tolerance per comparison (absolute).
TOLERANCE = {
    "steps": 0,
    "resting_heart_rate": 0,
    "breathing_rate": 0.011,
    "nightly_relative": 0.011,
    "daily_rmssd": 0.011,
    "deep_rmssd": 0.011,
    "non_rem_heart_rate": 0.011,
    "zone_fat_burn_min": 0,
    "zone_cardio_min": 0,
    "zone_peak_min": 0,
    "total_minutes_asleep": 0,
    "total_minutes_in_bed": 0,
    "spo2_avg": 0.011,
}


def violation(check: str, severity: str, detail: str, day=None, **extra) -> dict:
    out = {"check": check, "severity": severity, "date": str(day) if day else None, "detail": detail}
    # psycopg hands back Decimal for numeric columns; keep the result JSON-able.
    out.update({k: float(v) if isinstance(v, Decimal) else v for k, v in extra.items()})
    return out


# ---------------------------------------------------------------------------
# Pure checks (rows in, violations out)
# ---------------------------------------------------------------------------


def check_column_freshness(rows, today: date) -> list:
    """rows: {table, column, last_non_null (date|None), null_rate (0-1|None)}.

    Live columns must have a value within MAX_STALE_DAYS and a null rate under
    MAX_NULL_RATE over the lookback window. Frozen and sparse columns are
    skipped — a frozen column that comes BACK to life is reported too, since
    that means the policy above is stale.
    """
    out = []
    for r in rows:
        key = (r["table"], r["column"])
        last = r.get("last_non_null")
        if key in FROZEN_COLUMNS:
            if last is not None and (today - last).days <= MAX_STALE_DAYS:
                out.append(violation(
                    "frozen_column_revived", "warn",
                    f"{r['table']}.{r['column']} is listed frozen ({FROZEN_COLUMNS[key]}) "
                    f"but has a value on {last}", last))
            continue
        if key in SPARSE_COLUMNS or r["table"] in SPARSE_TABLES:
            continue
        if last is None or (today - last).days > MAX_STALE_DAYS:
            out.append(violation(
                "stale_column", "alert",
                f"{r['table']}.{r['column']} last non-null {last or 'never'}", last))
        rate = r.get("null_rate")
        if rate is not None and rate > MAX_NULL_RATE:
            out.append(violation(
                "null_rate", "warn",
                f"{r['table']}.{r['column']} is {rate:.0%} NULL over the lookback window"))
    return out


def _close(a, b, tol) -> bool:
    if a is None or b is None:
        return a is None and b is None
    return abs(float(a) - float(b)) <= tol


def check_rollup_drift(metric: str, recomputed: dict, stored: dict, today: date,
                       stored_may_exceed: bool = False) -> list:
    """Compare per-day recomputed values with stored values.

    ``recomputed`` / ``stored`` map date -> value. Today is skipped: the
    in-progress day is legitimately behind raw until the next ingest.
    ``stored_may_exceed`` is for monotone GREATEST-written sums (steps, zone
    minutes), where stored above raw is allowed only if raw has gaps — we
    still flag it, but as warn rather than alert.
    """
    tol = TOLERANCE.get(metric, 0)
    out = []
    for day in sorted(set(recomputed) | set(stored)):
        if day >= today:
            continue
        r, s = recomputed.get(day), stored.get(day)
        if _close(r, s, tol):
            continue
        if r is None:
            out.append(violation(
                "rollup_orphan", "warn",
                f"{metric}: stored {s} but no raw evidence recomputes this day", day,
                metric=metric, stored=s, recomputed=None))
        elif s is None:
            out.append(violation(
                "rollup_missing", "alert",
                f"{metric}: raw recomputes {r} but nothing stored", day,
                metric=metric, stored=None, recomputed=r))
        else:
            severity = "warn" if stored_may_exceed and float(s) > float(r) else "alert"
            out.append(violation(
                "rollup_drift", severity,
                f"{metric}: stored {s} vs raw {r}", day,
                metric=metric, stored=s, recomputed=r))
    return out


def check_distance_consistency(rows, today: date) -> list:
    """rows: {date, steps, distance_km, raw_fitbit_km}.

    Steps are summed from FITBIT-platform raw points only, but distance_km
    comes from Google's merged dailyRollUp, which also folds in phone (Health
    Connect) distance. When the two diverge, steps/km is no longer meaningful.
    Also flags steps/km outside the plausibility band.
    """
    out = []
    for r in rows:
        day = r["date"]
        if day >= today:
            continue
        stored, raw = r.get("distance_km"), r.get("raw_fitbit_km")
        if stored is not None and raw is not None:
            gap = float(stored) - float(raw)
            if abs(gap) > max(DISTANCE_TOLERANCE_KM, DISTANCE_TOLERANCE_PCT * float(raw)):
                out.append(violation(
                    "distance_source_mismatch", "warn",
                    f"distance_km {float(stored):.3f} vs watch raw {float(raw):.3f} km ({gap:+.3f})",
                    day, stored=float(stored), recomputed=float(raw)))
        steps = r.get("steps")
        if steps and steps >= STEPS_PER_KM_MIN_STEPS and stored:
            spk = steps / float(stored)
            lo, hi = STEPS_PER_KM_BAND
            if not lo <= spk <= hi:
                out.append(violation(
                    "steps_per_km", "warn",
                    f"{spk:.0f} steps/km ({steps} steps, {float(stored):.3f} km)", day,
                    steps_per_km=round(spk)))
    return out


def check_sleep_plausibility(rows) -> list:
    """rows: {date, asleep, in_bed, efficiency, deep, light, rem}."""
    out = []
    for r in rows:
        day, asleep, in_bed = r["date"], r.get("asleep"), r.get("in_bed")
        if asleep is None:
            continue
        if in_bed is not None and asleep > in_bed:
            out.append(violation("sleep_exceeds_in_bed", "alert",
                                 f"asleep {asleep} > in bed {in_bed} min", day))
        lo, hi = SLEEP_ASLEEP_RANGE
        if not lo <= asleep <= hi:
            out.append(violation("sleep_duration", "warn",
                                 f"main sleep {asleep} min outside {lo}-{hi}", day))
        eff = r.get("efficiency")
        if eff is not None and not 50 <= eff <= 100:
            out.append(violation("sleep_efficiency", "warn", f"efficiency {eff}%", day))
        stages = [r.get(k) for k in ("deep", "light", "rem")]
        if in_bed is not None and all(s is not None for s in stages) and sum(stages) > in_bed:
            out.append(violation("sleep_stage_sum", "alert",
                                 f"deep+light+rem {sum(stages)} > in bed {in_bed} min", day))
    return out


def check_resting_hr(rows) -> list:
    """rows: {date, resting_heart_rate} in any order."""
    out = []
    prev = None
    lo, hi = RHR_RANGE
    for r in sorted(rows, key=lambda x: x["date"]):
        rhr = r.get("resting_heart_rate")
        if rhr is None:
            continue
        if not lo <= rhr <= hi:
            out.append(violation("rhr_range", "alert", f"resting HR {rhr} outside {lo}-{hi}", r["date"]))
        if prev and (r["date"] - prev[0]).days == 1 and abs(rhr - prev[1]) > RHR_MAX_DAY_JUMP:
            out.append(violation("rhr_jump", "warn",
                                 f"resting HR {prev[1]} -> {rhr} day over day", r["date"]))
        prev = (r["date"], rhr)
    return out


def check_very_active_plausibility(rows) -> list:
    """rows: {date, steps, minutes_very_active, zone_minutes}; zone_minutes is
    fat-burn + cardio + peak, or None when the day has no zone row.

    A non-walking workout (cycling, rowing) has few steps but raised HR, so the
    zone test exempts it; without zone data, steps alone decide."""
    out = []
    for r in rows:
        very, steps, zone = r.get("minutes_very_active"), r.get("steps"), r.get("zone_minutes")
        if very is None or steps is None or very < VERY_ACTIVE_MIN_FLAG:
            continue
        if steps >= MIN_STEPS_PER_VERY_ACTIVE_MIN * very:
            continue
        if zone is not None and very <= MAX_VERY_ACTIVE_PER_ZONE_MIN * zone:
            continue
        out.append(violation(
            "very_active_implausible", "alert",
            f"{very} very-active min on {steps} steps ({steps / very:.0f}/min) with "
            f"{'no' if zone is None else zone} HR-zone min", r["date"],
            minutes_very_active=very, steps=steps, zone_minutes=zone))
    return out


def check_zone_nulls(rows, today: date) -> list:
    """rows: {date, steps, zone_cardio_min}. A worn day with no zone-earning
    minute should store 0, not NULL — NULL reads as 'no data' downstream."""
    return [
        violation("zone_null_on_worn_day", "warn",
                  f"HR zone minutes NULL on a day with {r['steps']} steps", r["date"])
        for r in rows
        if r["date"] < today and r.get("zone_cardio_min") is None and (r.get("steps") or 0) > 0
    ]


def check_weight_duplicates(rows) -> list:
    """rows: {date, log_id, weight_kg, source}. Two sources logging the same
    weigh-in on one day (legacy 'API' + 'google_health') double count it."""
    by_day = {}
    for r in rows:
        by_day.setdefault(r["date"], []).append(r)
    out = []
    for day, logs in sorted(by_day.items()):
        sources = {r["source"] for r in logs}
        if len(logs) < 2 or len(sources) < 2:
            continue
        kgs = [float(r["weight_kg"]) for r in logs]
        if max(kgs) - min(kgs) <= 0.5:
            out.append(violation(
                "duplicate_weight", "warn",
                f"{len(logs)} logs ({', '.join(sorted(sources))}) within "
                f"{max(kgs) - min(kgs):.2f} kg on one day", day,
                log_ids=[r["log_id"] for r in logs]))
    return out


def check_unrouted_points(rows) -> list:
    """rows: {data_type, n, first_date}. Rollups route on source_platform =
    'FITBIT'; points with NULL platform (e.g. manually logged exercise) are
    silently skipped."""
    return [
        violation("unrouted_raw_points", "warn",
                  f"{r['n']} {r['data_type']} point(s) with NULL source_platform are never rolled up",
                  r.get("first_date"))
        for r in rows if r["n"]
    ]


def check_missing_days(table: str, present_days, start: date, today: date) -> list:
    """Report gap days (excluding today) in a daily table."""
    present = set(present_days)
    out = []
    d = start
    while d < today:
        if d not in present:
            out.append(violation("missing_day", "warn", f"{table} has no row", d, table=table))
        d += timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# SQL fetchers (read-only)
# ---------------------------------------------------------------------------

_NUMERIC = ("integer", "bigint", "numeric", "double precision", "real", "smallint")


def _rows(cur, sql: str, params=()) -> list:
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _day_map(cur, sql: str, params=()) -> dict:
    cur.execute(sql, params)
    return {d: v for d, v in cur.fetchall()}


def fetch_column_stats(cur, lookback_days: int) -> list:
    cur.execute(
        """SELECT c.table_name, c.column_name FROM information_schema.columns c
           WHERE c.table_schema='universe' AND c.table_name LIKE 'fitbit\\_%%'
             AND c.data_type = ANY(%s)
             AND EXISTS (SELECT 1 FROM information_schema.columns d
                         WHERE d.table_schema='universe' AND d.table_name=c.table_name
                           AND d.column_name='date')
           ORDER BY 1, c.ordinal_position""",
        (list(_NUMERIC),),
    )
    by_table = {}
    for t, c in cur.fetchall():
        by_table.setdefault(t, []).append(c)
    out = []
    for table, cols in by_table.items():
        # Identifiers come from information_schema, not user input.
        parts = []
        for c in cols:
            parts.append(f'max(date) FILTER (WHERE "{c}" IS NOT NULL)')
            parts.append(
                f'count(*) FILTER (WHERE "{c}" IS NULL AND date > current_date - %(lb)s)::float'
                f' / NULLIF(count(*) FILTER (WHERE date > current_date - %(lb)s), 0)')
        cur.execute(f'SELECT {", ".join(parts)} FROM universe."{table}"', {"lb": lookback_days})
        r = cur.fetchone()
        for i, c in enumerate(cols):
            out.append({"table": table, "column": c,
                        "last_non_null": r[2 * i], "null_rate": r[2 * i + 1]})
    return out


RAW = "universe.google_health_data_point"

_DAILY_RECOMPUTE = {
    # metric: (raw SQL -> (date, value), stored SQL -> (date, value))
    "resting_heart_rate": (
        f"""SELECT point_date, max((value_jsonb->'dailyRestingHeartRate'->>'beatsPerMinute')::numeric)::int
            FROM {RAW} WHERE data_type='daily-resting-heart-rate' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, resting_heart_rate FROM universe.fitbit_heart_rate_daily WHERE date >= %(since)s"),
    "breathing_rate": (
        f"""SELECT point_date, max((value_jsonb->'dailyRespiratoryRate'->>'breathsPerMinute')::numeric)
            FROM {RAW} WHERE data_type='daily-respiratory-rate' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, breathing_rate FROM universe.fitbit_breathing_rate_daily WHERE date >= %(since)s"),
    "nightly_relative": (
        f"""SELECT point_date, round(max((value_jsonb->'dailySleepTemperatureDerivations'->>'nightlyTemperatureCelsius')::numeric
                 - (value_jsonb->'dailySleepTemperatureDerivations'->>'baselineTemperatureCelsius')::numeric), 2)
            FROM {RAW} WHERE data_type='daily-sleep-temperature-derivations' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, nightly_relative FROM universe.fitbit_skin_temp_daily WHERE date >= %(since)s"),
    "daily_rmssd": (
        f"""SELECT point_date, max((value_jsonb->'dailyHeartRateVariability'->>'averageHeartRateVariabilityMilliseconds')::numeric)
            FROM {RAW} WHERE data_type='daily-heart-rate-variability' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, daily_rmssd FROM universe.fitbit_hrv_daily WHERE date >= %(since)s"),
    "deep_rmssd": (
        f"""SELECT point_date, max((value_jsonb->'dailyHeartRateVariability'->>'deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds')::numeric)
            FROM {RAW} WHERE data_type='daily-heart-rate-variability' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, deep_rmssd FROM universe.fitbit_hrv_daily WHERE date >= %(since)s"),
    "non_rem_heart_rate": (
        f"""SELECT point_date, max((value_jsonb->'dailyHeartRateVariability'->>'nonRemHeartRateBeatsPerMinute')::numeric)
            FROM {RAW} WHERE data_type='daily-heart-rate-variability' AND source_platform='FITBIT'
              AND point_date >= %(since)s GROUP BY 1""",
        "SELECT date, non_rem_heart_rate FROM universe.fitbit_hrv_daily WHERE date >= %(since)s"),
    # Sleep: point_date of a sleep point is its civil wake date (capture
    # contract); main session = most minutes asleep, as in _rollup_sleep.
    "total_minutes_asleep": (
        f"""SELECT DISTINCT ON (point_date) point_date, (value_jsonb->'sleep'->'summary'->>'minutesAsleep')::int
            FROM {RAW} WHERE data_type='sleep' AND source_platform='FITBIT' AND point_date >= %(since)s
            ORDER BY point_date, (value_jsonb->'sleep'->'summary'->>'minutesAsleep')::int DESC,
                     (value_jsonb->'sleep'->'summary'->>'minutesInSleepPeriod')::int DESC""",
        "SELECT date, total_minutes_asleep FROM universe.fitbit_sleep_daily WHERE date >= %(since)s"),
    "total_minutes_in_bed": (
        f"""SELECT DISTINCT ON (point_date) point_date, (value_jsonb->'sleep'->'summary'->>'minutesInSleepPeriod')::int
            FROM {RAW} WHERE data_type='sleep' AND source_platform='FITBIT' AND point_date >= %(since)s
            ORDER BY point_date, (value_jsonb->'sleep'->'summary'->>'minutesAsleep')::int DESC,
                     (value_jsonb->'sleep'->'summary'->>'minutesInSleepPeriod')::int DESC""",
        "SELECT date, total_minutes_in_bed FROM universe.fitbit_sleep_daily WHERE date >= %(since)s"),
    # SpO2 is keyed to the containing FITBIT sleep session's wake date.
    "spo2_avg": (
        f"""SELECT d, round(avg(p), 2) FROM (
              SELECT sleep.point_date d, (s.value_jsonb->'oxygenSaturation'->>'percentage')::numeric p
              FROM {RAW} s
              JOIN LATERAL (SELECT c.point_date FROM {RAW} c
                   WHERE c.data_type='sleep' AND c.source_platform='FITBIT' AND c.point_date >= %(since)s
                     AND s.start_time >= c.start_time AND s.start_time < c.end_time
                   ORDER BY c.end_time - c.start_time DESC, c.start_time DESC LIMIT 1) sleep ON TRUE
              WHERE s.data_type='oxygen-saturation' AND s.source_platform='FITBIT'
                AND s.start_time >= %(since)s::date - 1) x
            WHERE p BETWEEN 80 AND 100 GROUP BY 1""",
        "SELECT date, avg_value FROM universe.fitbit_spo2_daily WHERE date >= %(since)s"),
}

# GREATEST-written monotone sums: windowless in the rollup, so recompute over
# the same window but allow stored >= raw only as a warning.
_MONOTONE_RECOMPUTE = {
    "steps": (
        f"""SELECT COALESCE(source_local_date, (start_time AT TIME ZONE %(tz)s)::date),
                   sum((value_jsonb->'steps'->>'count')::int)
            FROM {RAW} WHERE data_type='steps' AND source_platform='FITBIT'
              AND start_time >= %(since)s::date - 1 GROUP BY 1""",
        "SELECT date, steps FROM universe.fitbit_activity_daily WHERE date >= %(since)s"),
}
for _zone, _col in (("FAT_BURN", "zone_fat_burn_min"), ("CARDIO", "zone_cardio_min"), ("PEAK", "zone_peak_min")):
    _MONOTONE_RECOMPUTE[_col] = (
        f"""SELECT source_local_date,
                   count(*) FILTER (WHERE value_jsonb->'activeZoneMinutes'->>'heartRateZone'='{_zone}')
            FROM {RAW} WHERE data_type='active-zone-minutes' AND source_platform='FITBIT'
              AND source_local_date >= %(since)s GROUP BY 1""",
        # Only days that have AZM points are comparable; NULL-on-worn-day is
        # its own check (check_zone_nulls).
        f"""SELECT date, {_col} FROM universe.fitbit_heart_rate_daily
            WHERE date >= %(since)s AND {_col} IS NOT NULL""")


def run_checks(cur, today: date, window_days: int, lookback_days: int) -> list:
    since = today - timedelta(days=window_days)
    params = {"since": since, "tz": USER_TZ}
    out = []

    out += check_column_freshness(fetch_column_stats(cur, lookback_days), today)

    for metric, (raw_sql, stored_sql) in _DAILY_RECOMPUTE.items():
        recomputed = _day_map(cur, raw_sql, params)
        stored = _day_map(cur, stored_sql, params)
        # Only compare days that exist in the window on both sides' terms:
        # stored rows older than the window edge are outside the recompute.
        stored = {d: v for d, v in stored.items() if d >= since}
        out += check_rollup_drift(metric, recomputed, stored, today)

    for metric, (raw_sql, stored_sql) in _MONOTONE_RECOMPUTE.items():
        recomputed = {d: v for d, v in _day_map(cur, raw_sql, params).items() if d >= since}
        stored = _day_map(cur, stored_sql, params)
        if metric.startswith("zone_"):
            recomputed = {d: v for d, v in recomputed.items() if d in stored}
        out += check_rollup_drift(metric, recomputed, stored, today, stored_may_exceed=True)

    out += check_distance_consistency(_rows(cur, f"""
        SELECT a.date, a.steps, a.distance_km, r.km AS raw_fitbit_km
        FROM universe.fitbit_activity_daily a
        LEFT JOIN (SELECT COALESCE(source_local_date, (start_time AT TIME ZONE %(tz)s)::date) d,
                          round(sum((value_jsonb->'distance'->>'millimeters')::numeric) / 1e6, 3) km
                   FROM {RAW} WHERE data_type='distance' AND source_platform='FITBIT'
                     AND start_time >= %(since)s::date - 1 GROUP BY 1) r ON r.d = a.date
        WHERE a.date >= %(since)s""", params), today)

    out += check_sleep_plausibility(_rows(cur, """
        SELECT date, total_minutes_asleep AS asleep, total_minutes_in_bed AS in_bed, efficiency,
               minutes_deep AS deep, minutes_light AS light, minutes_rem AS rem
        FROM universe.fitbit_sleep_daily WHERE date >= %(since)s""", params))

    out += check_resting_hr(_rows(cur, """
        SELECT date, resting_heart_rate FROM universe.fitbit_heart_rate_daily
        WHERE date >= %(since)s""", params))

    out += check_very_active_plausibility(_rows(cur, """
        SELECT a.date, a.steps, a.minutes_very_active,
               h.zone_fat_burn_min + h.zone_cardio_min + h.zone_peak_min AS zone_minutes
        FROM universe.fitbit_activity_daily a
        LEFT JOIN universe.fitbit_heart_rate_daily h USING (date)
        WHERE a.date >= %(since)s""", params))

    out += check_zone_nulls(_rows(cur, """
        SELECT h.date, a.steps, h.zone_cardio_min
        FROM universe.fitbit_heart_rate_daily h
        LEFT JOIN universe.fitbit_activity_daily a USING (date)
        WHERE h.date >= %(since)s""", params), today)

    out += check_weight_duplicates(_rows(cur, """
        SELECT date, log_id, weight_kg, source FROM universe.fitbit_body_weight
        WHERE date IN (SELECT date FROM universe.fitbit_body_weight GROUP BY date HAVING count(*) > 1)"""))

    out += check_unrouted_points(_rows(cur, f"""
        SELECT data_type, count(*) AS n, min(point_date) AS first_date FROM {RAW}
        WHERE source_platform IS NULL AND point_date >= %(since)s GROUP BY 1""", params))

    for table in ("fitbit_activity_daily", "fitbit_heart_rate_daily", "fitbit_sleep_daily"):
        days = [d for (d,) in _rows_tuple(cur, f"SELECT date FROM universe.{table} WHERE date >= %(since)s", params)]
        out += check_missing_days(table, days, since, today)

    return out


def _rows_tuple(cur, sql: str, params=()) -> list:
    cur.execute(sql, params)
    return cur.fetchall()


def summarize(violations: list) -> dict:
    by_check = {}
    for v in violations:
        by_check[v["check"]] = by_check.get(v["check"], 0) + 1
    return {
        "violations": len(violations),
        "alerts": sum(v["severity"] == "alert" for v in violations),
        "warnings": sum(v["severity"] == "warn" for v in violations),
        "by_check": dict(sorted(by_check.items())),
    }


def format_push(violations: list, limit: int = 12) -> str:
    """Compact Apprise body: alerts first, then newest first."""
    ordered = sorted(violations, key=lambda v: v["date"] or "", reverse=True)
    ordered = sorted(ordered, key=lambda v: v["severity"] != "alert")  # stable
    lines = [f"[{v['severity']}] {v['date'] or '-'} {v['check']}: {v['detail']}" for v in ordered[:limit]]
    if len(violations) > limit:
        lines.append(f"... and {len(violations) - limit} more")
    return "\n".join(lines)


def main(
    window_days: int = 120,
    lookback_days: int = 60,
    push: bool = False,
    push_severities: list = ["alert"],
    apprise_url: str = "https://apprise.tail322ce1.ts.net/notify/apprise?tag=health",
):
    # Windmill passes None for unset optional params; re-apply defaults.
    window_days = window_days or 120
    lookback_days = lookback_days or 60
    push_severities = push_severities or ["alert"]
    apprise_url = apprise_url or "https://apprise.tail322ce1.ts.net/notify/apprise?tag=health"

    from u.kevin.ingest_common import conn_kwargs
    try:
        from u.kevin.google_health_temporal import local_today
    except ModuleNotFoundError:  # pragma: no cover - local development
        from google_health_temporal import local_today

    today = local_today(USER_TZ)
    with psycopg.connect(**conn_kwargs(wmill.get_resource("u/kevin/universe_db"))) as conn:
        conn.read_only = True
        with conn.cursor() as cur:
            violations = run_checks(cur, today, window_days, lookback_days)

    summary = summarize(violations)
    summary["today"] = today.isoformat()
    summary["pushed"] = False
    to_push = [v for v in violations if v["severity"] in push_severities]
    if push and to_push:
        try:
            resp = requests.post(apprise_url, json={
                "title": f"\U0001fa7a Health data: {len(to_push)} integrity violation(s)",
                "body": format_push(to_push),
                "type": "failure" if any(v["severity"] == "alert" for v in to_push) else "warning",
            }, timeout=30)
            resp.raise_for_status()
            summary["pushed"] = True
        except Exception as exc:  # noqa: BLE001 - report, don't fail the check run
            print(f"Apprise push failed: {exc}")
            summary["push_error"] = str(exc)[:200]

    print(summary)
    return {**summary, "details": violations}
