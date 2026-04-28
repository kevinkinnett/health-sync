"""
Ingest Fitbit health data into universe schema tables in PostgreSQL.

Data types (10 total):
  Daily (1 request/day):  activity, heart_rate, body_weight
  Range (1 req/30 days):  sleep, spo2, hrv, breathing_rate, skin_temp, vo2_max
  Paginated:              exercise_log

Sleep moved from Daily to Range — Fitbit's per-day sleep endpoint silently returns
empty for many dates that *do* have sleep data, while the range endpoint is reliable.

Handles OAuth token auto-refresh, resumable backfill via fitbit_ingest_state,
and rate-limit budgeting (150 req/hr Fitbit limit).

Range-based types are fetched first since they're vastly more efficient
(1 API call = up to 30 days), leaving the full budget for daily types.
"""

import base64
import json
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import psycopg
import requests
import wmill

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROVIDER = "fitbit"
JOB_NAME = "fitbit_ingest"
DEFAULT_DB_RESOURCE_PATH = "u/kevin/universe_db"
DEFAULT_FITBIT_RESOURCE_PATH = "u/kevin/fitbit_oauth"
BASE_URL = "https://api.fitbit.com"
TOKEN_URL = "https://api.fitbit.com/oauth2/token"
DEFAULT_BACKFILL_DAYS = 365
RATE_LIMIT_PAUSE = 1.0  # seconds between API calls
MAX_RANGE_DAYS = 30  # max days per range API request
# Rolling window of recent days that are always re-fetched, regardless of state cursor.
# Fitbit data for sleep / HRV / SpO2 / breathing / skin temp can arrive 1+ days late
# (the metrics are derived after nightly processing). Without this, a day that returns
# empty on first attempt is permanently lost — the cursor advances past it and never
# revisits. Re-fetches are upsert-safe via ON CONFLICT.
RECHECK_DAYS = 14
# Recent-day window where the activity fetcher cross-checks the daily summary
# against the per-15-min intraday endpoint and keeps the larger step count.
# Fitbit's daily summary occasionally lags the watch's most recent sync —
# the intraday dataset reflects the freshest data Fitbit holds, so the
# greater value always represents reality more accurately. Bounded so we
# don't burn API budget chasing already-stable older days.
INTRADAY_FALLBACK_DAYS = 14
# Fallback IANA zone used when the user's Fitbit profile zone can't be auto-detected.
# /1/user/-/profile.json requires the `profile` OAuth scope, which the current token
# was not granted. Until the user re-authorizes with that scope, every run would
# otherwise default to UTC and silently mis-stamp every naive Fitbit timestamp by
# the user's UTC offset. This constant is the operator's known home zone — a
# dramatically safer default than UTC for a single-user personal pipeline. The
# `user_timezone` arg still overrides this if passed explicitly.
DEFAULT_FALLBACK_TZ = "America/New_York"

# Types fetched one day at a time. Sleep was previously here but moved to RANGE_TYPES
# because Fitbit's per-day sleep endpoint /1.2/user/-/sleep/date/{date}.json silently
# returns empty for many days that *do* have sleep data — confirmed 2026-04-26 when
# the range endpoint returned 10 dates of sleep that the per-day endpoint had reported
# as empty. The range endpoint is the source of truth.
DAILY_TYPES = ["activity", "heart_rate", "body_weight"]
# Types fetched via efficient date-range APIs
RANGE_TYPES = ["sleep", "spo2", "hrv", "breathing_rate", "skin_temp", "vo2_max"]
# Types fetched via paginated list APIs (new)
PAGINATED_TYPES = ["exercise_log"]
# All types combined
ALL_TYPES = DAILY_TYPES + RANGE_TYPES + PAGINATED_TYPES


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------

def resolve_db(db: Optional[dict[str, Any]], db_resource_path: Optional[str]) -> dict[str, Any]:
    return db if db is not None else wmill.get_resource(db_resource_path or DEFAULT_DB_RESOURCE_PATH)


def resolve_fitbit_creds(fitbit_resource_path: Optional[str]) -> dict[str, Any]:
    return wmill.get_resource(fitbit_resource_path or DEFAULT_FITBIT_RESOURCE_PATH)


# ---------------------------------------------------------------------------
# OAuth token management
# ---------------------------------------------------------------------------

def refresh_token_if_needed(creds: dict[str, Any], resource_path: str) -> dict[str, Any]:
    """Auto-refresh Fitbit OAuth token if expiring within 5 minutes."""
    expires_at = creds.get("expires_at", 0)
    if time.time() < expires_at - 300:
        return creds

    print("Access token expired or expiring soon, refreshing...")
    basic = base64.b64encode(
        f"{creds['client_id']}:{creds['client_secret']}".encode()
    ).decode()

    resp = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": creds["refresh_token"],
            "client_id": creds["client_id"],
        },
        timeout=30,
    )
    resp.raise_for_status()
    token_data = resp.json()

    creds["access_token"] = token_data["access_token"]
    creds["refresh_token"] = token_data["refresh_token"]
    creds["expires_at"] = int(time.time()) + token_data.get("expires_in", 28800)

    wmill.set_resource(
        resource_path or DEFAULT_FITBIT_RESOURCE_PATH,
        creds,
        resource_type="any",
    )
    print("Token refreshed and saved.")
    return creds


def fitbit_get(creds: dict[str, Any], path: str) -> dict[str, Any]:
    """Authenticated GET to Fitbit API with rate-limit pause."""
    resp = requests.get(
        f"{BASE_URL}{path}",
        headers={"Authorization": f"Bearer {creds['access_token']}"},
        timeout=30,
    )
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", 60))
        print(f"Rate limited. Retry-After: {retry_after}s")
        raise RateLimitError(retry_after)
    resp.raise_for_status()
    time.sleep(RATE_LIMIT_PAUSE)
    return resp.json()


class RateLimitError(Exception):
    def __init__(self, retry_after: int):
        self.retry_after = retry_after
        super().__init__(f"Rate limited, retry after {retry_after}s")


# ---------------------------------------------------------------------------
# Timezone resolution
# ---------------------------------------------------------------------------

def get_profile_timezone(creds: dict[str, Any]) -> Optional[str]:
    """
    Fetch the user's Fitbit profile timezone (an IANA name like
    `America/New_York`). Returns None if the call fails or the field is
    missing — the caller should fall back to a sensible default.

    Why: every Fitbit "daily" endpoint buckets data by *the user's profile
    timezone*, not UTC. If we compute "today" as `datetime.now(UTC).date()`
    we may ask Fitbit for a date that hasn't started yet for the user — and
    on the day after, the script's state cursor has already passed that
    date, so the under-fetched day is silently abandoned. Using the profile
    TZ keeps the script's notion of "today" aligned with Fitbit's.
    """
    try:
        data = fitbit_get(creds, "/1/user/-/profile.json")
    except (requests.HTTPError, RateLimitError) as exc:
        print(f"  [profile] Could not fetch profile timezone: {exc}")
        return None
    tz = data.get("user", {}).get("timezone")
    if not isinstance(tz, str) or not tz:
        return None
    return tz


def today_in_tz(tz_name: str) -> date:
    """
    Returns the calendar `date` of "now" as observed in `tz_name`. Uses
    `zoneinfo` (stdlib, system tzdata) so DST transitions resolve correctly.
    Falls back to UTC if `tz_name` is unknown to the system.
    """
    try:
        zi = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        print(f"  [tz] Unknown zone {tz_name!r}; falling back to UTC")
        zi = timezone.utc
    return datetime.now(zi).date()


def parse_fitbit_local_dt(ts: Optional[str], tz_name: str) -> Optional[datetime]:
    """
    Parse a naive ISO timestamp string from Fitbit and stamp it with the
    user's profile timezone so psycopg stores it as the correct TIMESTAMPTZ.

    Why this exists: Fitbit's API returns timestamps like
    `"2026-04-26T21:19:00.000"` with no offset and no `Z` suffix — the value
    is in the user's profile-configured local time. If we hand the raw string
    to a TIMESTAMPTZ column, Postgres assumes UTC and the wall-clock value
    silently shifts by the profile's UTC offset. Re-stamping the parsed
    naive datetime with `ZoneInfo(tz_name)` produces a tz-aware datetime
    that maps to the actual instant Fitbit meant.

    Handles:
      - `"YYYY-MM-DDTHH:MM:SS"` (Fitbit's typical format)
      - `"YYYY-MM-DDTHH:MM:SS.fff"` (with milliseconds — Fitbit sleep API)
      - `"YYYY-MM-DDTHH:MM:SS+ZZ:ZZ"` / `"...Z"` (already tz-aware — pass through)
    Returns None for empty/invalid input.
    """
    if not ts:
        return None
    s = ts.strip()
    if not s:
        return None
    # If the string already carries explicit tz info, trust it and parse as-is.
    has_offset = (
        s.endswith("Z")
        or (len(s) >= 6 and (s[-6] in "+-" and s[-3] == ":"))
        or (len(s) >= 5 and s[-5] in "+-" and s[-3:].isdigit())
    )
    if has_offset:
        try:
            normalized = s.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        except ValueError:
            return None
    # Naive value → stamp with profile tz.
    # Strip fractional seconds for cross-version compat with fromisoformat.
    if "." in s:
        s = s.split(".", 1)[0]
    try:
        naive = datetime.fromisoformat(s)
    except ValueError:
        return None
    try:
        zi = ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        zi = timezone.utc
    return naive.replace(tzinfo=zi)


# ---------------------------------------------------------------------------
# Table DDL
# ---------------------------------------------------------------------------

def ensure_tables(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        # --- Existing tables ---
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_activity_daily (
                date                    DATE PRIMARY KEY,
                steps                   INTEGER,
                calories_out            INTEGER,
                calories_bmr            INTEGER,
                active_calories         INTEGER,
                distance_km             NUMERIC(8,3),
                floors                  INTEGER,
                minutes_sedentary       INTEGER,
                minutes_lightly_active  INTEGER,
                minutes_fairly_active   INTEGER,
                minutes_very_active     INTEGER,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_sleep_daily (
                date                    DATE PRIMARY KEY,
                total_minutes_asleep    INTEGER,
                total_minutes_in_bed    INTEGER,
                total_sleep_records     INTEGER,
                minutes_deep            INTEGER,
                minutes_light           INTEGER,
                minutes_rem             INTEGER,
                minutes_wake            INTEGER,
                efficiency              INTEGER,
                main_sleep_start_time   TIMESTAMPTZ,
                main_sleep_end_time     TIMESTAMPTZ,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_heart_rate_daily (
                date                    DATE PRIMARY KEY,
                resting_heart_rate      INTEGER,
                zone_out_of_range_min   INTEGER,
                zone_fat_burn_min       INTEGER,
                zone_cardio_min         INTEGER,
                zone_peak_min           INTEGER,
                zone_out_of_range_cal   NUMERIC(8,2),
                zone_fat_burn_cal       NUMERIC(8,2),
                zone_cardio_cal         NUMERIC(8,2),
                zone_peak_cal           NUMERIC(8,2),
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_body_weight (
                log_id                  BIGINT PRIMARY KEY,
                date                    DATE NOT NULL,
                time                    TIME,
                weight_kg               NUMERIC(6,2) NOT NULL,
                bmi                     NUMERIC(5,2),
                fat_pct                 NUMERIC(5,2),
                source                  TEXT,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS ix_fitbit_body_weight_date
                ON universe.fitbit_body_weight (date DESC)
        """)

        # --- New tables ---
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_spo2_daily (
                date                    DATE PRIMARY KEY,
                avg_value               NUMERIC(5,2),
                min_value               NUMERIC(5,2),
                max_value               NUMERIC(5,2),
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_hrv_daily (
                date                    DATE PRIMARY KEY,
                daily_rmssd             NUMERIC(8,3),
                deep_rmssd              NUMERIC(8,3),
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_breathing_rate_daily (
                date                    DATE PRIMARY KEY,
                breathing_rate          NUMERIC(5,2),
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_skin_temp_daily (
                date                    DATE PRIMARY KEY,
                nightly_relative        NUMERIC(5,2),
                log_type                TEXT,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_cardio_score_daily (
                date                    DATE PRIMARY KEY,
                vo2_max                 TEXT,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_exercise_log (
                log_id                  BIGINT PRIMARY KEY,
                date                    DATE NOT NULL,
                start_time              TIMESTAMPTZ,
                activity_name           TEXT NOT NULL,
                activity_type_id        INTEGER,
                log_type                TEXT,
                calories                INTEGER,
                duration_ms             BIGINT,
                distance                NUMERIC(10,4),
                distance_unit           TEXT,
                steps                   INTEGER,
                average_heart_rate      INTEGER,
                elevation_gain          NUMERIC(8,2),
                has_active_zone_minutes BOOLEAN DEFAULT FALSE,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS ix_fitbit_exercise_log_date
                ON universe.fitbit_exercise_log (date DESC)
        """)

        # State table (unchanged)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_ingest_state (
                data_type               TEXT PRIMARY KEY,
                latest_fetched_date     DATE,
                earliest_fetched_date   DATE,
                backfill_complete       BOOLEAN NOT NULL DEFAULT FALSE,
                last_success_at_utc     TIMESTAMPTZ,
                last_run_id             BIGINT,
                updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                details                 JSONB
            )
        """)
        # Backfill the `details` column on tables that pre-date its addition,
        # so the timezone-drift detection works on existing deployments.
        cur.execute("""
            ALTER TABLE universe.fitbit_ingest_state
            ADD COLUMN IF NOT EXISTS details JSONB
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# Ingest run tracking
# ---------------------------------------------------------------------------

def create_ingest_run(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.ingest_run (provider, job_name, status)
            VALUES (%s, %s, 'running')
            RETURNING ingest_run_id
            """,
            (PROVIDER, JOB_NAME),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def update_ingest_run(
    conn: psycopg.Connection,
    run_id: int,
    status: str,
    rows_written: int,
    error_count: int,
    details: dict[str, Any],
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE universe.ingest_run
            SET finished_at_utc = NOW(),
                status = %s,
                rows_written = %s,
                error_count = %s,
                details = %s
            WHERE ingest_run_id = %s
            """,
            (status, rows_written, error_count, json.dumps(details), run_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# State tracking
# ---------------------------------------------------------------------------

def get_state(conn: psycopg.Connection, data_type: str) -> Optional[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT latest_fetched_date, earliest_fetched_date, backfill_complete "
            "FROM universe.fitbit_ingest_state WHERE data_type = %s",
            (data_type,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {
            "latest_fetched_date": row[0],
            "earliest_fetched_date": row[1],
            "backfill_complete": row[2],
        }


def update_state(
    conn: psycopg.Connection,
    data_type: str,
    latest_date: str,
    earliest_date: str,
    backfill_complete: bool,
    run_id: int,
    profile_tz: Optional[str] = None,
) -> None:
    """
    Upsert the per-data-type ingest state. When `profile_tz` is supplied,
    it's merged into the `details` JSONB so later runs can detect a
    timezone change since the last successful sync (which would suggest
    re-backfilling, since calendar-day buckets are TZ-dependent).
    """
    details_json = json.dumps({"profile_tz": profile_tz}) if profile_tz else None
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.fitbit_ingest_state
                (data_type, latest_fetched_date, earliest_fetched_date,
                 backfill_complete, last_success_at_utc, last_run_id,
                 updated_at_utc, details)
            VALUES (%s, %s, %s, %s, NOW(), %s, NOW(), %s::jsonb)
            ON CONFLICT (data_type) DO UPDATE SET
                latest_fetched_date = GREATEST(
                    universe.fitbit_ingest_state.latest_fetched_date,
                    EXCLUDED.latest_fetched_date
                ),
                earliest_fetched_date = LEAST(
                    universe.fitbit_ingest_state.earliest_fetched_date,
                    EXCLUDED.earliest_fetched_date
                ),
                backfill_complete = EXCLUDED.backfill_complete,
                last_success_at_utc = NOW(),
                last_run_id = EXCLUDED.last_run_id,
                updated_at_utc = NOW(),
                details = COALESCE(
                    universe.fitbit_ingest_state.details,
                    '{}'::jsonb
                ) || COALESCE(EXCLUDED.details, '{}'::jsonb)
            """,
            (data_type, latest_date, earliest_date, backfill_complete,
             run_id, details_json),
        )
    conn.commit()


def get_last_profile_tz(conn: psycopg.Connection) -> Optional[str]:
    """
    Returns the most-recently-recorded `profile_tz` across all data types,
    or None if no run has stamped one yet. Used to detect TZ drift since
    the previous run so we can warn the user that calendar buckets may
    have shifted.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT details->>'profile_tz' AS profile_tz
            FROM universe.fitbit_ingest_state
            WHERE details ? 'profile_tz'
            ORDER BY updated_at_utc DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        return row[0] if row else None


SLEEP_TZ_BACKFILL_KEY = "__sleep_tz_backfill__"


def backfill_sleep_timestamps_once(conn: psycopg.Connection, profile_tz: str) -> int:
    """
    One-time correction for historical sleep rows that were stored with naive
    Fitbit timestamps silently interpreted as UTC. Re-stamps each
    `main_sleep_start_time` / `main_sleep_end_time` so its WALL-CLOCK value
    is interpreted as `profile_tz` instead of UTC.

    The transformation is `(ts AT TIME ZONE 'UTC') AT TIME ZONE profile_tz`:
      1. `AT TIME ZONE 'UTC'` strips the (broken) tz, yielding a naive
         timestamp equal to the wall-clock value Fitbit originally returned.
      2. `AT TIME ZONE profile_tz` re-attaches the correct zone, producing
         the actual UTC instant the user experienced.

    Idempotent: stamps a sentinel row in `fitbit_ingest_state` keyed by
    `__sleep_tz_backfill__` with `details->>'profile_tz'` so re-runs
    against the same zone are no-ops. Note: if the user's profile zone
    changes later we don't re-run automatically — the rolling RECHECK_DAYS
    window will heal recent days from the next ingest, and any fresh
    backfill across an older zone change has to be a manual SQL operation.

    Returns the number of rows updated (0 when the sentinel says we've
    already done this work).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT details->>'profile_tz'
            FROM universe.fitbit_ingest_state
            WHERE data_type = %s
            """,
            (SLEEP_TZ_BACKFILL_KEY,),
        )
        row = cur.fetchone()
        if row and row[0] == profile_tz:
            return 0
        # Recent days will be re-fetched cleanly by the rolling recheck
        # window with the now-correct ingest path, so we only touch days
        # outside that window. (Touching them anyway would still be safe
        # but would fight with the upsert that's about to overwrite them.)
        cur.execute(
            """
            UPDATE universe.fitbit_sleep_daily
            SET
                main_sleep_start_time = (main_sleep_start_time AT TIME ZONE 'UTC')
                                          AT TIME ZONE %(tz)s,
                main_sleep_end_time   = (main_sleep_end_time   AT TIME ZONE 'UTC')
                                          AT TIME ZONE %(tz)s,
                fetched_at = NOW()
            WHERE
                date < (CURRENT_DATE - %(recheck)s::int)
                AND (main_sleep_start_time IS NOT NULL OR main_sleep_end_time IS NOT NULL)
            """,
            {"tz": profile_tz, "recheck": RECHECK_DAYS},
        )
        updated = cur.rowcount or 0
        cur.execute(
            """
            INSERT INTO universe.fitbit_ingest_state
                (data_type, details, updated_at_utc)
            VALUES (%s, %s::jsonb, NOW())
            ON CONFLICT (data_type) DO UPDATE SET
                details = EXCLUDED.details,
                updated_at_utc = NOW()
            """,
            (
                SLEEP_TZ_BACKFILL_KEY,
                json.dumps({
                    "profile_tz": profile_tz,
                    "rows_updated": updated,
                }),
            ),
        )
    conn.commit()
    return updated


# ===========================================================================
# DAILY FETCHERS (1 request per day, existing)
# ===========================================================================

def fetch_intraday_steps_sum(creds: dict[str, Any], date_str: str) -> Optional[int]:
    """
    Fetch the per-15-minute intraday step series for `date_str` and sum it.

    Why: Fitbit's daily-summary endpoint can report a stale total when the
    watch has synced fresh data the Web API hasn't yet rolled into the
    summary. The intraday endpoint reflects the latest data Fitbit holds,
    so summing it gives a true-up value to compare against the summary.

    Returns the total step count, or None if the call fails or the dataset
    is missing. Caller decides what to do with None vs a real number.
    """
    try:
        data = fitbit_get(
            creds,
            f"/1/user/-/activities/tracker/steps/date/{date_str}/1d/15min.json",
        )
    except (requests.HTTPError, RateLimitError) as exc:
        print(f"  [intraday] {date_str} fetch failed ({exc}); skipping")
        return None
    intraday = data.get("activities-tracker-steps-intraday", {})
    dataset = intraday.get("dataset", [])
    if not isinstance(dataset, list) or not dataset:
        return None
    total = 0
    for point in dataset:
        v = point.get("value") if isinstance(point, dict) else None
        if isinstance(v, int):
            total += v
        elif isinstance(v, str):
            try:
                total += int(v)
            except ValueError:
                continue
        elif isinstance(v, float):
            total += int(v)
    return total


def fetch_and_upsert_activity(
    conn: psycopg.Connection, creds: dict, date_str: str,
    today: Optional[date] = None,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    data = fitbit_get(creds, f"/1/user/-/activities/date/{date_str}.json")
    s = data.get("summary", {})
    distances = s.get("distances", [])
    total_dist = next(
        (d["distance"] for d in distances if d.get("activity") == "total"), None
    )
    distance_km = float(total_dist) if total_dist is not None else None

    summary_steps = s.get("steps")

    # Intraday-sum fallback for recent days. Within INTRADAY_FALLBACK_DAYS,
    # also pull the per-15-min step dataset and use whichever is larger:
    # the summary endpoint sometimes lags the watch's last sync, so the
    # intraday total is the freshest value Fitbit has. Steps only ever
    # increase across syncs, so taking the max never overshoots reality.
    final_steps = summary_steps
    if today is not None and summary_steps is not None:
        try:
            target_date = date.fromisoformat(date_str)
            within_window = (today - target_date).days <= INTRADAY_FALLBACK_DAYS
        except ValueError:
            within_window = False
        if within_window:
            intraday_sum = fetch_intraday_steps_sum(creds, date_str)
            if intraday_sum is not None and intraday_sum > summary_steps:
                print(
                    f"  [activity] {date_str}: intraday sum {intraday_sum} "
                    f"> summary {summary_steps}; using intraday total."
                )
                final_steps = intraday_sum
                # Stash both values in raw_jsonb so the discrepancy is
                # visible if anyone audits the row later.
                data = {
                    **data,
                    "_dashboard_intraday": {
                        "intraday_step_sum": intraday_sum,
                        "summary_step_count": summary_steps,
                    },
                }

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.fitbit_activity_daily
                (date, steps, calories_out, calories_bmr, active_calories,
                 distance_km, floors, minutes_sedentary, minutes_lightly_active,
                 minutes_fairly_active, minutes_very_active, raw_jsonb)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date) DO UPDATE SET
                steps = EXCLUDED.steps, calories_out = EXCLUDED.calories_out,
                calories_bmr = EXCLUDED.calories_bmr, active_calories = EXCLUDED.active_calories,
                distance_km = EXCLUDED.distance_km, floors = EXCLUDED.floors,
                minutes_sedentary = EXCLUDED.minutes_sedentary,
                minutes_lightly_active = EXCLUDED.minutes_lightly_active,
                minutes_fairly_active = EXCLUDED.minutes_fairly_active,
                minutes_very_active = EXCLUDED.minutes_very_active,
                raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
            """,
            (date_str, final_steps, s.get("caloriesOut"), s.get("caloriesBMR"),
             s.get("activityCalories"), distance_km, s.get("floors"),
             s.get("sedentaryMinutes"), s.get("lightlyActiveMinutes"),
             s.get("fairlyActiveMinutes"), s.get("veryActiveMinutes"),
             json.dumps(data)),
        )
    conn.commit()
    return 1


def fetch_and_upsert_heart_rate(
    conn: psycopg.Connection, creds: dict, date_str: str,
    today: Optional[date] = None,  # noqa: ARG001 — accepted for dispatch parity
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    data = fitbit_get(creds, f"/1/user/-/activities/heart/date/{date_str}/1d.json")
    hr_list = data.get("activities-heart", [])
    if not hr_list:
        return 0

    value = hr_list[0].get("value", {})
    zones = {z["name"]: z for z in value.get("heartRateZones", [])}
    zm = lambda n: zones.get(n, {}).get("minutes")
    zc = lambda n: zones.get(n, {}).get("caloriesOut")

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.fitbit_heart_rate_daily
                (date, resting_heart_rate, zone_out_of_range_min, zone_fat_burn_min,
                 zone_cardio_min, zone_peak_min, zone_out_of_range_cal, zone_fat_burn_cal,
                 zone_cardio_cal, zone_peak_cal, raw_jsonb)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date) DO UPDATE SET
                resting_heart_rate = EXCLUDED.resting_heart_rate,
                zone_out_of_range_min = EXCLUDED.zone_out_of_range_min,
                zone_fat_burn_min = EXCLUDED.zone_fat_burn_min,
                zone_cardio_min = EXCLUDED.zone_cardio_min, zone_peak_min = EXCLUDED.zone_peak_min,
                zone_out_of_range_cal = EXCLUDED.zone_out_of_range_cal,
                zone_fat_burn_cal = EXCLUDED.zone_fat_burn_cal,
                zone_cardio_cal = EXCLUDED.zone_cardio_cal, zone_peak_cal = EXCLUDED.zone_peak_cal,
                raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
            """,
            (date_str, value.get("restingHeartRate"),
             zm("Out of Range"), zm("Fat Burn"), zm("Cardio"), zm("Peak"),
             zc("Out of Range"), zc("Fat Burn"), zc("Cardio"), zc("Peak"),
             json.dumps(data)),
        )
    conn.commit()
    return 1


def fetch_and_upsert_body_weight(
    conn: psycopg.Connection, creds: dict, date_str: str,
    today: Optional[date] = None,  # noqa: ARG001 — accepted for dispatch parity
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    data = fitbit_get(creds, f"/1/user/-/body/log/weight/date/{date_str}.json")
    entries = data.get("weight", [])
    if not entries:
        return 0
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            cur.execute(
                """
                INSERT INTO universe.fitbit_body_weight
                    (log_id, date, time, weight_kg, bmi, fat_pct, source, raw_jsonb)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (log_id) DO UPDATE SET
                    weight_kg = EXCLUDED.weight_kg, bmi = EXCLUDED.bmi,
                    fat_pct = EXCLUDED.fat_pct, raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (entry["logId"], entry.get("date"), entry.get("time"),
                 entry.get("weight"), entry.get("bmi"), entry.get("fat"),
                 entry.get("source"), json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


DAILY_FETCHERS = {
    "activity": fetch_and_upsert_activity,
    "heart_rate": fetch_and_upsert_heart_rate,
    "body_weight": fetch_and_upsert_body_weight,
}


# ===========================================================================
# RANGE FETCHERS (1 request per 30 days — massively more efficient)
# ===========================================================================

def fetch_and_upsert_sleep_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",
) -> int:
    """
    GET /1.2/user/-/sleep/date/{start}/{end}.json → {sleep: [...], summary: {...}}.
    Range endpoint is the source of truth — the per-day endpoint /sleep/date/{date}.json
    silently returns empty for many dates that have sleep data (confirmed 2026-04-26).
    Multiple records can exist per date (main sleep + naps); we upsert one row per date
    using aggregated stage minutes and the main_sleep record for start/end times.

    `profile_tz` is required for correct storage of `startTime` / `endTime`: Fitbit
    returns them as naive local strings; without an explicit zone they would be
    silently interpreted as UTC and lose 4–5 hours of accuracy.
    """
    data = fitbit_get(creds, f"/1.2/user/-/sleep/date/{start}/{end}.json")
    sleep_records = data.get("sleep", [])
    if not sleep_records:
        return 0

    # Group by dateOfSleep, aggregating across naps + main sleep.
    by_date: dict[str, dict[str, Any]] = {}
    main_by_date: dict[str, dict[str, Any]] = {}
    for rec in sleep_records:
        d = rec.get("dateOfSleep")
        if not d:
            continue
        bucket = by_date.setdefault(d, {
            "total_minutes_asleep": 0, "total_minutes_in_bed": 0, "total_sleep_records": 0,
            "minutes_deep": 0, "minutes_light": 0, "minutes_rem": 0, "minutes_wake": 0,
            "all_records": [],
        })
        bucket["total_minutes_asleep"] += rec.get("minutesAsleep", 0) or 0
        bucket["total_minutes_in_bed"] += rec.get("timeInBed", 0) or 0
        bucket["total_sleep_records"] += 1
        levels_summary = rec.get("levels", {}).get("summary", {})
        for stage in ("deep", "light", "rem", "wake"):
            stage_data = levels_summary.get(stage)
            if isinstance(stage_data, dict):
                bucket[f"minutes_{stage}"] += stage_data.get("minutes", 0) or 0
        bucket["all_records"].append(rec)
        # Prefer the main sleep record for efficiency / start / end times.
        if rec.get("isMainSleep") or d not in main_by_date:
            main_by_date[d] = rec

    count = 0
    with conn.cursor() as cur:
        for d, bucket in by_date.items():
            main_rec = main_by_date[d]
            cur.execute(
                """
                INSERT INTO universe.fitbit_sleep_daily
                    (date, total_minutes_asleep, total_minutes_in_bed, total_sleep_records,
                     minutes_deep, minutes_light, minutes_rem, minutes_wake, efficiency,
                     main_sleep_start_time, main_sleep_end_time, raw_jsonb)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    total_minutes_asleep = EXCLUDED.total_minutes_asleep,
                    total_minutes_in_bed = EXCLUDED.total_minutes_in_bed,
                    total_sleep_records = EXCLUDED.total_sleep_records,
                    minutes_deep = EXCLUDED.minutes_deep, minutes_light = EXCLUDED.minutes_light,
                    minutes_rem = EXCLUDED.minutes_rem, minutes_wake = EXCLUDED.minutes_wake,
                    efficiency = EXCLUDED.efficiency,
                    main_sleep_start_time = EXCLUDED.main_sleep_start_time,
                    main_sleep_end_time = EXCLUDED.main_sleep_end_time,
                    raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (
                    d,
                    bucket["total_minutes_asleep"] or None,
                    bucket["total_minutes_in_bed"] or None,
                    bucket["total_sleep_records"],
                    bucket["minutes_deep"] or None,
                    bucket["minutes_light"] or None,
                    bucket["minutes_rem"] or None,
                    bucket["minutes_wake"] or None,
                    main_rec.get("efficiency"),
                    parse_fitbit_local_dt(main_rec.get("startTime"), profile_tz),
                    parse_fitbit_local_dt(main_rec.get("endTime"), profile_tz),
                    json.dumps({"sleep": bucket["all_records"]}),
                ),
            )
            count += 1
    conn.commit()
    return count


def fetch_and_upsert_spo2_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    """GET /1/user/-/spo2/date/{start}/{end}.json → array of daily entries."""
    data = fitbit_get(creds, f"/1/user/-/spo2/date/{start}/{end}.json")
    # Response is an array of {dateTime, value: {avg, min, max}}
    entries = data if isinstance(data, list) else []
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            dt = entry.get("dateTime")
            v = entry.get("value", {})
            if not dt or not v:
                continue
            cur.execute(
                """
                INSERT INTO universe.fitbit_spo2_daily (date, avg_value, min_value, max_value, raw_jsonb)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    avg_value = EXCLUDED.avg_value, min_value = EXCLUDED.min_value,
                    max_value = EXCLUDED.max_value, raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (dt, v.get("avg"), v.get("min"), v.get("max"), json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


def fetch_and_upsert_hrv_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    """GET /1/user/-/hrv/date/{start}/{end}.json → {hrv: [{dateTime, value}]}."""
    data = fitbit_get(creds, f"/1/user/-/hrv/date/{start}/{end}.json")
    entries = data.get("hrv", [])
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            dt = entry.get("dateTime")
            v = entry.get("value", {})
            if not dt:
                continue
            cur.execute(
                """
                INSERT INTO universe.fitbit_hrv_daily (date, daily_rmssd, deep_rmssd, raw_jsonb)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    daily_rmssd = EXCLUDED.daily_rmssd, deep_rmssd = EXCLUDED.deep_rmssd,
                    raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (dt, v.get("dailyRmssd"), v.get("deepRmssd"), json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


def fetch_and_upsert_br_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    """GET /1/user/-/br/date/{start}/{end}.json → {br: [{dateTime, value}]}."""
    data = fitbit_get(creds, f"/1/user/-/br/date/{start}/{end}.json")
    entries = data.get("br", [])
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            dt = entry.get("dateTime")
            v = entry.get("value", {})
            if not dt:
                continue
            cur.execute(
                """
                INSERT INTO universe.fitbit_breathing_rate_daily (date, breathing_rate, raw_jsonb)
                VALUES (%s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    breathing_rate = EXCLUDED.breathing_rate,
                    raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (dt, v.get("breathingRate"), json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


def fetch_and_upsert_temp_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    """GET /1/user/-/temp/skin/date/{start}/{end}.json → {tempSkin: [{dateTime, value}]}."""
    data = fitbit_get(creds, f"/1/user/-/temp/skin/date/{start}/{end}.json")
    entries = data.get("tempSkin", [])
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            dt = entry.get("dateTime")
            v = entry.get("value", {})
            if not dt:
                continue
            cur.execute(
                """
                INSERT INTO universe.fitbit_skin_temp_daily (date, nightly_relative, log_type, raw_jsonb)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    nightly_relative = EXCLUDED.nightly_relative, log_type = EXCLUDED.log_type,
                    raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (dt, v.get("nightlyRelative"), entry.get("logType"), json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


def fetch_and_upsert_cardio_range(
    conn: psycopg.Connection, creds: dict, start: str, end: str,
    profile_tz: str = "UTC",  # noqa: ARG001 — accepted for dispatch parity
) -> int:
    """GET /1/user/-/cardioscore/date/{start}/{end}.json → {cardioScore: [{dateTime, value}]}."""
    data = fitbit_get(creds, f"/1/user/-/cardioscore/date/{start}/{end}.json")
    entries = data.get("cardioScore", [])
    count = 0
    with conn.cursor() as cur:
        for entry in entries:
            dt = entry.get("dateTime")
            v = entry.get("value", {})
            if not dt:
                continue
            # vo2Max can be a range like "44-48" or a single number
            vo2 = v.get("vo2Max")
            cur.execute(
                """
                INSERT INTO universe.fitbit_cardio_score_daily (date, vo2_max, raw_jsonb)
                VALUES (%s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    vo2_max = EXCLUDED.vo2_max, raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (dt, str(vo2) if vo2 is not None else None, json.dumps(entry)),
            )
            count += 1
    conn.commit()
    return count


RANGE_FETCHERS = {
    "sleep": fetch_and_upsert_sleep_range,
    "spo2": fetch_and_upsert_spo2_range,
    "hrv": fetch_and_upsert_hrv_range,
    "breathing_rate": fetch_and_upsert_br_range,
    "skin_temp": fetch_and_upsert_temp_range,
    "vo2_max": fetch_and_upsert_cardio_range,
}


# ===========================================================================
# PAGINATED FETCHER (exercise logs)
# ===========================================================================

def fetch_and_upsert_exercise_logs(
    conn: psycopg.Connection, creds: dict, after_date: str, max_pages: int = 3,
) -> tuple[int, Optional[str]]:
    """
    Fetch exercise logs after a given date using the paginated list API.
    Returns (rows_upserted, latest_date_seen).
    """
    count = 0
    latest_date = None
    url_path = f"/1/user/-/activities/list.json?afterDate={after_date}&sort=asc&limit=100&offset=0"

    for _ in range(max_pages):
        data = fitbit_get(creds, url_path)
        activities = data.get("activities", [])
        if not activities:
            break

        with conn.cursor() as cur:
            for act in activities:
                log_id = act.get("logId")
                if not log_id:
                    continue
                # Extract the date from originalStartTime or startTime
                start_time = act.get("originalStartTime") or act.get("startTime")
                act_date = start_time[:10] if start_time else None

                cur.execute(
                    """
                    INSERT INTO universe.fitbit_exercise_log
                        (log_id, date, start_time, activity_name, activity_type_id,
                         log_type, calories, duration_ms, distance, distance_unit,
                         steps, average_heart_rate, elevation_gain,
                         has_active_zone_minutes, raw_jsonb)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (log_id) DO UPDATE SET
                        calories = EXCLUDED.calories, duration_ms = EXCLUDED.duration_ms,
                        distance = EXCLUDED.distance, steps = EXCLUDED.steps,
                        average_heart_rate = EXCLUDED.average_heart_rate,
                        raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                    """,
                    (
                        log_id,
                        act_date,
                        start_time,
                        act.get("activityName", "Unknown"),
                        act.get("activityTypeId"),
                        act.get("logType"),
                        act.get("calories"),
                        act.get("duration"),
                        act.get("distance"),
                        act.get("distanceUnit"),
                        act.get("steps"),
                        act.get("averageHeartRate"),
                        act.get("elevationGain"),
                        act.get("hasActiveZoneMinutes", False),
                        json.dumps(act),
                    ),
                )
                count += 1
                if act_date and (latest_date is None or act_date > latest_date):
                    latest_date = act_date

        conn.commit()

        # Check for next page
        pagination = data.get("pagination", {})
        next_url = pagination.get("next")
        if not next_url:
            break
        # next_url is a full URL; extract the path
        if BASE_URL in next_url:
            url_path = next_url.replace(BASE_URL, "")
        else:
            break

    return count, latest_date


# ===========================================================================
# Main
# ===========================================================================

def main(
    db: Optional[dict[str, Any]] = None,
    db_resource_path: Optional[str] = None,
    fitbit_resource_path: Optional[str] = None,
    # Existing daily types
    ingest_activity: bool = True,
    ingest_sleep: bool = True,
    ingest_heart_rate: bool = True,
    ingest_body_weight: bool = True,
    # New range types
    ingest_spo2: bool = True,
    ingest_hrv: bool = True,
    ingest_breathing_rate: bool = True,
    ingest_skin_temp: bool = True,
    ingest_vo2_max: bool = True,
    # New paginated types
    ingest_exercise_log: bool = True,
    # Config
    backfill_days: Optional[int] = None,
    max_requests_per_run: int = 120,
    # Timezone override — when set, skips the /profile.json round-trip.
    # Useful for testing or when the Fitbit profile TZ is known-stable.
    user_timezone: Optional[str] = None,
) -> dict[str, Any]:
    resolved_db = resolve_db(db, db_resource_path)
    fitbit_path = fitbit_resource_path or DEFAULT_FITBIT_RESOURCE_PATH
    creds = resolve_fitbit_creds(fitbit_path)
    creds = refresh_token_if_needed(creds, fitbit_path)

    # Resolve "today" in the user's Fitbit profile TZ rather than UTC.
    # Fitbit's date-keyed endpoints (activity, sleep, HRV, etc.) bucket by
    # the user's local calendar day — asking for a date in UTC's "today"
    # before it's begun in the user's zone returns a partial / empty day,
    # which the state cursor then skips past on the next run.
    profile_tz = user_timezone or get_profile_timezone(creds)
    if not profile_tz:
        profile_tz = DEFAULT_FALLBACK_TZ
        print(
            f"  [tz] Profile zone unavailable (Fitbit /profile.json typically "
            f"requires the `profile` OAuth scope, which is not granted on this "
            f"token); falling back to {DEFAULT_FALLBACK_TZ}. Override at runtime "
            f"by passing user_timezone=..., or re-authorize Fitbit with profile "
            f"scope to enable auto-detection."
        )
    print(f"  [tz] Using user timezone: {profile_tz}")

    backfill = backfill_days if backfill_days is not None else DEFAULT_BACKFILL_DAYS
    today = today_in_tz(profile_tz)
    backfill_start = today - timedelta(days=backfill)

    # Build enabled map
    enabled_flags = {
        "activity": ingest_activity, "sleep": ingest_sleep,
        "heart_rate": ingest_heart_rate, "body_weight": ingest_body_weight,
        "spo2": ingest_spo2, "hrv": ingest_hrv,
        "breathing_rate": ingest_breathing_rate, "skin_temp": ingest_skin_temp,
        "vo2_max": ingest_vo2_max, "exercise_log": ingest_exercise_log,
    }
    enabled = {k for k, v in enabled_flags.items() if v}

    conn_kwargs = {
        "host": resolved_db["host"],
        "port": int(resolved_db.get("port", 5432)),
        "user": resolved_db["user"],
        "password": resolved_db["password"],
        "dbname": resolved_db["dbname"],
        "sslmode": resolved_db.get("sslmode", "disable"),
    }

    request_count = 0
    total_rows = 0
    error_count = 0
    type_summaries: dict[str, dict[str, Any]] = {}

    with psycopg.connect(**conn_kwargs) as conn:
        ensure_tables(conn)
        run_id = create_ingest_run(conn)
        print(f"Ingest run {run_id} started. Enabled types: {sorted(enabled)}")

        # Detect Fitbit profile-TZ drift across runs. If the user's profile
        # TZ changes (travel, manual edit), calendar buckets won't be
        # consistent with previously-ingested days — flag it so the operator
        # can decide whether to re-backfill the boundary window.
        previous_tz = get_last_profile_tz(conn)
        if previous_tz and previous_tz != profile_tz:
            print(
                f"  [tz] WARNING: profile TZ changed from {previous_tz} to "
                f"{profile_tz}. Calendar buckets may be inconsistent across "
                f"the boundary; consider re-backfilling the affected days."
            )

        # One-time correction of historical sleep timestamps. Earlier ingest
        # runs wrote naive Fitbit timestamps into TIMESTAMPTZ columns, which
        # silently labels them as UTC and drops 4–5 hours of accuracy. This
        # is a no-op after the first successful run for a given profile_tz.
        sleep_backfill_count = backfill_sleep_timestamps_once(conn, profile_tz)
        if sleep_backfill_count:
            print(
                f"  [tz] Re-stamped {sleep_backfill_count} historical sleep "
                f"rows into {profile_tz}."
            )

        # =============================================================
        # PHASE 1: Range-based types (cheap — ~1 request per 30 days)
        # =============================================================
        for data_type in RANGE_TYPES:
            if data_type not in enabled:
                continue
            if request_count >= max_requests_per_run:
                break

            state = get_state(conn, data_type)
            if state and state["latest_fetched_date"]:
                state_start = state["latest_fetched_date"] + timedelta(days=1)
            else:
                state_start = backfill_start
            # Always re-fetch the rolling recheck window so late-arriving data
            # (Fitbit publishes some derived metrics 1+ days after the date)
            # gets picked up. Upserts are idempotent via ON CONFLICT.
            recheck_start = today - timedelta(days=RECHECK_DAYS)
            range_start = min(state_start, recheck_start)

            if range_start > today:
                print(f"[{data_type}] Already up to date.")
                continue

            # Fetch in 30-day chunks
            rows = 0
            errors = 0
            chunk_start = range_start

            while chunk_start <= today and request_count < max_requests_per_run:
                chunk_end = min(chunk_start + timedelta(days=MAX_RANGE_DAYS - 1), today)
                start_str = chunk_start.isoformat()
                end_str = chunk_end.isoformat()
                print(f"[{data_type}] Fetching range {start_str} to {end_str}")

                try:
                    fetched = RANGE_FETCHERS[data_type](
                        conn, creds, start_str, end_str, profile_tz=profile_tz,
                    )
                    rows += fetched
                    total_rows += fetched
                    request_count += 1
                    update_state(
                        conn, data_type,
                        latest_date=end_str,
                        earliest_date=range_start.isoformat(),
                        backfill_complete=(chunk_end >= today),
                        run_id=run_id,
                        profile_tz=profile_tz,
                    )
                    chunk_start = chunk_end + timedelta(days=1)
                except RateLimitError:
                    print(f"  [{data_type}] Rate limited. Stopping.")
                    errors += 1
                    error_count += 1
                    break
                except requests.HTTPError as e:
                    # Note: Response.__bool__() is False for 4xx/5xx, so use `is not None`
                    status_code = e.response.status_code if e.response is not None else 0
                    print(f"  [{data_type}] HTTP {status_code} error: {e}")
                    errors += 1
                    error_count += 1
                    request_count += 1
                    # Some endpoints return 400 if the device doesn't support it
                    # or the scope isn't authorized — skip this type entirely
                    if status_code in (400, 401, 403):
                        print(f"  [{data_type}] Skipping (unsupported or unauthorized).")
                        break
                    chunk_start = chunk_end + timedelta(days=1)

            type_summaries[data_type] = {
                "rows": rows, "errors": errors,
                "range": f"{range_start} to {min(chunk_start - timedelta(days=1), today)}",
            }
            print(f"  [{data_type}] {rows} rows, {errors} errors")

        # =============================================================
        # PHASE 2: Exercise logs (paginated, ~1-3 requests)
        # =============================================================
        if "exercise_log" in enabled and request_count < max_requests_per_run:
            state = get_state(conn, "exercise_log")
            if state and state["latest_fetched_date"]:
                state_after = state["latest_fetched_date"]
            else:
                state_after = backfill_start
            # Roll back into the recheck window so late-synced workouts show up.
            recheck_after = today - timedelta(days=RECHECK_DAYS)
            after_date = min(state_after, recheck_after).isoformat()

            print(f"[exercise_log] Fetching logs after {after_date}")
            try:
                max_pages = min(3, max_requests_per_run - request_count)
                rows, latest = fetch_and_upsert_exercise_logs(
                    conn, creds, after_date, max_pages=max_pages,
                )
                total_rows += rows
                request_count += min(max_pages, max(1, (rows + 99) // 100))
                if latest:
                    update_state(
                        conn, "exercise_log",
                        latest_date=latest,
                        earliest_date=after_date,
                        backfill_complete=False,  # hard to know without checking
                        run_id=run_id,
                        profile_tz=profile_tz,
                    )
                type_summaries["exercise_log"] = {
                    "rows": rows, "errors": 0,
                    "range": f"{after_date} to {latest or after_date}",
                }
                print(f"  [exercise_log] {rows} exercises fetched")
            except RateLimitError:
                print("  [exercise_log] Rate limited.")
                error_count += 1
                type_summaries["exercise_log"] = {"rows": 0, "errors": 1, "range": after_date}
            except requests.HTTPError as e:
                print(f"  [exercise_log] HTTP error: {e}")
                error_count += 1
                type_summaries["exercise_log"] = {"rows": 0, "errors": 1, "range": after_date}

        # =============================================================
        # PHASE 3: Daily types (1 request/day, round-robin — existing)
        # =============================================================
        type_cursors: dict[str, dict[str, Any]] = {}
        active_types: list[str] = []

        for data_type in DAILY_TYPES:
            if data_type not in enabled:
                continue
            state = get_state(conn, data_type)
            if state and state["latest_fetched_date"]:
                state_start = state["latest_fetched_date"] + timedelta(days=1)
            else:
                state_start = backfill_start
            # Always re-attempt the rolling recheck window for late-arriving data.
            recheck_start = today - timedelta(days=RECHECK_DAYS)
            start_date = min(state_start, recheck_start)
            if start_date > today:
                print(f"[{data_type}] Already up to date.")
                continue
            type_cursors[data_type] = {
                "start": start_date, "current": start_date,
                "earliest": start_date, "rows": 0, "errors": 0,
            }
            active_types.append(data_type)
            print(f"[{data_type}] Will fetch from {start_date} to {today}")

        # Round-robin daily types
        while active_types and request_count < max_requests_per_run:
            next_active = []
            for data_type in active_types:
                if request_count >= max_requests_per_run:
                    next_active.append(data_type)
                    continue
                tc = type_cursors[data_type]
                if tc["current"] > today:
                    continue
                date_str = tc["current"].isoformat()
                try:
                    rows = DAILY_FETCHERS[data_type](
                        conn, creds, date_str, today=today, profile_tz=profile_tz,
                    )
                    tc["rows"] += rows
                    total_rows += rows
                    request_count += 1
                    update_state(
                        conn, data_type,
                        latest_date=date_str,
                        earliest_date=tc["earliest"].isoformat(),
                        backfill_complete=(tc["current"] >= today),
                        run_id=run_id,
                        profile_tz=profile_tz,
                    )
                    tc["current"] += timedelta(days=1)
                    if tc["current"] <= today:
                        next_active.append(data_type)
                except RateLimitError:
                    print(f"  [{data_type}] Rate limited on {date_str}. Stopping.")
                    tc["errors"] += 1
                    error_count += 1
                except requests.HTTPError as e:
                    print(f"  [{data_type}] HTTP error on {date_str}: {e}")
                    tc["errors"] += 1
                    error_count += 1
                    request_count += 1
                    tc["current"] += timedelta(days=1)
                    if tc["current"] <= today:
                        next_active.append(data_type)
            active_types = next_active

        # Build daily type summaries
        for data_type, tc in type_cursors.items():
            last_fetched = min(tc["current"] - timedelta(days=1), today)
            type_summaries[data_type] = {
                "rows": tc["rows"], "errors": tc["errors"],
                "range": f"{tc['start']} to {last_fetched}",
            }
            print(f"  [{data_type}] {tc['rows']} rows, {tc['errors']} errors")

        # =============================================================
        # Finalize
        # =============================================================
        status = "completed" if error_count == 0 else "partial"
        if request_count >= max_requests_per_run:
            status = "partial"

        update_ingest_run(conn, run_id, status, total_rows, error_count, type_summaries)

        with conn.cursor() as cur:
            cur.execute(
                "SELECT data_type, latest_fetched_date, backfill_complete "
                "FROM universe.fitbit_ingest_state"
            )
            state_rows = cur.fetchall()

    return {
        "database": resolved_db.get("dbname"),
        "run_id": run_id,
        "status": status,
        "profile_tz": profile_tz,
        "today_in_profile_tz": today.isoformat(),
        "requests_used": request_count,
        "total_rows_upserted": total_rows,
        "error_count": error_count,
        "types": type_summaries,
        "state": {
            r[0]: {"latest": str(r[1]), "backfill_complete": r[2]}
            for r in state_rows
        },
    }
