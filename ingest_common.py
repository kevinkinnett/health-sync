"""
Shared plumbing for the Windmill ingest_* jobs.

Deployed at `u/kevin/ingest_common`; the ingest scripts import it via
Windmill's workspace-relative imports:

    from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

WHAT LIVES HERE (and what doesn't): exactly the code that was previously
copy-pasted into every ingest script — Postgres connection kwargs from a
Windmill postgresql resource, and the universe.ingest_run lifecycle
(create as 'running', finalize with status/rows/errors/details). Each
provider's *_ingest_state upsert stays in its own script: the state
schemas differ per source (cursor columns are provider-specific).

Change discipline: every deployed ingest job imports this module, so a
change here ships to ALL of them on their next run. Keep it tiny, keep
it backward compatible, and never raise on the happy path.
"""

import json
from typing import Any

import psycopg


def conn_kwargs(res: dict[str, Any]) -> dict[str, Any]:
    """psycopg connection kwargs from a Windmill `postgresql` resource."""
    return {
        "host": res["host"],
        "port": int(res.get("port", 5432)),
        "user": res["user"],
        "password": res["password"],
        "dbname": res["dbname"],
        "sslmode": res.get("sslmode", "disable"),
    }


def create_ingest_run(conn: psycopg.Connection, provider: str, job_name: str) -> int:
    """Insert a 'running' universe.ingest_run row and return its id.

    Committed immediately so the run is visible (and survives) even if
    the job later crashes mid-flight.
    """
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO universe.ingest_run (provider, job_name, status) "
            "VALUES (%s, %s, 'running') RETURNING ingest_run_id",
            (provider, job_name),
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
    """Finalize an ingest_run row (status: completed | partial | failed)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE universe.ingest_run
            SET finished_at_utc = NOW(), status = %s, rows_written = %s,
                error_count = %s, details = %s
            WHERE ingest_run_id = %s
            """,
            (status, rows_written, error_count, json.dumps(details), run_id),
        )
    conn.commit()


def main() -> dict[str, Any]:
    """Module marker — lets the path deploy/preview like any script."""
    return {"module": "ingest_common", "ok": True}
