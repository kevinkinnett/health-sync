"""
Ingest Google Health API data — the migration target for the legacy Fitbit
Web API (which Google decommissions ~Sept 2026).

TWO things happen:
  1. MAXIMAL RAW CAPTURE — every data point of every type, from every source
     (Fitbit/Pixel + Eight Sleep via Health Connect + anything else), lossless,
     into universe.google_health_data_point. Source-stamped so we can route.
  2. DAILY ROLLUPS — derived daily values written into the EXISTING universe.
     fitbit_* tables so the dashboard / readiness / alerts keep working
     unchanged. FITBIT-platform-routed (so we don't double-count Eight Sleep,
     which has its own dedicated ingest with richer fields).

PARALLEL-RUN SAFETY: the rollups OVERWRITE the live fitbit_* tables, so they
are gated behind `write_daily` (default FALSE). Run this alongside the legacy
ingest with write_daily=False — it only fills the raw table; the live tables
stay legacy-driven and we can validate raw-derived vs legacy anytime. At
CUTOVER (before Sept 2026): set write_daily=True here and DISABLE
ingest_fitbit + ingest_fitbit_food.

Validated vs legacy (2026-05-30): resting-HR / respiratory / skin-temp are
EXACT; sleep is ~equal (minor method diff). HRV adopts Google's per-5-min
flavor (different absolute scale than Fitbit's nightly RMSSD, but readiness
z-scores vs a personal baseline so the signal is preserved on a clean
cutover). SpO2 averages overnight samples filtered to 80-100% (drops the
sensor artifacts that polluted a naive 24h mean).

Auth: u/kevin/google_health_oauth  (Google OAuth client {web:{...}} + tokens)
DB:   u/kevin/universe_db
"""

import hashlib
import json
import time
from datetime import date, datetime, timedelta, timezone

import psycopg
import requests
import wmill

from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

PROVIDER = "google_health"
JOB_NAME = "google_health_ingest"
DEFAULT_OAUTH_RES = "u/kevin/google_health_oauth"
DEFAULT_DB_RES = "u/kevin/universe_db"
BASE = "https://health.googleapis.com/v4"
TOKEN_URL = "https://oauth2.googleapis.com/token"

# Every type we capture raw via the List endpoint. Daily calories /
# active-minutes / floors are NOT listed here — the API rejects List for them;
# they come from the dailyRollUp endpoint instead (see _rollup_activity_daily).
TYPES = [
    "daily-resting-heart-rate", "daily-respiratory-rate",
    "daily-sleep-temperature-derivations", "oxygen-saturation",
    "heart-rate-variability", "weight", "vo2-max", "steps", "distance",
    "active-zone-minutes", "nutrition-log", "sleep", "exercise",
]


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def google_access_token(res_path: str) -> str:
    creds = wmill.get_resource(res_path)
    web = creds.get("web") if isinstance(creds.get("web"), dict) else creds
    if creds.get("access_token") and creds.get("expires_at", 0) > time.time() + 300:
        return creds["access_token"]
    print("Refreshing Google access token...")
    r = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": creds["refresh_token"],
        "client_id": web["client_id"],
        "client_secret": web["client_secret"],
    }, timeout=30)
    r.raise_for_status()
    tok = r.json()
    creds["access_token"] = tok["access_token"]
    creds["expires_at"] = int(time.time()) + int(tok.get("expires_in", 3600))
    if tok.get("refresh_token"):
        creds["refresh_token"] = tok["refresh_token"]
    wmill.set_resource(res_path, creds, resource_type="any")
    return creds["access_token"]


# ---------------------------------------------------------------------------
# Raw capture
# ---------------------------------------------------------------------------

def ensure_raw_table(cur) -> None:
    cur.execute("""
        CREATE TABLE IF NOT EXISTS universe.google_health_data_point (
            data_type TEXT NOT NULL, point_key TEXT NOT NULL, name TEXT,
            source_platform TEXT, source_app TEXT, source_device TEXT,
            start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, point_date DATE,
            value_jsonb JSONB NOT NULL, fetched_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (data_type, point_key))
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS ix_ghdp_type_time ON universe.google_health_data_point (data_type, start_time DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS ix_ghdp_type_date ON universe.google_health_data_point (data_type, source_platform, point_date)")


def parse_point(dt: str, p: dict) -> dict:
    value_key = next((k for k in p if k not in ("name", "dataSource")), None)
    value = p.get(value_key, {}) if value_key else {}
    src = p.get("dataSource", {})
    platform = src.get("platform")
    app = (src.get("application") or {}).get("packageName")
    device = (src.get("device") or {}).get("displayName")
    start = end = pdate = None
    if isinstance(value, dict):
        iv, st, dd = value.get("interval"), value.get("sampleTime"), value.get("date")
        if isinstance(iv, dict):
            start, end = iv.get("startTime"), iv.get("endTime")
        elif isinstance(st, dict):
            start = end = st.get("physicalTime")
        if isinstance(dd, dict):
            pdate = f"{dd['year']:04d}-{dd['month']:02d}-{dd['day']:02d}"
    if not pdate and start:
        pdate = start[:10]
    key = p.get("name")
    if not key:
        # Most-granular-first: a sample's full timestamp keeps every
        # intraday point distinct. Keying on the bare date collapsed all
        # of a day's unnamed samples (SpO2/HRV) into ONE surviving row —
        # the rollups then averaged 1-2 samples instead of the night.
        # Date-only points (daily summaries) still key per-day, correctly.
        key = "|".join([dt, platform or "", app or "", start or pdate or ""])
        if not (pdate or start):
            key += "|" + hashlib.md5(json.dumps(p, sort_keys=True).encode()).hexdigest()[:10]
    return {"key": key, "name": p.get("name"), "platform": platform, "app": app,
            "device": device, "start": start, "end": end, "pdate": pdate, "raw": p}


def capture_raw(conn, token: str, max_pages: int) -> dict:
    """Paginate each type newest-first (max_pages cap) → raw table. Idempotent."""
    h = {"Authorization": f"Bearer {token}"}
    cur = conn.cursor()
    results = {}
    for dt in TYPES:
        token_pg, count, pages, err = None, 0, 0, None
        while pages < max_pages:
            params = {"pageSize": 1000}
            if token_pg:
                params["pageToken"] = token_pg
            # A timeout/conn drop on ONE type must not kill the whole run
            # (it did on 2026-06-12: a 90s timeout crashed the deep run and
            # orphaned its ingest_run row mid-'running').
            try:
                r = requests.get(f"{BASE}/users/me/dataTypes/{dt}/dataPoints", headers=h, params=params, timeout=90)
            except requests.RequestException as exc:
                err = f"request failed: {str(exc)[:80]}"
                break
            if r.status_code != 200:
                err = f"{r.status_code}: {r.text[:80]}"
                break
            d = r.json()
            for p in d.get("dataPoints", []):
                pf = parse_point(dt, p)
                cur.execute("""
                    INSERT INTO universe.google_health_data_point
                        (data_type, point_key, name, source_platform, source_app, source_device, start_time, end_time, point_date, value_jsonb)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (data_type, point_key) DO UPDATE SET
                        value_jsonb=EXCLUDED.value_jsonb, point_date=EXCLUDED.point_date,
                        start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time, fetched_at=NOW()
                """, (dt, pf["key"], pf["name"], pf["platform"], pf["app"], pf["device"], pf["start"], pf["end"], pf["pdate"], json.dumps(pf["raw"])))
                count += 1
            conn.commit()
            token_pg = d.get("nextPageToken")
            pages += 1
            if not token_pg:
                break
        results[dt] = {"points": count} if not err else {"error": err}
    return results


# ---------------------------------------------------------------------------
# Daily rollups  →  existing fitbit_* tables  (FITBIT-routed). Gated.
# ---------------------------------------------------------------------------

GH = "universe.google_health_data_point"
MARK = json.dumps({"_src": "google_health"})
# Must match the dashboard server's USER_TIMEZONE so rollup day buckets
# line up with the legacy tables they replace.
USER_TZ = "America/New_York"


def _sql_rollups(cur, since: str) -> None:
    # Resting HR (daily) → exact match to legacy.
    cur.execute(f"""
        INSERT INTO universe.fitbit_heart_rate_daily (date, resting_heart_rate, raw_jsonb)
        SELECT point_date, max((value_jsonb->'dailyRestingHeartRate'->>'beatsPerMinute')::numeric)::int, %s::jsonb
        FROM {GH} WHERE data_type='daily-resting-heart-rate' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET resting_heart_rate=EXCLUDED.resting_heart_rate, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))

    # Respiratory rate (daily) → exact.
    cur.execute(f"""
        INSERT INTO universe.fitbit_breathing_rate_daily (date, breathing_rate, raw_jsonb)
        SELECT point_date, max((value_jsonb->'dailyRespiratoryRate'->>'breathsPerMinute')::numeric), %s::jsonb
        FROM {GH} WHERE data_type='daily-respiratory-rate' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET breathing_rate=EXCLUDED.breathing_rate, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))

    # Skin-temp deviation (nightly − baseline) → exact.
    cur.execute(f"""
        INSERT INTO universe.fitbit_skin_temp_daily (date, nightly_relative, log_type, raw_jsonb)
        SELECT point_date,
               round(max((value_jsonb->'dailySleepTemperatureDerivations'->>'nightlyTemperatureCelsius')::numeric
                       - (value_jsonb->'dailySleepTemperatureDerivations'->>'baselineTemperatureCelsius')::numeric), 2),
               'google_health', %s::jsonb
        FROM {GH} WHERE data_type='daily-sleep-temperature-derivations' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET nightly_relative=EXCLUDED.nightly_relative, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))

    # HRV — mean of overnight per-5-min RMSSD samples (Fitbit-only are sleep-only).
    cur.execute(f"""
        INSERT INTO universe.fitbit_hrv_daily (date, daily_rmssd, raw_jsonb)
        SELECT point_date,
               round(avg((value_jsonb->'heartRateVariability'->>'rootMeanSquareOfSuccessiveDifferencesMilliseconds')::numeric), 3), %s::jsonb
        FROM {GH} WHERE data_type='heart-rate-variability' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET daily_rmssd=EXCLUDED.daily_rmssd, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))

    # SpO2 — overnight avg/min/max, artifacts (<80%) filtered out.
    cur.execute(f"""
        INSERT INTO universe.fitbit_spo2_daily (date, avg_value, min_value, max_value, raw_jsonb)
        SELECT point_date, round(avg(p),2), round(min(p),2), round(max(p),2), %s::jsonb FROM (
            SELECT point_date, (value_jsonb->'oxygenSaturation'->>'percentage')::numeric p
            FROM {GH} WHERE data_type='oxygen-saturation' AND source_platform='FITBIT' AND point_date >= %s
        ) s WHERE p BETWEEN 80 AND 100
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET avg_value=EXCLUDED.avg_value, min_value=EXCLUDED.min_value, max_value=EXCLUDED.max_value, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))

    # Steps — daily sum of intraday intervals, bucketed by the USER'S
    # calendar day (point_date is the UTC date, which shifts evening
    # steps into the next bucket and left settled days 0.7-1.9% short
    # of legacy in validation).
    cur.execute(f"""
        INSERT INTO universe.fitbit_activity_daily (date, steps, raw_jsonb)
        SELECT (start_time AT TIME ZONE %s)::date, sum((value_jsonb->'steps'->>'count')::int), %s::jsonb
        FROM {GH} WHERE data_type='steps' AND source_platform='FITBIT'
              AND start_time IS NOT NULL AND point_date >= %s
        GROUP BY 1
        ON CONFLICT (date) DO UPDATE SET steps=EXCLUDED.steps, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (USER_TZ, MARK, since))


def _rollup_sleep(cur, since: str) -> int:
    # Legacy semantics: total_minutes_asleep/in_bed sum ALL sessions that
    # day (naps included); stage minutes + start/end come from the MAIN
    # (longest) session. Efficiency isn't in Google's summary — computed
    # as asleep/in-period of the main session (Fitbit's own formula is
    # near-identical; readiness only uses it via z-scores anyway).
    cur.execute(f"""
        SELECT point_date, value_jsonb FROM {GH}
        WHERE data_type='sleep' AND source_platform='FITBIT' AND point_date >= %s
    """, (since,))
    days = {}  # date -> {"sessions": [...], "best": {...}}
    for pdate, vj in cur.fetchall():
        s = (vj or {}).get("sleep", {})
        summ = s.get("summary", {})
        asleep = int(summ.get("minutesAsleep", 0) or 0)
        inbed = int(summ.get("minutesInSleepPeriod", 0) or 0)
        day = days.setdefault(pdate, {"asleep": 0, "inbed": 0, "records": 0, "best": None})
        day["asleep"] += asleep
        day["inbed"] += inbed
        day["records"] += 1
        if day["best"] is None or asleep > day["best"]["asleep"]:
            stages = {x.get("type"): int(x.get("minutes", 0) or 0) for x in summ.get("stagesSummary", [])}
            iv = s.get("interval", {})
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
        cur.execute("""
            INSERT INTO universe.fitbit_sleep_daily
                (date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
                 minutes_deep, minutes_light, minutes_rem, minutes_wake,
                 efficiency, main_sleep_start_time, main_sleep_end_time, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                total_minutes_asleep=EXCLUDED.total_minutes_asleep, total_minutes_in_bed=EXCLUDED.total_minutes_in_bed,
                total_sleep_records=EXCLUDED.total_sleep_records,
                minutes_deep=EXCLUDED.minutes_deep, minutes_light=EXCLUDED.minutes_light,
                minutes_rem=EXCLUDED.minutes_rem, minutes_wake=EXCLUDED.minutes_wake,
                efficiency=EXCLUDED.efficiency,
                main_sleep_start_time=EXCLUDED.main_sleep_start_time, main_sleep_end_time=EXCLUDED.main_sleep_end_time,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """, (d, day["asleep"], day["inbed"], day["records"],
              b["deep"], b["light"], b["rem"], b["wake"], efficiency,
              b["start"], b["end"], MARK))
        n += 1
    return n


def _rollup_weight(cur, since: str) -> int:
    # fitbit_body_weight PK is Fitbit's log_id; Google points carry a
    # resource name instead. Derive a NEGATIVE synthetic id from the name
    # hash — real Fitbit log ids are positive, so the two can't collide.
    cur.execute(f"""
        SELECT point_date, name, value_jsonb FROM {GH}
        WHERE data_type='weight' AND source_platform='FITBIT'
              AND point_date >= %s AND name IS NOT NULL
    """, (since,))
    n = 0
    for pdate, name, vj in cur.fetchall():
        w = (vj or {}).get("weight", {})
        grams = w.get("grams")
        if not grams:
            continue
        log_id = -(int(hashlib.md5(name.encode()).hexdigest()[:12], 16))
        cur.execute("""
            INSERT INTO universe.fitbit_body_weight (log_id, date, weight_kg, source, raw_jsonb)
            VALUES (%s,%s,%s,'google_health',%s)
            ON CONFLICT (log_id) DO UPDATE SET
                date=EXCLUDED.date, weight_kg=EXCLUDED.weight_kg, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """, (log_id, pdate, round(grams / 1000.0, 2), MARK))
        n += 1
    return n


def _rollup_food(cur, since: str) -> int:
    cur.execute(f"""
        SELECT point_date, value_jsonb FROM {GH}
        WHERE data_type='nutrition-log' AND source_platform='FITBIT' AND point_date >= %s
    """, (since,))
    agg = {}
    for pdate, vj in cur.fetchall():
        nl = (vj or {}).get("nutritionLog", {})
        a = agg.setdefault(pdate, {"cal": 0.0, "carbs": 0.0, "fat": 0.0, "protein": 0.0, "n": 0})
        a["cal"] += (nl.get("energy", {}) or {}).get("kcal", 0) or 0
        a["carbs"] += (nl.get("totalCarbohydrate", {}) or {}).get("grams", 0) or 0
        a["fat"] += (nl.get("totalFat", {}) or {}).get("grams", 0) or 0
        for nut in nl.get("nutrients", []) or []:
            if nut.get("nutrient") == "PROTEIN":
                a["protein"] += (nut.get("quantity", {}) or {}).get("grams", 0) or 0
        a["n"] += 1
    n = 0
    for d, a in agg.items():
        cur.execute("""
            INSERT INTO universe.fitbit_food_log_daily (date, calories_in, carbs, fat, protein, food_count, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET calories_in=EXCLUDED.calories_in, carbs=EXCLUDED.carbs,
                fat=EXCLUDED.fat, protein=EXCLUDED.protein, food_count=EXCLUDED.food_count, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """, (d, round(a["cal"]), round(a["carbs"], 2), round(a["fat"], 2), round(a["protein"], 2), a["n"], MARK))
        n += 1
    return n


def _rollup_exercise(cur, since: str) -> int:
    """Exercise sessions → fitbit_exercise_log. Google's exercise point id IS
    the legacy Fitbit logId (validated 2026-06-11: 79/79 overlap rows joined
    exactly; dates/durations/avg-HR identical, calories slightly revised), so
    upserts continue the same PK space. Conflict-update only the metric fields
    like the legacy ingest did — activity_type_id/log_type aren't in Google's
    payload, so they're preserved on legacy rows and derived/NULL on new ones.
    Units matched to legacy: distance km (4dp), elevation meters (2dp).
    """
    cur.execute(f"""
        SELECT name, value_jsonb FROM {GH}
        WHERE data_type='exercise' AND source_platform='FITBIT'
              AND point_date >= %s AND name IS NOT NULL
    """, (since,))
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
        cur.execute("""
            INSERT INTO universe.fitbit_exercise_log
                (log_id, date, start_time, activity_name, log_type, calories,
                 duration_ms, distance, distance_unit, steps, average_heart_rate,
                 elevation_gain, has_active_zone_minutes, raw_jsonb)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (log_id) DO UPDATE SET
                calories=EXCLUDED.calories, duration_ms=EXCLUDED.duration_ms,
                distance=EXCLUDED.distance, steps=EXCLUDED.steps,
                average_heart_rate=EXCLUDED.average_heart_rate,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """, (log_id, local_date, start,
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


def _rollup_activity_daily(token: str, cur, rollup_days: int) -> int:
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
        cur.execute("""
            INSERT INTO universe.fitbit_activity_daily
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
        """, (d, round(kcal),
              round(int(mm) / 1_000_000, 3) if mm is not None else 0,
              int(cnt) if cnt is not None else 0,
              levels.get("LIGHT", 0), levels.get("MODERATE", 0), levels.get("VIGOROUS", 0), MARK))
        n += 1
    return n


def run_rollups(conn, token: str, rollup_days: int) -> dict:
    since = (datetime.now(timezone.utc).date() - timedelta(days=rollup_days)).isoformat()
    cur = conn.cursor()
    _sql_rollups(cur, since)
    sleep_n = _rollup_sleep(cur, since)
    food_n = _rollup_food(cur, since)
    weight_n = _rollup_weight(cur, since)
    exercise_n = _rollup_exercise(cur, since)
    conn.commit()  # lock in the SQL-sourced rollups before the network rollup
    activity: dict = {}
    try:
        activity["activity_days"] = _rollup_activity_daily(token, cur, rollup_days)
        conn.commit()
    except Exception as exc:  # noqa: BLE001 — network rollup must not drop the committed SQL rollups
        conn.rollback()
        activity["activity_error"] = str(exc)[:200]
    return {"since": since, "sleep_days": sleep_n, "food_days": food_n,
            "weight_logs": weight_n, "exercise_logs": exercise_n, **activity}


# ---------------------------------------------------------------------------
# Run tracking + main
# ---------------------------------------------------------------------------

def main(
    creds_resource_path=None,
    db_resource_path=None,
    days_back: int = 3,
    # Default is the DEEP-capture budget (40 pages × 1000 pts per type) so an
    # argless manual run (e.g. Windmill MCP runScriptByPath, which cannot pass
    # args) backfills history. The 4-hourly schedule passes max_pages=3
    # explicitly, keeping routine runs light.
    max_pages: int = 40,
    write_daily: bool = False,
    rollup_days: int = 45,
):
    # Windmill can invoke main() with None for unset optional params.
    days_back = days_back if days_back is not None else 3
    max_pages = max_pages if max_pages is not None else 40
    rollup_days = rollup_days if rollup_days is not None else 45

    token = google_access_token(creds_resource_path or DEFAULT_OAUTH_RES)
    db = wmill.get_resource(db_resource_path or DEFAULT_DB_RES)
    with psycopg.connect(**conn_kwargs(db)) as conn:
        cur = conn.cursor()
        ensure_raw_table(cur)
        conn.commit()
        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)

        # Any crash below must still finalize the run row — an unhandled
        # raise used to leave it 'running' forever (monitoring-blind).
        captured: dict = {}
        rolled = {"skipped": "write_daily=False (parallel-run; raw only)"}
        try:
            captured = capture_raw(conn, token, max_pages)
            if write_daily:
                rolled = run_rollups(conn, token, rollup_days)
        except Exception as exc:  # noqa: BLE001
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass
            update_ingest_run(conn, run_id, "failed", 0, 1,
                              {"crash": str(exc)[:300], "captured": captured})
            raise

        total_pts = sum(v.get("points", 0) for v in captured.values() if isinstance(v, dict))
        errors = sum(1 for v in captured.values() if isinstance(v, dict) and v.get("error"))
        update_ingest_run(conn, run_id, "completed" if errors == 0 else "partial",
                          total_pts, errors, {"captured": captured, "rolled": rolled})

    return {"status": "ok", "raw_points": total_pts, "errors": errors,
            "write_daily": write_daily, "captured": captured, "rolled": rolled}


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
#   SKIP  food fiber/sodium/water/calorie_goal → not in Google's nutrition-log
#   OPEN  AZM (active-zone-minutes) → captured raw; a HR-zone signal distinct
#         from MET-based active-minutes (r~=0.37). Could be added as a NEW
#         correlation series (new column), but it is NOT a legacy replacement.
