"""
Ingest Fitbit cardio-fitness (VO2 max) into universe.fitbit_cardio_score_daily.

WHY THIS EXISTS: the 2026-06-12 cutover moved every other metric to the
Google Health API, but Google exposes no VO2 max for this account —
`daily-vo2-max`, `vo2-max` and `run-vo2-max` all return empty for 2025-2026
across every data-source family and through both the list and rollup
endpoints (probed 2026-10-25). The legacy Fitbit Web API still serves the
Fitbit app's daily cardio-fitness range, so this one metric keeps coming
from there. When Google starts returning `daily-vo2-max`, or the Fitbit Web
API is finally switched off, retire this script: health_data_invariants.py
flags the column as stale within two days of the last write.

CREDENTIALS: u/kevin/fitbit_oauth (resource; client_id, client_secret,
access_token, refresh_token, expires_at). Fitbit refresh tokens are
SINGLE-USE: the rotated token is written back immediately after a refresh,
before anything else can fail.

STORAGE: one row per day; vo2_max is Fitbit's string as served — usually a
range such as "43-47", occasionally a single number. raw_jsonb keeps the
entry plus a `_src` marker. The upsert is idempotent, so the rolling
re-pull also picks up Fitbit's late revisions.
"""

import base64
import json
import time
from datetime import date, timedelta
from typing import Any, Optional

import psycopg
import requests
import wmill

from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

PROVIDER = "fitbit_web_api"
JOB_NAME = "fitbit_cardio_ingest"
DEFAULT_OAUTH_RES = "u/kevin/fitbit_oauth"
DEFAULT_DB_RES = "u/kevin/universe_db"
TOKEN_URL = "https://api.fitbit.com/oauth2/token"
API = "https://api.fitbit.com"
SOURCE_MARK = "fitbit_web_api"

DEFAULT_RECENT_DAYS = 14
# The cardioscore range endpoint accepts at most 30 days per request.
MAX_SPAN_DAYS = 30
USER_TZ = "America/New_York"


def date_chunks(start: date, end: date, max_days: int = MAX_SPAN_DAYS) -> list[tuple[date, date]]:
    """Split the closed range [start, end] into closed spans of <= max_days."""
    spans = []
    s = start
    while s <= end:
        e = min(s + timedelta(days=max_days - 1), end)
        spans.append((s, e))
        s = e + timedelta(days=1)
    return spans


def parse_cardio(entries: list[dict[str, Any]]) -> list[tuple[str, Optional[str], str]]:
    """{cardioScore: [{dateTime, value: {vo2Max}}]} entries -> upsert rows.

    Entries without a date are skipped. A missing vo2Max is stored as NULL
    rather than dropped, matching the legacy ingest.
    """
    rows = []
    for entry in entries:
        day = entry.get("dateTime")
        if not day:
            continue
        vo2 = (entry.get("value") or {}).get("vo2Max")
        raw = {**entry, "_src": SOURCE_MARK}
        rows.append((day, str(vo2) if vo2 is not None else None, json.dumps(raw)))
    return rows


def fitbit_creds(res_path: str, session=requests) -> dict[str, Any]:
    """Return creds with a live access token, refreshing (and saving) if needed."""
    creds = wmill.get_resource(res_path)
    if time.time() < creds.get("expires_at", 0) - 300:
        return creds
    basic = base64.b64encode(f"{creds['client_id']}:{creds['client_secret']}".encode()).decode()
    resp = session.post(
        TOKEN_URL,
        headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "refresh_token", "refresh_token": creds["refresh_token"],
              "client_id": creds["client_id"]},
        timeout=30,
    )
    resp.raise_for_status()
    token = resp.json()
    creds["access_token"] = token["access_token"]
    creds["refresh_token"] = token["refresh_token"]
    creds["expires_at"] = int(time.time()) + int(token.get("expires_in", 28800))
    # Single-use refresh token: persist before any other call can fail.
    wmill.set_resource(res_path, creds, resource_type="any")
    return creds


def fetch_span(creds: dict[str, Any], start: date, end: date, session=requests) -> list[dict[str, Any]]:
    resp = session.get(
        f"{API}/1/user/-/cardioscore/date/{start.isoformat()}/{end.isoformat()}.json",
        headers={"Authorization": f"Bearer {creds['access_token']}"},
        timeout=30,
    )
    if resp.status_code == 429:
        raise RuntimeError(f"rate limited (Retry-After {resp.headers.get('Retry-After', '?')}s)")
    resp.raise_for_status()
    return resp.json().get("cardioScore", [])


def upsert_rows(conn, rows) -> int:
    with conn.cursor() as cur:
        for day, vo2, raw in rows:
            cur.execute(
                """
                INSERT INTO universe.fitbit_cardio_score_daily (date, vo2_max, raw_jsonb)
                VALUES (%s, %s, %s)
                ON CONFLICT (date) DO UPDATE SET
                    vo2_max = EXCLUDED.vo2_max, raw_jsonb = EXCLUDED.raw_jsonb, fetched_at = NOW()
                """,
                (day, vo2, raw),
            )
    conn.commit()
    return len(rows)


def local_today(tz: str = USER_TZ) -> date:
    from datetime import datetime
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo(tz)).date()


def main(
    backfill_from: Optional[str] = None,
    recent_days: int = DEFAULT_RECENT_DAYS,
    oauth_resource_path: str = DEFAULT_OAUTH_RES,
    db_resource_path: str = DEFAULT_DB_RES,
):
    # Windmill passes None for unset optional params; re-apply defaults.
    recent_days = recent_days or DEFAULT_RECENT_DAYS
    oauth_resource_path = oauth_resource_path or DEFAULT_OAUTH_RES
    db_resource_path = db_resource_path or DEFAULT_DB_RES

    today = local_today()
    start = date.fromisoformat(backfill_from) if backfill_from else today - timedelta(days=recent_days)
    spans = date_chunks(start, today)

    with psycopg.connect(**conn_kwargs(wmill.get_resource(db_resource_path))) as conn:
        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)
        written, errors, latest = 0, [], None
        try:
            creds = fitbit_creds(oauth_resource_path)
            for s, e in spans:
                try:
                    rows = parse_cardio(fetch_span(creds, s, e))
                    written += upsert_rows(conn, rows)
                    dated = [r[0] for r in rows if r[1] is not None]
                    if dated:
                        latest = max([latest, *dated]) if latest else max(dated)
                except Exception as exc:  # noqa: BLE001 - record per span, keep going
                    conn.rollback()
                    errors.append(f"{s}..{e}: {str(exc)[:160]}")
        except Exception as exc:  # noqa: BLE001 - token failure fails the run
            errors.append(f"auth: {str(exc)[:160]}")
            spans = []

        status = "failed" if errors and not written else ("partial" if errors else "completed")
        details = {"start": start.isoformat(), "end": today.isoformat(), "spans": len(spans),
                   "latest_value_date": latest, "errors": errors}
        update_ingest_run(conn, run_id, status, written, len(errors), details)

    summary = {"status": status, "rows_written": written, **details}
    print(summary)
    if status == "failed":
        raise RuntimeError(f"fitbit cardio ingest failed: {errors[:3]}")
    return summary
