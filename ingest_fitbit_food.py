"""
Ingest Fitbit food / calorie-intake logs into universe.fitbit_food_log_daily.

Standalone (does NOT touch the main ingest_fitbit job) so it can be
enabled independently and never risks the every-4-hours pipeline.

Reuses the same Windmill resources as ingest_fitbit:
  - u/kevin/universe_db   (Postgres)
  - u/kevin/fitbit_oauth  (OAuth creds + token; auto-refreshed)

REQUIRES THE `nutrition` OAUTH SCOPE, which the current token does not
have. Until you re-authorize Fitbit granting `nutrition`, the food
endpoint returns 401 and this job exits cleanly with a message — it does
no harm in the meantime. Once re-authorized (the new token lands in the
fitbit_oauth resource), food data starts flowing on the next run.

Endpoint: GET /1/user/-/foods/log/date/{date}.json  → daily summary
(calories in, carbs, fat, fiber, protein, sodium, water) + goal + the
per-food entries (kept in raw_jsonb). AI-photo-logged meals land here too.
"""

import base64
import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import psycopg
import requests
import wmill

from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

PROVIDER = "fitbit"
JOB_NAME = "fitbit_food_ingest"
DEFAULT_DB_RESOURCE_PATH = "u/kevin/universe_db"
DEFAULT_FITBIT_RESOURCE_PATH = "u/kevin/fitbit_oauth"
BASE_URL = "https://api.fitbit.com"
TOKEN_URL = "https://api.fitbit.com/oauth2/token"
DEFAULT_RECENT_DAYS = 14
RATE_LIMIT_PAUSE = 1.0


def refresh_token_if_needed(creds: dict[str, Any], resource_path: str) -> dict[str, Any]:
    """Auto-refresh the shared Fitbit OAuth token if expiring within 5 min."""
    if time.time() < creds.get("expires_at", 0) - 300:
        return creds
    print("Refreshing Fitbit token...")
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
    tok = resp.json()
    creds["access_token"] = tok["access_token"]
    creds["refresh_token"] = tok["refresh_token"]
    creds["expires_at"] = int(time.time()) + tok.get("expires_in", 28800)
    wmill.set_resource(resource_path, creds, resource_type="any")
    print("Token refreshed.")
    return creds


def ensure_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.fitbit_food_log_daily (
                date            DATE PRIMARY KEY,
                calories_in     INTEGER,
                carbs           NUMERIC(8,2),
                fat             NUMERIC(8,2),
                fiber           NUMERIC(8,2),
                protein         NUMERIC(8,2),
                sodium          NUMERIC(8,2),
                water           NUMERIC(10,2),
                calorie_goal    INTEGER,
                food_count      INTEGER,
                raw_jsonb       JSONB NOT NULL,
                fetched_at      TIMESTAMPTZ DEFAULT NOW()
            )
        """)
    conn.commit()


def upsert_food(conn: psycopg.Connection, date_str: str, data: dict) -> int:
    foods = data.get("foods", []) or []
    summary = data.get("summary", {}) or {}
    goals = data.get("goals", {}) or {}
    # Skip days with nothing logged — keeps the table to real intake days.
    if not foods and not summary.get("calories"):
        return 0
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.fitbit_food_log_daily
                (date, calories_in, carbs, fat, fiber, protein, sodium, water,
                 calorie_goal, food_count, raw_jsonb)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (date) DO UPDATE SET
                calories_in=EXCLUDED.calories_in, carbs=EXCLUDED.carbs,
                fat=EXCLUDED.fat, fiber=EXCLUDED.fiber, protein=EXCLUDED.protein,
                sodium=EXCLUDED.sodium, water=EXCLUDED.water,
                calorie_goal=EXCLUDED.calorie_goal, food_count=EXCLUDED.food_count,
                raw_jsonb=EXCLUDED.raw_jsonb, fetched_at=NOW()
            """,
            (
                date_str, summary.get("calories"), summary.get("carbs"),
                summary.get("fat"), summary.get("fiber"), summary.get("protein"),
                summary.get("sodium"), summary.get("water"), goals.get("calories"),
                len(foods), json.dumps(data),
            ),
        )
    conn.commit()
    return 1


def main(
    db_resource_path: Optional[str] = None,
    fitbit_resource_path: Optional[str] = None,
    recent_days: int = DEFAULT_RECENT_DAYS,
    backfill_days: int = 0,
) -> dict[str, Any]:
    db = wmill.get_resource(db_resource_path or DEFAULT_DB_RESOURCE_PATH)
    fpath = fitbit_resource_path or DEFAULT_FITBIT_RESOURCE_PATH
    creds = refresh_token_if_needed(wmill.get_resource(fpath), fpath)

    days_back = backfill_days if backfill_days and backfill_days > 0 else recent_days
    today = datetime.now(timezone.utc).date()

    rows = 0
    errors = 0
    with psycopg.connect(**conn_kwargs(db)) as conn:
        ensure_table(conn)
        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)
        headers = {"Authorization": f"Bearer {creds['access_token']}"}
        for i in range(days_back + 1):
            d = (today - timedelta(days=days_back - i)).isoformat()
            resp = requests.get(
                f"{BASE_URL}/1/user/-/foods/log/date/{d}.json",
                headers=headers, timeout=30,
            )
            if resp.status_code in (401, 403):
                # Missing `nutrition` scope — re-authorize Fitbit to enable.
                msg = ("Fitbit token lacks the `nutrition` scope (HTTP "
                       f"{resp.status_code}). Re-authorize Fitbit granting "
                       "`nutrition`, update the fitbit_oauth resource, and re-run.")
                print(msg)
                update_ingest_run(conn, run_id, "partial", rows, 1, {"error": msg})
                return {"status": "needs_nutrition_scope", "rows": rows, "message": msg}
            if resp.status_code == 429:
                print("Rate limited; stopping.")
                errors += 1
                break
            try:
                resp.raise_for_status()
                rows += upsert_food(conn, d, resp.json())
            except Exception as exc:  # noqa: BLE001
                errors += 1
                print(f"  {d} failed: {exc}")
            time.sleep(RATE_LIMIT_PAUSE)
        status = "completed" if errors == 0 else "partial"
        update_ingest_run(conn, run_id, status, rows, errors,
                          {"days_back": days_back, "rows": rows})

    return {"status": status, "rows_upserted": rows, "errors": errors, "days_back": days_back}
