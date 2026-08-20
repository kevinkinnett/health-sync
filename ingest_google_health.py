"""Windmill coordinator for Google Health capture and daily rollups.

Raw pagination/persistence and daily transformation are independently
deployable collaborators. This entry point owns credentials, run tracking, and
the production sequencing between them.
"""

import time

import psycopg
import requests
import wmill

from u.kevin.google_health_capture import GoogleHealthApi, RawPointStore, capture_types
from u.kevin.google_health_rollups import GoogleHealthRollupWriter
from u.kevin.google_health_temporal import GOOGLE_DATA_TYPES, local_capture_window
from u.kevin.ingest_common import conn_kwargs, create_ingest_run, update_ingest_run

PROVIDER = "google_health"
JOB_NAME = "google_health_ingest"
DEFAULT_OAUTH_RES = "u/kevin/google_health_oauth"
DEFAULT_DB_RES = "u/kevin/universe_db"
TOKEN_URL = "https://oauth2.googleapis.com/token"

# Daily-only rollup types such as total-calories are fetched by the rollup
# writer. Raw-list types come from the temporal registry so a new endpoint
# cannot be captured without declaring its date semantics first.
TYPES = list(GOOGLE_DATA_TYPES)


def google_access_token(res_path: str) -> str:
    creds = wmill.get_resource(res_path)
    web = creds.get("web") if isinstance(creds.get("web"), dict) else creds
    if creds.get("access_token") and creds.get("expires_at", 0) > time.time() + 300:
        return creds["access_token"]
    print("Refreshing Google access token...")
    response = requests.post(TOKEN_URL, data={
        "grant_type": "refresh_token",
        "refresh_token": creds["refresh_token"],
        "client_id": web["client_id"],
        "client_secret": web["client_secret"],
    }, timeout=30)
    response.raise_for_status()
    token = response.json()
    creds["access_token"] = token["access_token"]
    creds["expires_at"] = int(time.time()) + int(token.get("expires_in", 3600))
    if token.get("refresh_token"):
        creds["refresh_token"] = token["refresh_token"]
    wmill.set_resource(res_path, creds, resource_type="any")
    return creds["access_token"]


def capture_raw(conn, token: str, max_pages: int, start_date, end_date) -> dict:
    """Adapt the independently testable capture collaborators for production."""
    store = RawPointStore(conn)
    captured = capture_types(
        GoogleHealthApi(token),
        store,
        TYPES,
        max_pages,
        start_date,
        end_date,
    )
    return captured, store.temporal_audit(start_date, end_date)


def main(
    creds_resource_path=None,
    db_resource_path=None,
    days_back: int = 3,
    # Bounded civil-time filters keep routine runs light. This is now only a
    # safety ceiling; reaching it is reported as a partial ingest.
    max_pages: int = 20,
    write_daily: bool = False,
    rollup_days: int = 45,
    include_network_activity: bool = True,
):
    days_back = days_back if days_back is not None else 3
    max_pages = max_pages if max_pages is not None else 20
    rollup_days = rollup_days if rollup_days is not None else 45
    start_date, end_date = local_capture_window(days_back)

    token = google_access_token(creds_resource_path or DEFAULT_OAUTH_RES)
    db = wmill.get_resource(db_resource_path or DEFAULT_DB_RES)
    with psycopg.connect(**conn_kwargs(db)) as conn:
        RawPointStore(conn).ensure_schema()
        run_id = create_ingest_run(conn, PROVIDER, JOB_NAME)

        captured: dict = {}
        temporal_audit: list[dict] = []
        rolled = {"skipped": "write_daily=False (raw capture only)"}
        try:
            captured, temporal_audit = capture_raw(
                conn, token, max_pages, start_date, end_date
            )
            if write_daily:
                rolled = GoogleHealthRollupWriter(conn, token).write(
                    rollup_days,
                    include_network_activity,
                )
        except Exception as exc:  # noqa: BLE001
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass
            update_ingest_run(conn, run_id, "failed", 0, 1,
                              {"crash": str(exc)[:300], "captured": captured})
            raise

        total_points = sum(
            value.get("points", 0)
            for value in captured.values()
            if isinstance(value, dict)
        )
        errors = sum(
            1 for value in captured.values()
            if isinstance(value, dict)
            and (value.get("error") or value.get("truncated"))
        )
        update_ingest_run(
            conn,
            run_id,
            "completed" if errors == 0 else "partial",
            total_points,
            errors,
            {
                "capture_window": {
                    "start": start_date.isoformat(),
                    "end_exclusive": end_date.isoformat(),
                },
                "temporal_audit": temporal_audit,
                "captured": captured,
                "rolled": rolled,
            },
        )

    return {
        "status": "ok" if errors == 0 else "partial",
        "raw_points": total_points,
        "errors": errors,
        "capture_window": {
            "start": start_date.isoformat(),
            "end_exclusive": end_date.isoformat(),
        },
        "temporal_audit": temporal_audit,
        "write_daily": write_daily,
        "include_network_activity": include_network_activity,
        "captured": captured,
        "rolled": rolled,
    }
