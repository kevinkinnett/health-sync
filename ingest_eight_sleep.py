"""
Ingest Eight Sleep nightly data into universe.eight_sleep_session.

Eight Sleep has no official API; this uses the same community-reverse-
engineered OAuth2 endpoints the Home Assistant integration uses
(auth-api / client-api.8slp.net).

KEY DESIGN — token caching:
  Eight Sleep rate-limits repeated *logins* (429), not data reads (HA
  polls every 5 min all day). So we cache the OAuth token in a Windmill
  secret variable and only re-auth when it's near expiry (refresh grant,
  falling back to a password login). That lets us poll several times an
  hour without tripping the limit.

CREDENTIALS (you provide these in Windmill; this script never embeds them):
  - u/kevin/eight_sleep_email     (variable)      login email
  - u/kevin/eight_sleep_password  (SECRET var)    login password
  - u/kevin/eight_sleep_token     (SECRET var)    cached token, script-managed

STORAGE: one row per (night, side) in universe.eight_sleep_session, with
every nightly metric we surface PLUS the full day object in raw_jsonb so
we can extract more later without re-backfilling. Upsert is idempotent
(ON CONFLICT), so running often is safe — re-pulls also capture Eight
Sleep's post-processing score revisions.

CADENCE: first run (no state) backfills ~400 days; later runs only re-pull
a short rolling window (recent_days) to catch the latest night + revisions.
"""

import json
import time
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any, Optional
from zoneinfo import ZoneInfo

import psycopg
import requests
import wmill

from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROVIDER = "eight_sleep"
JOB_NAME = "eight_sleep_ingest"
DEFAULT_DB_RESOURCE_PATH = "u/kevin/universe_db"
EMAIL_VAR = "u/kevin/eight_sleep_email"
PASSWORD_VAR = "u/kevin/eight_sleep_password"
TOKEN_VAR = "u/kevin/eight_sleep_token"

AUTH_URL = "https://auth-api.8slp.net/v1/tokens"
CLIENT_API = "https://client-api.8slp.net/v1"
# Bundled app client credentials (public, from the maintained pyEight lib).
CLIENT_ID = "0894c7f33bb94800a03f1f4df13a4f38"
CLIENT_SECRET = "f0954a3ed5763ba3d06834c73731a32f15f168f47d4f164751275def86db0c76"
BASE_HEADERS = {"user-agent": "okhttp/4.9.3", "accept": "application/json"}

TOKEN_BUFFER_SECONDS = 300  # refresh when within 5 min of expiry
DEFAULT_TZ = "America/New_York"
DEFAULT_RECENT_DAYS = 7      # rolling re-pull window for scheduled runs
FIRST_RUN_BACKFILL_DAYS = 400
TRENDS_CHUNK_DAYS = 60       # max span per trends request (defensive)


# ---------------------------------------------------------------------------
# Token management (cached in a Windmill secret variable)
# ---------------------------------------------------------------------------

def _store_token(tok: dict[str, Any]) -> dict[str, Any]:
    cached = {
        "access_token": tok["access_token"],
        "refresh_token": tok.get("refresh_token"),
        "expires_at": int(time.time()) + int(tok.get("expires_in", 3600)),
        "user_id": tok.get("userId") or tok.get("user_id"),
    }
    wmill.set_variable(TOKEN_VAR, json.dumps(cached))
    return cached


def _post_token(payload: dict[str, str]) -> dict[str, Any]:
    # Token endpoint accepts JSON; fall back to form-encoded just in case.
    r = requests.post(AUTH_URL, json=payload, headers=BASE_HEADERS, timeout=30)
    if r.status_code >= 400:
        r = requests.post(AUTH_URL, data=payload, headers=BASE_HEADERS, timeout=30)
    r.raise_for_status()
    return _store_token(r.json())


def _login(email: str, password: str) -> dict[str, Any]:
    print("Eight Sleep: password login")
    return _post_token({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "password",
        "username": email,
        "password": password,
    })


def _refresh(refresh_token: str) -> dict[str, Any]:
    print("Eight Sleep: refreshing token")
    return _post_token({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    })


def get_cached_token(email: str, password: str) -> dict[str, Any]:
    """Reuse the cached token; refresh/login only when expired or absent."""
    raw = ""
    try:
        raw = wmill.get_variable(TOKEN_VAR) or ""
    except Exception:  # noqa: BLE001 - variable may not exist yet
        raw = ""
    cached = None
    if raw:
        try:
            cached = json.loads(raw)
        except Exception:  # noqa: BLE001
            cached = None

    if (
        cached
        and cached.get("access_token")
        and cached.get("expires_at", 0) > time.time() + TOKEN_BUFFER_SECONDS
    ):
        return cached  # still valid — no login, no 429 risk

    if cached and cached.get("refresh_token"):
        try:
            return _refresh(cached["refresh_token"])
        except Exception as exc:  # noqa: BLE001 - fall back to password login
            print(f"  refresh failed ({exc}); falling back to password login")
    return _login(email, password)


class EightClient:
    """Thin authenticated client with one transparent re-login on 401."""

    def __init__(self, email: str, password: str):
        self._email = email
        self._password = password
        self.token = get_cached_token(email, password)

    @property
    def user_id(self) -> Optional[str]:
        return self.token.get("user_id")

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        for attempt in range(2):
            headers = {**BASE_HEADERS, "authorization": f"Bearer {self.token['access_token']}"}
            r = requests.get(f"{CLIENT_API}{path}", headers=headers, params=params, timeout=60)
            if r.status_code == 401 and attempt == 0:
                self.token = _login(self._email, self._password)
                continue
            if r.status_code == 429:
                raise RuntimeError("Eight Sleep rate limited (429) — back off and retry later")
            r.raise_for_status()
            return r.json()
        raise RuntimeError("Eight Sleep auth retry exhausted")


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_dt(s: Optional[str], tz_name: str) -> Optional[datetime]:
    """Parse an ISO timestamp; stamp naive values with the device tz."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip()
    if not s:
        return None
    has_offset = s.endswith("Z") or (len(s) >= 6 and s[-6] in "+-" and s[-3] == ":")
    try:
        if has_offset:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        if "." in s:
            s = s.split(".", 1)[0]
        naive = datetime.fromisoformat(s)
    except ValueError:
        return None
    try:
        zi = ZoneInfo(tz_name)
    except Exception:  # noqa: BLE001
        zi = timezone.utc
    return naive.replace(tzinfo=zi)


def _numeric_values(series: Any) -> list[float]:
    """Flatten an Eight Sleep timeseries (list of scalars or [ts, value])."""
    out: list[float] = []
    if isinstance(series, list):
        for e in series:
            v = e[-1] if isinstance(e, (list, tuple)) and e else e
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                out.append(float(v))
    return out


def agg_mean(ts: dict, *keys: str) -> Optional[float]:
    for k in keys:
        vals = _numeric_values(ts.get(k)) if isinstance(ts, dict) else []
        if vals:
            return mean(vals)
    return None


def agg_minmax(ts: dict, key: str) -> tuple[Optional[float], Optional[float]]:
    vals = _numeric_values(ts.get(key)) if isinstance(ts, dict) else []
    if not vals:
        return (None, None)
    return (min(vals), max(vals))


def _int(v: Any) -> Optional[int]:
    return int(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


# ---------------------------------------------------------------------------
# DDL
# ---------------------------------------------------------------------------

def ensure_tables(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.eight_sleep_session (
                date                    DATE NOT NULL,
                side                    TEXT NOT NULL DEFAULT 'main',
                session_id              TEXT,
                sleep_start             TIMESTAMPTZ,
                sleep_end               TIMESTAMPTZ,
                presence_start          TIMESTAMPTZ,
                presence_end            TIMESTAMPTZ,
                sleep_duration_sec      INTEGER,
                presence_duration_sec   INTEGER,
                deep_duration_sec       INTEGER,
                light_duration_sec      INTEGER,
                rem_duration_sec        INTEGER,
                deep_percent            NUMERIC(5,2),
                rem_percent             NUMERIC(5,2),
                light_percent           NUMERIC(5,2),
                tnt                     INTEGER,
                score                   INTEGER,
                sleep_quality_score     INTEGER,
                sleep_routine_score     INTEGER,
                avg_heart_rate          NUMERIC(6,2),
                min_heart_rate          NUMERIC(6,2),
                max_heart_rate          NUMERIC(6,2),
                avg_hrv_rmssd           NUMERIC(8,3),
                avg_respiratory_rate    NUMERIC(6,3),
                avg_bed_temp_c          NUMERIC(6,3),
                avg_room_temp_c         NUMERIC(6,3),
                snore_duration_sec      INTEGER,
                raw_jsonb               JSONB NOT NULL,
                fetched_at              TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (date, side)
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS ix_eight_sleep_session_date
                ON universe.eight_sleep_session (date DESC)
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.eight_sleep_ingest_state (
                data_type               TEXT PRIMARY KEY,
                latest_session_date     DATE,
                earliest_session_date   DATE,
                last_success_at_utc     TIMESTAMPTZ,
                last_run_id             BIGINT,
                updated_at_utc          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                details                 JSONB
            )
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# State tracking (run lifecycle lives in u/kevin/ingest_common)
# ---------------------------------------------------------------------------

def get_state(conn: psycopg.Connection) -> Optional[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT latest_session_date, earliest_session_date "
            "FROM universe.eight_sleep_ingest_state WHERE data_type = 'session'"
        )
        row = cur.fetchone()
    if not row:
        return None
    return {"latest_session_date": row[0], "earliest_session_date": row[1]}


def update_state(conn, latest, earliest, run_id) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.eight_sleep_ingest_state
                (data_type, latest_session_date, earliest_session_date,
                 last_success_at_utc, last_run_id, updated_at_utc)
            VALUES ('session', %s, %s, NOW(), %s, NOW())
            ON CONFLICT (data_type) DO UPDATE SET
                latest_session_date = GREATEST(
                    universe.eight_sleep_ingest_state.latest_session_date,
                    EXCLUDED.latest_session_date),
                earliest_session_date = LEAST(
                    universe.eight_sleep_ingest_state.earliest_session_date,
                    EXCLUDED.earliest_session_date),
                last_success_at_utc = NOW(), last_run_id = EXCLUDED.last_run_id,
                updated_at_utc = NOW()
            """,
            (latest, earliest, run_id),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Fetch + upsert
# ---------------------------------------------------------------------------

def fetch_trends(client: EightClient, uid: str, tz_name: str, start: str, end: str) -> list:
    data = client.get(
        f"/users/{uid}/trends",
        params={
            "tz": tz_name,
            "from": start,
            "to": end,
            "include-main": "false",
            "include-all-sessions": "true",
            "model-version": "v2",
        },
    )
    return data.get("days", []) if isinstance(data, dict) else []


def upsert_day(conn: psycopg.Connection, day: dict, tz_name: str, side: str = "main") -> int:
    d = day.get("day")
    if not d:
        return 0
    sessions = day.get("sessions") or []
    sess = sessions[-1] if sessions else {}
    ts = sess.get("timeseries") or {}

    hr_min, hr_max = agg_minmax(ts, "heartRate")
    routine = day.get("sleepRoutineScore")
    routine_total = (
        routine.get("total") if isinstance(routine, dict)
        else (routine if isinstance(routine, int) else None)
    )

    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.eight_sleep_session (
                date, side, session_id, sleep_start, sleep_end,
                presence_start, presence_end, sleep_duration_sec,
                presence_duration_sec, deep_duration_sec, light_duration_sec,
                rem_duration_sec, deep_percent, rem_percent, light_percent,
                tnt, score, sleep_quality_score, sleep_routine_score,
                avg_heart_rate, min_heart_rate, max_heart_rate, avg_hrv_rmssd,
                avg_respiratory_rate, avg_bed_temp_c, avg_room_temp_c,
                snore_duration_sec, raw_jsonb
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            ON CONFLICT (date, side) DO UPDATE SET
                session_id = EXCLUDED.session_id,
                sleep_start = EXCLUDED.sleep_start, sleep_end = EXCLUDED.sleep_end,
                presence_start = EXCLUDED.presence_start, presence_end = EXCLUDED.presence_end,
                sleep_duration_sec = EXCLUDED.sleep_duration_sec,
                presence_duration_sec = EXCLUDED.presence_duration_sec,
                deep_duration_sec = EXCLUDED.deep_duration_sec,
                light_duration_sec = EXCLUDED.light_duration_sec,
                rem_duration_sec = EXCLUDED.rem_duration_sec,
                deep_percent = EXCLUDED.deep_percent, rem_percent = EXCLUDED.rem_percent,
                light_percent = EXCLUDED.light_percent, tnt = EXCLUDED.tnt,
                score = EXCLUDED.score, sleep_quality_score = EXCLUDED.sleep_quality_score,
                sleep_routine_score = EXCLUDED.sleep_routine_score,
                avg_heart_rate = EXCLUDED.avg_heart_rate,
                min_heart_rate = EXCLUDED.min_heart_rate,
                max_heart_rate = EXCLUDED.max_heart_rate,
                avg_hrv_rmssd = EXCLUDED.avg_hrv_rmssd,
                avg_respiratory_rate = EXCLUDED.avg_respiratory_rate,
                avg_bed_temp_c = EXCLUDED.avg_bed_temp_c,
                avg_room_temp_c = EXCLUDED.avg_room_temp_c,
                snore_duration_sec = EXCLUDED.snore_duration_sec,
                raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
            """,
            (
                d, side, day.get("mainSessionId"),
                parse_dt(day.get("sleepStart"), tz_name),
                parse_dt(day.get("sleepEnd"), tz_name),
                parse_dt(day.get("presenceStart"), tz_name),
                parse_dt(day.get("presenceEnd"), tz_name),
                _int(day.get("sleepDuration")), _int(day.get("presenceDuration")),
                _int(day.get("deepDuration")), _int(day.get("lightDuration")),
                _int(day.get("remDuration")),
                day.get("deepPercent"), day.get("remPercent"), day.get("lightPercent"),
                _int(day.get("tnt")), _int(day.get("score")),
                _int(day.get("sleepQualityScore")), _int(routine_total),
                agg_mean(ts, "heartRate"), hr_min, hr_max,
                agg_mean(ts, "rmssd"),
                agg_mean(ts, "respiratoryRate", "nemeanRespiratoryRateNightly", "nemeanRespiratoryRate"),
                agg_mean(ts, "tempBedC"), agg_mean(ts, "tempRoomC"),
                _int(day.get("snoreDuration")),
                json.dumps(day),
            ),
        )
    conn.commit()
    return 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    db: Optional[dict[str, Any]] = None,
    db_resource_path: Optional[str] = None,
    recent_days: int = DEFAULT_RECENT_DAYS,
    backfill_days: int = 0,
    user_timezone: str = DEFAULT_TZ,
) -> dict[str, Any]:
    # Windmill can invoke main() with None for any unset optional param
    # (it does in previews) — requests drops None params silently, and a
    # tz-less trends call 400s. Re-apply defaults defensively.
    recent_days = recent_days if recent_days is not None else DEFAULT_RECENT_DAYS
    backfill_days = backfill_days or 0
    user_timezone = user_timezone or DEFAULT_TZ

    resolved_db = db if db is not None else wmill.get_resource(
        db_resource_path or DEFAULT_DB_RESOURCE_PATH
    )
    email = wmill.get_variable(EMAIL_VAR)
    password = wmill.get_variable(PASSWORD_VAR)
    if not email or not password:
        return {"error": "Missing eight_sleep_email or eight_sleep_password variable."}

    client = EightClient(email, password)
    me = client.get("/users/me")
    u = me.get("user", me)
    uid = client.user_id or u.get("userId") or u.get("id")
    if not uid:
        return {"error": "Could not resolve Eight Sleep user id."}

    today = datetime.now(timezone.utc).date()
    rows = 0
    errors = 0
    day_dates: list[str] = []

    with psycopg.connect(**conn_kwargs(resolved_db)) as conn:
        ensure_tables(conn)
        state = get_state(conn)

        if backfill_days and backfill_days > 0:
            days_back = backfill_days
        elif state is None or state.get("latest_session_date") is None:
            days_back = FIRST_RUN_BACKFILL_DAYS  # first run: grab all history
        else:
            days_back = recent_days  # incremental + rolling recheck
        start_date = today - timedelta(days=days_back)
        print(f"Eight Sleep ingest: {start_date} → {today} (days_back={days_back}) user={uid}")

        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)

        chunk_start = start_date
        while chunk_start <= today:
            chunk_end = min(chunk_start + timedelta(days=TRENDS_CHUNK_DAYS - 1), today)
            try:
                days = fetch_trends(
                    client, uid, user_timezone,
                    chunk_start.isoformat(), chunk_end.isoformat(),
                )
                for day in days:
                    try:
                        rows += upsert_day(conn, day, user_timezone)
                        if day.get("day"):
                            day_dates.append(day["day"])
                    except Exception as exc:  # noqa: BLE001
                        errors += 1
                        print(f"  upsert {day.get('day')} failed: {exc}")
            except Exception as exc:  # noqa: BLE001
                errors += 1
                print(f"  trends {chunk_start}..{chunk_end} failed: {exc}")
            chunk_start = chunk_end + timedelta(days=1)

        latest = max(day_dates) if day_dates else None
        earliest = min(day_dates) if day_dates else None
        if latest:
            update_state(conn, latest, earliest, run_id)
        status = "completed" if errors == 0 else "partial"
        update_ingest_run(
            conn, run_id, status, rows, errors,
            {"days": len(set(day_dates)), "latest": latest, "earliest": earliest},
        )

    return {
        "status": status,
        "rows_upserted": rows,
        "distinct_nights": len(set(day_dates)),
        "latest_session": latest,
        "earliest_session": earliest,
        "errors": errors,
        "days_back": days_back,
    }
