"""Validated Google Health daily rollups.

This module owns only the transformation from captured Google Health points to
the dashboard's compatibility tables. Authentication, raw capture, Windmill
resources, and ingest-run coordination belong to ``ingest_google_health``.
"""

import hashlib
import json
import re
from dataclasses import dataclass, fields
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
BASE = "https://health.googleapis.com/v4"


# ---------------------------------------------------------------------------
# Physical storage contract
# ---------------------------------------------------------------------------


_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


@dataclass(frozen=True)
class RollupStorageTables:
    """Validated physical relations used by the Google Health rollup writer.

    Dashboard readers already use provider-neutral ``health_*`` views. Keeping
    every source and write relation here gives the later physical-table cutover
    one explicit composition boundary without allowing arbitrary SQL fragments.
    """

    raw_points: str = "universe.google_health_data_point"
    activity_daily: str = "universe.fitbit_activity_daily"
    body_weight: str = "universe.fitbit_body_weight"
    breathing_rate_daily: str = "universe.fitbit_breathing_rate_daily"
    exercise_log: str = "universe.fitbit_exercise_log"
    food_log_daily: str = "universe.fitbit_food_log_daily"
    heart_rate_daily: str = "universe.fitbit_heart_rate_daily"
    hrv_daily: str = "universe.fitbit_hrv_daily"
    skin_temp_daily: str = "universe.fitbit_skin_temp_daily"
    sleep_daily: str = "universe.fitbit_sleep_daily"
    spo2_daily: str = "universe.fitbit_spo2_daily"

    def __post_init__(self) -> None:
        for field in fields(self):
            value = getattr(self, field.name)
            parts = value.split(".")
            if len(parts) != 2 or not all(_IDENTIFIER.fullmatch(part) for part in parts):
                raise ValueError(
                    f"{field.name} must be a schema-qualified PostgreSQL identifier"
                )

    def render(self, statement: str) -> str:
        """Substitute only validated relation identifiers into a SQL template."""

        identifiers = {}
        for field in fields(self):
            qualified = getattr(self, field.name)
            identifiers[field.name] = qualified
            identifiers[f"{field.name}_ref"] = qualified.split(".", 1)[1]
        return statement.format_map(identifiers)


LEGACY_ROLLUP_TABLES = RollupStorageTables()


# ---------------------------------------------------------------------------
# Daily rollups  →  compatibility tables  (FITBIT-device routed). Gated.
# ---------------------------------------------------------------------------

MARK = json.dumps({"_src": "google_health"})
HRV_SAMPLE_MARK = json.dumps({"_src": "google_health", "method": "sample_mean_v1"})
HRV_DAILY_MARK = json.dumps({"_src": "google_health", "method": "daily_hrv_v1"})
SLEEP_MAIN_MARK = json.dumps({"_src": "google_health", "method": "main_sleep_v2"})
# Must match the dashboard server's USER_TIMEZONE so rollup day buckets
# line up with the legacy tables they replace.
USER_TZ = "America/New_York"


def _sleep_wake_date(fallback: date | str, interval: dict) -> date | str:
    """Canonical sleep key: local wake date, respecting per-night DST offset."""
    end = interval.get("endTime") if isinstance(interval, dict) else None
    if not isinstance(end, str) or not end:
        return fallback
    try:
        instant = datetime.fromisoformat(end.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    offset_text = interval.get("endUtcOffset")
    if isinstance(offset_text, str) and offset_text.endswith("s"):
        try:
            return (
                instant.astimezone(timezone.utc)
                + timedelta(seconds=float(offset_text[:-1]))
            ).date()
        except ValueError:
            pass
    return instant.astimezone(ZoneInfo(USER_TZ)).date()


def _sql_rollups(
    cur,
    since: str,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> None:
    # Resting HR (daily) → exact match to legacy.
    cur.execute(tables.render("""
        INSERT INTO {heart_rate_daily} (date, resting_heart_rate, raw_jsonb)
        SELECT point_date, max((value_jsonb->'dailyRestingHeartRate'->>'beatsPerMinute')::numeric)::int, %s::jsonb
        FROM {raw_points} WHERE data_type='daily-resting-heart-rate' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET resting_heart_rate=EXCLUDED.resting_heart_rate, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (MARK, since))

    # HR zones — minutes per zone, from the per-minute active-zone-minutes
    # points. Each point IS one wall-clock minute carrying its zone, so
    # time-in-zone is a COUNT (the point's own activeZoneMinutes value is the
    # AZM *credit*: 1 for FAT_BURN, 2 for CARDIO/PEAK — that weighting is the
    # dashboard's job, not the store's).
    #
    # Left unmapped at cutover as "not a legacy replacement", which turned out
    # to be wrong: validated 2026-08-01 over 40 overlap days, CARDIO matches
    # legacy 40/40 EXACT and FAT_BURN runs +0-2 min (the per-minute points are
    # the finer source; legacy's daily summary was itself a rollup). Same
    # metric, so it continues the same columns rather than starting new ones.
    #
    # Bucketed by Google's own civilStartTime — Fitbit's local date — not by
    # converting start_time, which is what let the steps rollup truncate its
    # edge day. Windowless + GREATEST for the same reason as steps: a COUNT of
    # minutes can only be UNDERcounted by incomplete evidence, so this
    # self-heals and can never lower a day. GREATEST also protects the older
    # legacy days that raw capture no longer reaches back to.
    #
    # zone_*_cal and zone_out_of_range_min have no Google equivalent (AZM only
    # records minutes that EARNED a zone) and stay NULL after the cutover.
    cur.execute(tables.render("""
        INSERT INTO {heart_rate_daily}
            (date, zone_fat_burn_min, zone_cardio_min, zone_peak_min, raw_jsonb)
        SELECT make_date(
                 (value_jsonb->'activeZoneMinutes'->'interval'->'civilStartTime'->'date'->>'year')::int,
                 (value_jsonb->'activeZoneMinutes'->'interval'->'civilStartTime'->'date'->>'month')::int,
                 (value_jsonb->'activeZoneMinutes'->'interval'->'civilStartTime'->'date'->>'day')::int),
               count(*) FILTER (WHERE value_jsonb->'activeZoneMinutes'->>'heartRateZone'='FAT_BURN'),
               count(*) FILTER (WHERE value_jsonb->'activeZoneMinutes'->>'heartRateZone'='CARDIO'),
               count(*) FILTER (WHERE value_jsonb->'activeZoneMinutes'->>'heartRateZone'='PEAK'),
               %s::jsonb
        FROM {raw_points} WHERE data_type='active-zone-minutes' AND source_platform='FITBIT'
              AND value_jsonb->'activeZoneMinutes'->'interval'->'civilStartTime'->'date'->>'year' IS NOT NULL
        GROUP BY 1
        ON CONFLICT (date) DO UPDATE SET
            zone_fat_burn_min=GREATEST(EXCLUDED.zone_fat_burn_min, {heart_rate_daily_ref}.zone_fat_burn_min),
            zone_cardio_min=GREATEST(EXCLUDED.zone_cardio_min, {heart_rate_daily_ref}.zone_cardio_min),
            zone_peak_min=GREATEST(EXCLUDED.zone_peak_min, {heart_rate_daily_ref}.zone_peak_min),
            fetched_at=NOW()
    """), (MARK,))

    # Respiratory rate (daily) → exact.
    cur.execute(tables.render("""
        INSERT INTO {breathing_rate_daily} (date, breathing_rate, raw_jsonb)
        SELECT point_date, max((value_jsonb->'dailyRespiratoryRate'->>'breathsPerMinute')::numeric), %s::jsonb
        FROM {raw_points} WHERE data_type='daily-respiratory-rate' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET breathing_rate=EXCLUDED.breathing_rate, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (MARK, since))

    # Skin-temp deviation (nightly − baseline) → exact.
    cur.execute(tables.render("""
        INSERT INTO {skin_temp_daily} (date, nightly_relative, log_type, raw_jsonb)
        SELECT point_date,
               round(max((value_jsonb->'dailySleepTemperatureDerivations'->>'nightlyTemperatureCelsius')::numeric
                       - (value_jsonb->'dailySleepTemperatureDerivations'->>'baselineTemperatureCelsius')::numeric), 2),
               'google_health', %s::jsonb
        FROM {raw_points} WHERE data_type='daily-sleep-temperature-derivations' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET nightly_relative=EXCLUDED.nightly_relative, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (MARK, since))

    # HRV fallback — mean of overnight per-5-min RMSSD samples. The native
    # daily record below supersedes this when Google publishes it; retaining
    # the sample path keeps partial provider data first-class.
    cur.execute(tables.render("""
        INSERT INTO {hrv_daily} (date, daily_rmssd, raw_jsonb)
        SELECT point_date,
               round(avg((value_jsonb->'heartRateVariability'->>'rootMeanSquareOfSuccessiveDifferencesMilliseconds')::numeric), 3), %s::jsonb
        FROM {raw_points} WHERE data_type='heart-rate-variability' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET daily_rmssd=EXCLUDED.daily_rmssd, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (HRV_SAMPLE_MARK, since))

    # Native daily HRV carries Google's civil date, nightly RMSSD, deep-sleep
    # RMSSD, and non-REM heart rate.  The latter is a much closer comparator
    # for Eight Sleep than all-day resting heart rate.
    cur.execute(tables.render("""
        INSERT INTO {hrv_daily}
            (date, daily_rmssd, deep_rmssd, non_rem_heart_rate, raw_jsonb)
        SELECT point_date,
               max((value_jsonb->'dailyHeartRateVariability'->>'averageHeartRateVariabilityMilliseconds')::numeric),
               max((value_jsonb->'dailyHeartRateVariability'->>'deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds')::numeric),
               max((value_jsonb->'dailyHeartRateVariability'->>'nonRemHeartRateBeatsPerMinute')::numeric),
               %s::jsonb
        FROM {raw_points}
        WHERE data_type='daily-heart-rate-variability'
              AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET
            daily_rmssd=COALESCE(EXCLUDED.daily_rmssd, {hrv_daily_ref}.daily_rmssd),
            deep_rmssd=COALESCE(EXCLUDED.deep_rmssd, {hrv_daily_ref}.deep_rmssd),
            non_rem_heart_rate=COALESCE(EXCLUDED.non_rem_heart_rate, {hrv_daily_ref}.non_rem_heart_rate),
            raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (HRV_DAILY_MARK, since))

    # Deep-sleep RMSSD fallback. Native daily HRV now exposes an equivalent;
    # for older/partial records this reconstructs it by averaging the
    # per-5-min HRV samples whose timestamp falls inside a DEEP stage interval
    # from that night's sleep record.
    #
    # NOT a like-for-like restoration, and deliberately not pretended to be.
    # Validated over 45 overlap days: tracks legacy closely but runs ~7% high
    # (ratio 0.85-1.38, mean 1.069, worst gap 8.8 ms) because Fitbit computed
    # deepRmssd from beat-to-beat data while this averages the published
    # 5-minute samples. The daily_rmssd line above already steps ~17% at the
    # same date for the same reason, so the chart labels both as a source
    # change rather than a physiological one. Nothing but the chart reads this
    # column — readiness and the experiment engine use daily_rmssd — so the
    # level shift affects readiness because it consumes daily_rmssd. The raw
    # marker therefore identifies the measurement regime so baselines do not
    # silently straddle the cutover.
    #
    # Fill-only: DO UPDATE is guarded on the existing value being NULL, so
    # Fitbit's own numbers are never restated. Windowless, which here is about
    # avoiding an edge artifact rather than self-healing — note this one does
    # NOT use GREATEST, because an average is not monotone under incomplete
    # evidence the way a sum or a count is; more samples can move a mean either
    # way. The >= 5 sample floor keeps a barely-captured night from landing.
    cur.execute(tables.render("""
        INSERT INTO {hrv_daily} (date, deep_rmssd, raw_jsonb)
        SELECT d.point_date, round(avg(h.rmssd), 3), %s::jsonb
        FROM (
            SELECT p.point_date,
                   (st->>'startTime')::timestamptz AS s,
                   (st->>'endTime')::timestamptz   AS e
            FROM {raw_points} p,
                 LATERAL jsonb_array_elements(p.value_jsonb->'sleep'->'stages') st
            WHERE p.data_type='sleep' AND p.source_platform='FITBIT'
                  AND st->>'type'='DEEP'
        ) d
        JOIN (
            SELECT start_time AS t,
                   (value_jsonb->'heartRateVariability'->>'rootMeanSquareOfSuccessiveDifferencesMilliseconds')::numeric AS rmssd
            FROM {raw_points}
            WHERE data_type='heart-rate-variability' AND source_platform='FITBIT'
                  AND start_time IS NOT NULL
        ) h ON h.t >= d.s AND h.t < d.e
        GROUP BY d.point_date
        HAVING count(*) >= 5
        ON CONFLICT (date) DO UPDATE SET deep_rmssd=EXCLUDED.deep_rmssd
            WHERE {hrv_daily_ref}.deep_rmssd IS NULL
    """), (MARK,))

    # SpO2 — overnight avg/min/max, artifacts (<80%) filtered out.
    cur.execute(tables.render("""
        INSERT INTO {spo2_daily} (date, avg_value, min_value, max_value, raw_jsonb)
        SELECT point_date, round(avg(p),2), round(min(p),2), round(max(p),2), %s::jsonb FROM (
            SELECT point_date, (value_jsonb->'oxygenSaturation'->>'percentage')::numeric p
            FROM {raw_points} WHERE data_type='oxygen-saturation' AND source_platform='FITBIT' AND point_date >= %s
        ) s WHERE p BETWEEN 80 AND 100
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET avg_value=EXCLUDED.avg_value, min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (MARK, since))

    # Steps — daily sum of intraday intervals, bucketed by the USER'S calendar
    # day. Deliberately WINDOWLESS and monotone, unlike every other rollup here.
    #
    # The window is what broke it. `point_date` is the UTC date, but the sum is
    # grouped by LOCAL date, and a local day D draws on point_date D *and* D+1
    # (its 20:00-24:00 hours fall in the next UTC day). So `point_date >= since`
    # left the local day at `since - 1` holding nothing but that 4-hour sliver,
    # and wrote it anyway. Every run destroyed exactly one settled day as the
    # window edge swept forward: 27 days between 2026-05-14 and 06-10 were cut
    # to ~300 steps, ~20x understated, before this was caught on 2026-07-26.
    #
    # Scanning the whole type instead is cheap (~250 points/day) and removes the
    # edge rather than moving it. GREATEST then makes the write monotone, which
    # is sound because incomplete evidence can only UNDERcount a sum: today's
    # partial day climbs as it fills, a raw backfill that lands after a day has
    # aged out still corrects it, and no run can lower a day already summed
    # whole. Verified 2026-07-26 — recomputing every day from raw lowered none.
    cur.execute(tables.render("""
        INSERT INTO {activity_daily} (date, steps, raw_jsonb)
        SELECT (start_time AT TIME ZONE %s)::date, sum((value_jsonb->'steps'->>'count')::int), %s::jsonb
        FROM {raw_points} WHERE data_type='steps' AND source_platform='FITBIT'
              AND start_time IS NOT NULL
        GROUP BY 1
        ON CONFLICT (date) DO UPDATE SET
            steps=GREATEST(EXCLUDED.steps, {activity_daily_ref}.steps),
            raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """), (USER_TZ, MARK))


def _rollup_sleep(
    cur,
    since: str,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> int:
    # Night semantics: total_minutes_asleep/in_bed describe the MAIN (longest)
    # session so Fitbit and Eight Sleep compare the same construct. Naps remain
    # visible in nap_minutes_asleep instead of contaminating readiness.
    cur.execute(tables.render("""
        SELECT point_date, value_jsonb FROM {raw_points}
        WHERE data_type='sleep' AND source_platform='FITBIT' AND point_date >= %s
    """), (since,))
    days = {}  # date -> {"sessions": [...], "best": {...}}
    for pdate, vj in cur.fetchall():
        s = (vj or {}).get("sleep", {})
        summ = s.get("summary", {})
        asleep = int(summ.get("minutesAsleep", 0) or 0)
        inbed = int(summ.get("minutesInSleepPeriod", 0) or 0)
        iv = s.get("interval", {})
        wake_date = _sleep_wake_date(pdate, iv)
        day = days.setdefault(wake_date, {"all_asleep": 0, "records": 0, "best": None})
        day["all_asleep"] += asleep
        day["records"] += 1
        if day["best"] is None or (asleep, inbed) > (
            day["best"]["asleep"], day["best"]["inbed"]
        ):
            stages = {x.get("type"): int(x.get("minutes", 0) or 0) for x in summ.get("stagesSummary", [])}
            day["best"] = {
                "asleep": asleep, "inbed": inbed,
                "deep": stages.get("DEEP"), "light": stages.get("LIGHT"),
                "rem": stages.get("REM"), "wake": stages.get("AWAKE"),
                "start": iv.get("startTime"), "end": iv.get("endTime"),
            }
    n = 0
    for d, day in days.items():
        b = day["best"]
        efficiency = round(b["asleep"] * 100 / b["inbed"]) if b["inbed"] else None
        cur.execute(tables.render("""
            INSERT INTO {sleep_daily}
                (date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
                 nap_minutes_asleep,
                 minutes_deep, minutes_light, minutes_rem, minutes_wake,
                 efficiency, main_sleep_start_time, main_sleep_end_time, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                total_minutes_asleep=EXCLUDED.total_minutes_asleep, total_minutes_in_bed=EXCLUDED.total_minutes_in_bed,
                total_sleep_records=EXCLUDED.total_sleep_records, nap_minutes_asleep=EXCLUDED.nap_minutes_asleep,
                minutes_deep=EXCLUDED.minutes_deep, minutes_light=EXCLUDED.minutes_light,
                minutes_rem=EXCLUDED.minutes_rem, minutes_wake=EXCLUDED.minutes_wake,
                efficiency=EXCLUDED.efficiency,
                main_sleep_start_time=EXCLUDED.main_sleep_start_time, main_sleep_end_time=EXCLUDED.main_sleep_end_time,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """), (d, b["asleep"], b["inbed"], day["records"],
              max(0, day["all_asleep"] - b["asleep"]),
              b["deep"], b["light"], b["rem"], b["wake"], efficiency,
              b["start"], b["end"], SLEEP_MAIN_MARK))
        n += 1
    return n


def _rollup_weight(
    cur,
    since: str,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> int:
    # fitbit_body_weight PK is Fitbit's log_id; Google points carry a
    # resource name instead. Derive a NEGATIVE synthetic id from the name
    # hash — real Fitbit log ids are positive, so the two can't collide.
    cur.execute(tables.render("""
        SELECT point_date, name, value_jsonb FROM {raw_points}
        WHERE data_type='weight' AND source_platform='FITBIT'
              AND point_date >= %s AND name IS NOT NULL
    """), (since,))
    n = 0
    for pdate, name, vj in cur.fetchall():
        w = (vj or {}).get("weight", {})
        grams = w.get("grams")
        if not grams:
            continue
        log_id = -(int(hashlib.md5(name.encode()).hexdigest()[:12], 16))
        cur.execute(tables.render("""
            INSERT INTO {body_weight} (log_id, date, weight_kg, source, raw_jsonb)
            VALUES (%s,%s,%s,'google_health',%s)
            ON CONFLICT (log_id) DO UPDATE SET
                date=EXCLUDED.date, weight_kg=EXCLUDED.weight_kg, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """), (log_id, pdate, round(grams / 1000.0, 2), MARK))
        n += 1
    return n


# Per-day nutrients summed out of Google's nutrition-log nutrients[] array.
# Google reports every nutrient in grams; the tuple is (column, gram->unit
# multiplier). SODIUM/CHOLESTEROL/POTASSIUM are stored in mg to match the
# legacy column convention (sodium ×1000 validated EXACT vs legacy on the
# overlap days; fiber + protein in grams also exact). sugar/saturated_fat/
# cholesterol/potassium are net-new — Fitbit's daily summary never carried them.
_FOOD_NUTRIENTS = {
    "PROTEIN":       ("protein", 1),
    "DIETARY_FIBER": ("fiber", 1),
    "SUGAR":         ("sugar", 1),
    "SATURATED_FAT": ("saturated_fat", 1),
    "SODIUM":        ("sodium", 1000),
    "CHOLESTEROL":   ("cholesterol", 1000),
    "POTASSIUM":     ("potassium", 1000),
}


def _rollup_food(
    cur,
    since: str,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> int:
    # Google's nutrition-log is PER-FOOD-ENTRY; sum each day's entries. Calories
    # and total carbs/fat are top-level; everything else lives in nutrients[]
    # (the legacy rollup only pulled PROTEIN and dropped fiber/sodium/etc — they
    # were in the payload all along). Water + calorie_goal are genuinely absent
    # from Google's payload, so those columns stay NULL post-cutover.
    cur.execute(tables.render("""
        SELECT point_date, value_jsonb FROM {raw_points}
        WHERE data_type='nutrition-log' AND source_platform='FITBIT' AND point_date >= %s
    """), (since,))
    agg = {}
    for pdate, vj in cur.fetchall():
        nl = (vj or {}).get("nutritionLog", {})
        a = agg.setdefault(pdate, {"cal": 0.0, "carbs": 0.0, "fat": 0.0, "n": 0,
                                   "protein": 0.0, "fiber": 0.0, "sugar": 0.0,
                                   "saturated_fat": 0.0, "sodium": 0.0,
                                   "cholesterol": 0.0, "potassium": 0.0})
        a["cal"] += (nl.get("energy", {}) or {}).get("kcal", 0) or 0
        a["carbs"] += (nl.get("totalCarbohydrate", {}) or {}).get("grams", 0) or 0
        a["fat"] += (nl.get("totalFat", {}) or {}).get("grams", 0) or 0
        for nut in nl.get("nutrients", []) or []:
            col_mult = _FOOD_NUTRIENTS.get(nut.get("nutrient"))
            if col_mult:
                col, mult = col_mult
                a[col] += ((nut.get("quantity", {}) or {}).get("grams", 0) or 0) * mult
        a["n"] += 1
    n = 0
    for d, a in agg.items():
        cur.execute(tables.render("""
            INSERT INTO {food_log_daily}
                (date, calories_in, carbs, fat, protein, fiber, sugar,
                 saturated_fat, sodium, cholesterol, potassium, food_count, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                calories_in=EXCLUDED.calories_in, carbs=EXCLUDED.carbs, fat=EXCLUDED.fat,
                protein=EXCLUDED.protein, fiber=EXCLUDED.fiber, sugar=EXCLUDED.sugar,
                saturated_fat=EXCLUDED.saturated_fat, sodium=EXCLUDED.sodium,
                cholesterol=EXCLUDED.cholesterol, potassium=EXCLUDED.potassium,
                food_count=EXCLUDED.food_count, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """), (d, round(a["cal"]), round(a["carbs"], 2), round(a["fat"], 2),
              round(a["protein"], 2), round(a["fiber"], 2), round(a["sugar"], 2),
              round(a["saturated_fat"], 2), round(a["sodium"], 2),
              round(a["cholesterol"], 2), round(a["potassium"], 2), a["n"], MARK))
        n += 1
    return n


def _rollup_exercise(
    cur,
    since: str,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> int:
    """Exercise sessions → fitbit_exercise_log. Google's exercise point id IS
    the legacy Fitbit logId (validated 2026-06-11: 79/79 overlap rows joined
    exactly; dates/durations/avg-HR identical, calories slightly revised), so
    upserts continue the same PK space. Conflict-update only the metric fields
    like the legacy ingest did — activity_type_id/log_type aren't in Google's
    payload, so they're preserved on legacy rows and derived/NULL on new ones.
    Units matched to legacy: distance km (4dp), elevation meters (2dp).
    """
    cur.execute(tables.render("""
        SELECT name, value_jsonb FROM {raw_points}
        WHERE data_type='exercise' AND source_platform='FITBIT'
              AND point_date >= %s AND name IS NOT NULL
    """), (since,))
    n = 0
    for name, vj in cur.fetchall():
        ex = (vj or {}).get("exercise", {})
        iv = ex.get("interval", {}) or {}
        start = iv.get("startTime")
        if not start:
            continue
        log_id = int(name.rsplit("/", 1)[-1])
        # Legacy dated exercises by Fitbit's LOCAL start time, not UTC.
        off = int(float(str(iv.get("startUtcOffset", "0s")).rstrip("s") or 0))
        local_date = (datetime.fromisoformat(start.replace("Z", "+00:00"))
                      + timedelta(seconds=off)).date()
        ms = ex.get("metricsSummary", {}) or {}
        dur = ex.get("activeDuration")
        mm = ms.get("distanceMillimeters")
        elev = ms.get("elevationGainMillimeters")
        rec = (vj.get("dataSource", {}) or {}).get("recordingMethod", "")
        cur.execute(tables.render("""
            INSERT INTO {exercise_log}
                (log_id, date, start_time, activity_name, log_type, calories,
                 duration_ms, distance, distance_unit, steps, average_heart_rate,
                 elevation_gain, has_active_zone_minutes, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (log_id) DO UPDATE SET
                calories=EXCLUDED.calories, duration_ms=EXCLUDED.duration_ms,
                distance=EXCLUDED.distance, steps=EXCLUDED.steps,
                average_heart_rate=EXCLUDED.average_heart_rate,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """), (log_id, local_date, start,
              ex.get("displayName") or ex.get("exerciseType") or "Unknown",
              "auto_detected" if rec == "PASSIVELY_MEASURED" else (rec.lower() or None),
              round(ms["caloriesKcal"]) if ms.get("caloriesKcal") is not None else None,
              int(float(str(dur).rstrip("s")) * 1000) if dur else None,
              round(int(mm) / 1_000_000, 4) if mm is not None else None,
              "Kilometer" if mm is not None else None,
              int(ms["steps"]) if ms.get("steps") else None,
              int(ms["averageHeartRateBeatsPerMinute"]) if ms.get("averageHeartRateBeatsPerMinute") else None,
              round(int(elev) / 1000.0, 2) if elev is not None else None,
              int(ms.get("activeZoneMinutes", 0) or 0) > 0,
              json.dumps(vj)))
        n += 1
    return n


def _civil(d: date) -> dict:
    return {"date": {"year": d.year, "month": d.month, "day": d.day}}


def _rollup_activity_daily(
    token: str,
    cur,
    rollup_days: int,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> int:
    """Daily activity columns Google only exposes via the dailyRollUp endpoint
    (civil-day buckets), written into the EXISTING fitbit_activity_daily columns
    the dashboard already reads — all validated EXACT vs legacy (2026-06-11):

        total-calories  → calories_out      (kcalSum)
        active-minutes  → minutes_*_active  (LIGHT/MODERATE/VIGOROUS
                          → lightly/fairly/very)
        distance        → distance_km       (millimetersSum / 1e6)
        floors          → floors            (countSum)

    `total-calories` CANNOT be listed raw (the API allows only rollup/dailyRollUp
    for it), so this is the only route to calories_out. Deliberately NOT mapped:
    active_calories / calories_bmr (Google's active-energy-burned is a different
    definition, ~half of Fitbit's activityCalories, and neither column is
    surfaced) and minutes_sedentary (sedentary-period differs from legacy too).
    AZM (active-zone-minutes) is a HR-zone metric, not the MET-based legacy
    active-minutes (r~=0.37), so it stays raw-only and is not rolled here.
    """
    h = {"Authorization": f"Bearer {token}"}
    today = datetime.now(timezone.utc).date()
    # dailyRollUp caps each request at maxDurationDays=14, so the rollup_days
    # window is split into <=14-day closed-open spans.
    spans, s, end = [], today - timedelta(days=rollup_days), today + timedelta(days=1)
    while s < end:
        e = min(s + timedelta(days=14), end)
        spans.append((s, e))
        s = e

    def roll(dt: str) -> dict:
        out: dict = {}
        for cs, ce in spans:
            page = None
            while True:
                body = {"range": {"start": _civil(cs), "end": _civil(ce)}}
                if page:
                    body["pageToken"] = page
                r = requests.post(f"{BASE}/users/me/dataTypes/{dt}/dataPoints:dailyRollUp",
                                  headers=h, json=body, timeout=60)
                r.raise_for_status()
                j = r.json()
                for dp in j.get("rollupDataPoints", []):
                    cd = (dp.get("civilStartTime") or {}).get("date") or {}
                    if cd.get("year"):
                        out[date(cd["year"], cd["month"], cd["day"])] = dp
                page = j.get("nextPageToken")
                if not page:
                    break
        return out

    cal = roll("total-calories")
    amin = roll("active-minutes")
    dist = roll("distance")
    flr = roll("floors")

    n = 0
    for d in sorted(cal):  # settled days only — today's partial total is absent
        kcal = (cal[d].get("totalCalories") or {}).get("kcalSum")
        if kcal is None:
            continue
        levels = {x.get("activityLevel"): int(x.get("activeMinutesSum", 0) or 0)
                  for x in ((amin.get(d, {}) or {}).get("activeMinutes") or {})
                           .get("activeMinutesRollupByActivityLevel", [])}
        mm = ((dist.get(d, {}) or {}).get("distance") or {}).get("millimetersSum")
        cnt = ((flr.get(d, {}) or {}).get("floors") or {}).get("countSum")
        cur.execute(tables.render("""
            INSERT INTO {activity_daily}
                (date, calories_out, distance_km, floors,
                 minutes_lightly_active, minutes_fairly_active, minutes_very_active, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                calories_out=EXCLUDED.calories_out, distance_km=EXCLUDED.distance_km,
                floors=EXCLUDED.floors,
                minutes_lightly_active=EXCLUDED.minutes_lightly_active,
                minutes_fairly_active=EXCLUDED.minutes_fairly_active,
                minutes_very_active=EXCLUDED.minutes_very_active,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """), (d, round(kcal),
              round(int(mm) / 1_000_000, 3) if mm is not None else 0,
              int(cnt) if cnt is not None else 0,
              levels.get("LIGHT", 0), levels.get("MODERATE", 0), levels.get("VIGOROUS", 0), MARK))
        n += 1
    return n


def run_rollups(
    conn,
    token: str,
    rollup_days: int,
    tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
) -> dict:
    since = (datetime.now(timezone.utc).date() - timedelta(days=rollup_days)).isoformat()
    cur = conn.cursor()
    _sql_rollups(cur, since, tables)
    sleep_n = _rollup_sleep(cur, since, tables)
    food_n = _rollup_food(cur, since, tables)
    weight_n = _rollup_weight(cur, since, tables)
    exercise_n = _rollup_exercise(cur, since, tables)
    conn.commit()  # lock in the SQL-sourced rollups before the network rollup
    activity: dict = {}
    try:
        activity["activity_days"] = _rollup_activity_daily(
            token, cur, rollup_days, tables
        )
        conn.commit()
    except Exception as exc:  # noqa: BLE001 — network rollup must not drop the committed SQL rollups
        conn.rollback()
        activity["activity_error"] = str(exc)[:200]
    return {"since": since, "sleep_days": sleep_n, "food_days": food_n,
            "weight_logs": weight_n, "exercise_logs": exercise_n, **activity}


class GoogleHealthRollupWriter:
    """Rollup boundary kept separate from raw capture and run coordination."""

    def __init__(
        self,
        connection,
        access_token: str,
        tables: RollupStorageTables = LEGACY_ROLLUP_TABLES,
    ):
        self._connection = connection
        self._access_token = access_token
        self._tables = tables

    def write(self, rollup_days: int) -> dict:
        return run_rollups(
            self._connection,
            self._access_token,
            rollup_days,
            self._tables,
        )


# NOTE — rollup coverage status:
#   DONE  calories_out / active-minutes / distance / floors → _rollup_activity_daily
#         (dailyRollUp endpoint; all validated EXACT vs legacy)
#   DONE  weight → _rollup_weight (negative synthetic log_id)
#   DONE  exercise → _rollup_exercise (point id == legacy logId; 79/79 validated)
#   DEAD  fitbit_cardio_score_daily → Google's vo2-max returns {} for this
#         account; the table freezes at cutover (history retained)
#   SKIP  active_calories / calories_bmr → Google's active-energy-burned is a
#         different definition (~half of Fitbit's activityCalories) and unused
#   SKIP  minutes_sedentary → sedentary-period differs from legacy, unused
#   DONE  food fiber/sodium/sugar/saturated-fat/cholesterol/potassium →
#         _rollup_food sums them from nutrition-log nutrients[] (fiber+sodium
#         validated EXACT vs legacy; sodium/cholesterol/potassium ×1000 g→mg)
#   SKIP  food water / calorie_goal → genuinely absent from Google's
#         nutrition-log (no hydration type captured; goal isn't Health Connect)
#   OPEN  AZM (active-zone-minutes) → captured raw; a HR-zone signal distinct
#         from MET-based active-minutes (r~=0.37). Could be added as a NEW
#         correlation series (new column), but it is NOT a legacy replacement.
