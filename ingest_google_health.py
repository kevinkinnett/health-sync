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
from datetime import datetime, timedelta, timezone

import psycopg
import requests
import wmill

PROVIDER = "google_health"
JOB_NAME = "google_health_ingest"
DEFAULT_OAUTH_RES = "u/kevin/google_health_oauth"
DEFAULT_DB_RES = "u/kevin/universe_db"
BASE = "https://health.googleapis.com/v4"
TOKEN_URL = "https://oauth2.googleapis.com/token"

# Every type we capture raw. (total-calories/weight daily-mapping are TODO —
# captured raw, but not yet rolled into fitbit_* : see notes at the bottom.)
TYPES = [
    "daily-resting-heart-rate", "daily-respiratory-rate",
    "daily-sleep-temperature-derivations", "oxygen-saturation",
    "heart-rate-variability", "weight", "vo2-max", "steps", "distance",
    "active-zone-minutes", "nutrition-log", "sleep",
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
        key = "|".join([dt, platform or "", app or "", pdate or start or ""])
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
            r = requests.get(f"{BASE}/users/me/dataTypes/{dt}/dataPoints", headers=h, params=params, timeout=90)
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

    # Steps — daily sum of intraday intervals.
    cur.execute(f"""
        INSERT INTO universe.fitbit_activity_daily (date, steps, raw_jsonb)
        SELECT point_date, sum((value_jsonb->'steps'->>'count')::int), %s::jsonb
        FROM {GH} WHERE data_type='steps' AND source_platform='FITBIT' AND point_date >= %s
        GROUP BY point_date
        ON CONFLICT (date) DO UPDATE SET steps=EXCLUDED.steps, raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
    """, (MARK, since))


def _rollup_sleep(cur, since: str) -> int:
    cur.execute(f"""
        SELECT point_date, value_jsonb FROM {GH}
        WHERE data_type='sleep' AND source_platform='FITBIT' AND point_date >= %s
    """, (since,))
    best = {}  # date -> the longest session that day
    for pdate, vj in cur.fetchall():
        s = (vj or {}).get("sleep", {})
        summ = s.get("summary", {})
        asleep = int(summ.get("minutesAsleep", 0) or 0)
        if pdate not in best or asleep > best[pdate]["asleep"]:
            stages = {x.get("type"): int(x.get("minutes", 0) or 0) for x in summ.get("stagesSummary", [])}
            iv = s.get("interval", {})
            best[pdate] = {
                "asleep": asleep,
                "inbed": int(summ.get("minutesInSleepPeriod", 0) or 0),
                "deep": stages.get("DEEP"), "light": stages.get("LIGHT"),
                "rem": stages.get("REM"), "wake": stages.get("AWAKE"),
                "start": iv.get("startTime"), "end": iv.get("endTime"),
            }
    n = 0
    for d, b in best.items():
        cur.execute("""
            INSERT INTO universe.fitbit_sleep_daily
                (date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
                 minutes_deep, minutes_light, minutes_rem, minutes_wake,
                 main_sleep_start_time, main_sleep_end_time, raw_jsonb)
            VALUES (%s,%s,%s,1,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (date) DO UPDATE SET
                total_minutes_asleep=EXCLUDED.total_minutes_asleep, total_minutes_in_bed=EXCLUDED.total_minutes_in_bed,
                minutes_deep=EXCLUDED.minutes_deep, minutes_light=EXCLUDED.minutes_light,
                minutes_rem=EXCLUDED.minutes_rem, minutes_wake=EXCLUDED.minutes_wake,
                main_sleep_start_time=EXCLUDED.main_sleep_start_time, main_sleep_end_time=EXCLUDED.main_sleep_end_time,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
        """, (d, b["asleep"], b["inbed"], b["deep"], b["light"], b["rem"], b["wake"], b["start"], b["end"], MARK))
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


def run_rollups(conn, rollup_days: int) -> dict:
    since = (datetime.now(timezone.utc).date() - timedelta(days=rollup_days)).isoformat()
    cur = conn.cursor()
    _sql_rollups(cur, since)
    sleep_n = _rollup_sleep(cur, since)
    food_n = _rollup_food(cur, since)
    conn.commit()
    return {"since": since, "sleep_days": sleep_n, "food_days": food_n}


# ---------------------------------------------------------------------------
# Run tracking + main
# ---------------------------------------------------------------------------

def main(
    creds_resource_path=None,
    db_resource_path=None,
    days_back: int = 3,
    max_pages: int = 3,
    write_daily: bool = False,
    rollup_days: int = 45,
):
    token = google_access_token(creds_resource_path or DEFAULT_OAUTH_RES)
    db = wmill.get_resource(db_resource_path or DEFAULT_DB_RES)
    conn_kwargs = {"host": db["host"], "port": int(db.get("port", 5432)), "user": db["user"],
                   "password": db["password"], "dbname": db["dbname"], "sslmode": db.get("sslmode", "disable")}
    with psycopg.connect(**conn_kwargs) as conn:
        cur = conn.cursor()
        ensure_raw_table(cur)
        conn.commit()
        cur.execute("INSERT INTO universe.ingest_run (provider, job_name, status) VALUES (%s,%s,'running') RETURNING ingest_run_id", (PROVIDER, JOB_NAME))
        run_id = cur.fetchone()[0]
        conn.commit()

        captured = capture_raw(conn, token, max_pages)
        rolled = run_rollups(conn, rollup_days) if write_daily else {"skipped": "write_daily=False (parallel-run; raw only)"}

        total_pts = sum(v.get("points", 0) for v in captured.values() if isinstance(v, dict))
        errors = sum(1 for v in captured.values() if isinstance(v, dict) and v.get("error"))
        cur.execute("UPDATE universe.ingest_run SET finished_at_utc=NOW(), status=%s, rows_written=%s, error_count=%s, details=%s WHERE ingest_run_id=%s",
                    ("completed" if errors == 0 else "partial", total_pts, errors, json.dumps({"captured": captured, "rolled": rolled}), run_id))
        conn.commit()

    return {"status": "ok", "raw_points": total_pts, "errors": errors,
            "write_daily": write_daily, "captured": captured, "rolled": rolled}


# NOTE — deferred (captured raw, not yet rolled into fitbit_* tables):
#   total-calories  → needs the :rollup endpoint (rejects plain list)
#   weight          → fitbit_body_weight PK is a Fitbit logId; needs a key strategy
#   distance / AZM  → optional activity-table fields
