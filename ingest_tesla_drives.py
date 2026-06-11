"""
Ingest Tesla driving time into universe.tesla_drive_daily.

SOURCE: a self-hosted TeslaMate Postgres database (the `drives` table —
one row per trip with a pre-computed `duration_min`, `distance` (km),
`speed_max`, and start/end timestamps stored in UTC).

WHAT WE PRODUCE: one row per LOCAL calendar day with the day's total
"time in car" (sum of drive minutes), trip count, distance, and top
speed. This is the daily series the dashboard correlates against sleep,
steps, readiness, etc. ("does a long driving day cost me sleep tonight?").

TWO DATABASES: this is the only ingest that reads from a *different*
database than it writes to. It opens a read connection to TeslaMate
(resource `u/kevin/teslamate_db`, which you create) and a write
connection to the universe DB (`u/kevin/universe_db`).

TIMEZONE: TeslaMate stores naive UTC timestamps. We bucket by the user's
local day in SQL — `(start_date AT TIME ZONE 'UTC' AT TIME ZONE tz)::date`
— so the day boundaries line up with the Fitbit/Eight Sleep series. A
trip is attributed to the day it STARTED (trips rarely cross midnight,
and the whole duration counts toward the start day).

CADENCE: the drive set is small, so every run does a FULL recompute of
all daily rollups and upserts them (idempotent ON CONFLICT). No
incremental cursor to drift. Safe to run as often as you like.
"""

import json
from typing import Any, Optional

import psycopg
import wmill

from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
PROVIDER = "tesla"
JOB_NAME = "tesla_ingest"
DEFAULT_DB_RESOURCE_PATH = "u/kevin/universe_db"
DEFAULT_TESLAMATE_RESOURCE_PATH = "u/kevin/teslamate_db"
# Must match the dashboard server's USER_TIMEZONE so the day buckets of
# this rollup line up with the Fitbit/Eight Sleep series it's joined to.
DEFAULT_TZ = "America/New_York"


# ---------------------------------------------------------------------------
# DDL (in the universe DB)
# ---------------------------------------------------------------------------

def ensure_tables(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.tesla_drive_daily (
                drive_date        DATE PRIMARY KEY,
                drives            INTEGER NOT NULL,
                minutes_in_car    INTEGER NOT NULL,
                distance_km       NUMERIC(9,2),
                max_speed_kmh     INTEGER,
                first_depart_utc  TIMESTAMPTZ,
                last_arrive_utc   TIMESTAMPTZ,
                source            TEXT NOT NULL DEFAULT 'teslamate',
                updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS ix_tesla_drive_daily_date
                ON universe.tesla_drive_daily (drive_date DESC)
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.tesla_ingest_state (
                data_type           TEXT PRIMARY KEY,
                latest_drive_date   DATE,
                earliest_drive_date DATE,
                last_success_at_utc TIMESTAMPTZ,
                last_run_id         BIGINT,
                updated_at_utc      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                details             JSONB
            )
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# State tracking (run lifecycle lives in u/kevin/ingest_common)
# ---------------------------------------------------------------------------

def update_state(conn, latest, earliest, run_id, details) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.tesla_ingest_state
                (data_type, latest_drive_date, earliest_drive_date,
                 last_success_at_utc, last_run_id, updated_at_utc, details)
            VALUES ('drive_daily', %s, %s, NOW(), %s, NOW(), %s)
            ON CONFLICT (data_type) DO UPDATE SET
                latest_drive_date = EXCLUDED.latest_drive_date,
                earliest_drive_date = EXCLUDED.earliest_drive_date,
                last_success_at_utc = NOW(), last_run_id = EXCLUDED.last_run_id,
                updated_at_utc = NOW(), details = EXCLUDED.details
            """,
            (latest, earliest, run_id, json.dumps(details)),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Read rollups from TeslaMate
# ---------------------------------------------------------------------------

def fetch_daily_rollups(tm_conn: psycopg.Connection, tz_name: str) -> list[dict[str, Any]]:
    """Aggregate the `drives` table into one row per local day.

    Postgres does the timezone bucketing: each trip's UTC start is
    converted to the user's local day. Open/aborted drives (NULL
    duration) are skipped.
    """
    sql = """
        SELECT
            (start_date AT TIME ZONE 'UTC' AT TIME ZONE %(tz)s)::date AS drive_date,
            count(*)                                   AS drives,
            sum(duration_min)                          AS minutes_in_car,
            round(sum(distance)::numeric, 2)           AS distance_km,
            max(speed_max)                             AS max_speed_kmh,
            min(start_date AT TIME ZONE 'UTC')         AS first_depart_utc,
            max(end_date   AT TIME ZONE 'UTC')         AS last_arrive_utc
        FROM drives
        WHERE duration_min IS NOT NULL
        GROUP BY 1
        ORDER BY 1
    """
    with tm_conn.cursor() as cur:
        cur.execute(sql, {"tz": tz_name})
        cols = [c.name for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


def upsert_day(conn: psycopg.Connection, row: dict[str, Any]) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO universe.tesla_drive_daily (
                drive_date, drives, minutes_in_car, distance_km,
                max_speed_kmh, first_depart_utc, last_arrive_utc, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (drive_date) DO UPDATE SET
                drives = EXCLUDED.drives,
                minutes_in_car = EXCLUDED.minutes_in_car,
                distance_km = EXCLUDED.distance_km,
                max_speed_kmh = EXCLUDED.max_speed_kmh,
                first_depart_utc = EXCLUDED.first_depart_utc,
                last_arrive_utc = EXCLUDED.last_arrive_utc,
                updated_at = NOW()
            """,
            (
                row["drive_date"], int(row["drives"]),
                int(row["minutes_in_car"] or 0), row["distance_km"],
                int(row["max_speed_kmh"]) if row["max_speed_kmh"] is not None else None,
                row["first_depart_utc"], row["last_arrive_utc"],
            ),
        )
    return 1


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main(
    db: Optional[dict[str, Any]] = None,
    db_resource_path: Optional[str] = None,
    teslamate_db: Optional[dict[str, Any]] = None,
    teslamate_db_resource_path: Optional[str] = None,
    user_timezone: str = DEFAULT_TZ,
) -> dict[str, Any]:
    # Universe (write) connection.
    resolved_db = db if db is not None else wmill.get_resource(
        db_resource_path or DEFAULT_DB_RESOURCE_PATH
    )

    # TeslaMate (read) connection — the one prerequisite you create.
    if teslamate_db is not None:
        resolved_tm = teslamate_db
    else:
        tm_path = teslamate_db_resource_path or DEFAULT_TESLAMATE_RESOURCE_PATH
        try:
            resolved_tm = wmill.get_resource(tm_path)
        except Exception as exc:  # noqa: BLE001
            return {
                "error": f"Could not read TeslaMate DB resource '{tm_path}': {exc}. "
                "Create a Postgres resource at that path pointing at your "
                "TeslaMate database, then re-run.",
            }

    rows = 0
    errors = 0
    dates: list[str] = []

    with psycopg.connect(**conn_kwargs(resolved_db)) as conn:
        ensure_tables(conn)
        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)

        daily: list[dict[str, Any]] = []
        read_ok = False
        status = "failed"  # finalized in the `finally` even on a crash
        try:
            # Read phase — TeslaMate. Distinct messages for connect vs
            # query failures so a bad user_timezone (query) isn't
            # misdiagnosed as a connectivity problem, and universe-side
            # failures below are never blamed on "TeslaMate read".
            try:
                with psycopg.connect(**conn_kwargs(resolved_tm)) as tm_conn:
                    daily = fetch_daily_rollups(tm_conn, user_timezone)
                read_ok = True
            except psycopg.OperationalError as exc:
                errors += 1
                print(f"  TeslaMate connection failed: {exc}")
            except Exception as exc:  # noqa: BLE001
                errors += 1
                print(
                    f"  TeslaMate rollup query failed "
                    f"(check user_timezone={user_timezone!r}): {exc}"
                )

            # Write phase — universe.
            print(f"Tesla ingest: {len(daily)} local days from TeslaMate")
            for r in daily:
                try:
                    upsert_day(conn, r)
                    # Commit per row: in psycopg a failed statement aborts
                    # the whole transaction, so a single bad row must not
                    # roll back every other day's upsert.
                    conn.commit()
                    rows += 1
                    dates.append(str(r["drive_date"]))
                except Exception as exc:  # noqa: BLE001
                    conn.rollback()  # clear the aborted tx; next row proceeds
                    errors += 1
                    print(f"  upsert {r.get('drive_date')} failed: {exc}")

            # Reconcile: on a clean full recompute, drop rollup rows for
            # days that no longer have any drives in TeslaMate (a drive
            # was deleted/edited), so the dashboard never shows stale
            # time-in-car. Requires BOTH a successful read and zero write
            # errors. With an empty `dates`, `<> ALL('{}')` is vacuously
            # true and clears the table — correct when a clean read says
            # TeslaMate truly has no drives. The source filter keeps any
            # future non-teslamate writer's rows out of the prune.
            if read_ok and errors == 0:
                with conn.cursor() as cur:
                    cur.execute(
                        "DELETE FROM universe.tesla_drive_daily "
                        "WHERE source = 'teslamate' AND drive_date <> ALL(%s::date[])",
                        (dates,),
                    )
                conn.commit()

            if errors == 0:
                status = "completed"
            elif rows > 0:
                status = "partial"  # some days landed, some failed
            # else: stays "failed" — nothing was ingested
        finally:
            # Always finalize the run row: without this, any unexpected
            # raise would leave it 'running' forever and monitoring blind.
            try:
                conn.rollback()  # clear any aborted tx so the finalize commits
            except Exception:  # noqa: BLE001
                pass
            latest = max(dates) if dates else None
            earliest = min(dates) if dates else None
            details = {"days": len(set(dates)), "latest": latest, "earliest": earliest}
            if latest:
                update_state(conn, latest, earliest, run_id, details)
            update_ingest_run(conn, run_id, status, rows, errors, details)

    return {
        "status": status,
        "rows_upserted": rows,
        "distinct_days": len(set(dates)),
        "latest_drive_date": latest,
        "earliest_drive_date": earliest,
        "errors": errors,
    }
