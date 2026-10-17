"""Testable Google Health raw-capture collaborators.

No Windmill or run-tracking imports live here: HTTP pagination and PostgreSQL
persistence can be exercised independently from the production coordinator.
"""

import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable

import requests

try:  # Windmill workspace import
    from u.kevin.google_health_points import parse_point
    from u.kevin.google_health_temporal import (
        TemporalResolutionError,
        filter_expression,
    )
except ModuleNotFoundError:  # Local tests / development
    from google_health_points import parse_point
    from google_health_temporal import TemporalResolutionError, filter_expression


BASE = "https://health.googleapis.com/v4"


class CaptureError(RuntimeError):
    """One data type could not be fetched; other types may continue."""


# Deletion reconciliation (points removed in the Fitbit app)
# -----------------------------------------------------------
# Google never reports deletions; a deleted point simply stops coming back.
# But "absent from this capture" only means "deleted" where the capture saw
# EVERYTHING Google holds. The list endpoint pages newest-first under a
# per-window page cap, so a truncated window says nothing about its older
# points, and a window that errored says nothing at all. The rule is:
#
#   A raw row may be deleted only when ALL of these hold:
#     1. its civil window was paged to the end (no error, no next token);
#     2. its point_date falls inside that window [start, end_exclusive);
#     3. its date_basis is one of Google's own civil dates, i.e. the same
#        field the window filter compares (see filter_expression). Rows dated
#        by a UTC-offset/timezone fallback might disagree with Google's filter
#        by a day, so they are never pruned on absence;
#     4. its point_key was not returned by any page of that window.
#
# Anything outside the windows that were actually covered is left alone, so a
# short routine capture (days_back=3) can never touch older history.
#
# Guard: if a window would delete more rows than it returned AND more than
# DELETE_GUARD_MIN_ROWS, the delete is skipped and reported instead. That is
# the signature of a silently empty/short 200 response rather than of a user
# deleting a handful of log entries, and losing a whole window of steps or
# heart samples to an API hiccup is worse than one stale point waiting for the
# next clean run. A concurrent edit while a multi-page window is being paged
# can, at worst, make one live point look absent; it is re-inserted by the
# next capture that covers its date.
RECONCILABLE_DATE_BASES = (
    "google_explicit_date",
    "google_civil_sample",
    "google_civil_start",
    "google_civil_end",
)
DELETE_GUARD_MIN_ROWS = 10


@dataclass(frozen=True)
class Page:
    points: list[dict]
    next_token: str | None


class GoogleHealthApi:
    def __init__(self, access_token: str, session=requests):
        self._headers = {"Authorization": f"Bearer {access_token}"}
        self._session = session

    def fetch_page(
        self,
        data_type: str,
        page_token: str | None = None,
        point_filter: str | None = None,
    ) -> Page:
        params: dict[str, object] = {"pageSize": 1000}
        if page_token:
            params["pageToken"] = page_token
        if point_filter:
            params["filter"] = point_filter
        try:
            response = self._session.get(
                f"{BASE}/users/me/dataTypes/{data_type}/dataPoints",
                headers=self._headers,
                params=params,
                timeout=90,
            )
        except requests.RequestException as exc:
            raise CaptureError(f"request failed: {str(exc)[:80]}") from exc
        if response.status_code != 200:
            raise CaptureError(f"{response.status_code}: {response.text[:80]}")
        body = response.json()
        return Page(body.get("dataPoints", []), body.get("nextPageToken"))


class RawPointStore:
    def __init__(self, connection):
        self._connection = connection

    def ensure_schema(self) -> None:
        cur = self._connection.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS universe.google_health_data_point (
                data_type TEXT NOT NULL, point_key TEXT NOT NULL, name TEXT,
                source_platform TEXT, source_app TEXT, source_device TEXT,
                start_time TIMESTAMPTZ, end_time TIMESTAMPTZ, point_date DATE,
                source_local_date DATE, date_basis TEXT,
                value_jsonb JSONB NOT NULL, fetched_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (data_type, point_key))
        """)
        cur.execute("ALTER TABLE universe.google_health_data_point ADD COLUMN IF NOT EXISTS source_local_date DATE")
        cur.execute("ALTER TABLE universe.google_health_data_point ADD COLUMN IF NOT EXISTS date_basis TEXT")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_ghdp_type_time ON universe.google_health_data_point (data_type, start_time DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_ghdp_type_date ON universe.google_health_data_point (data_type, source_platform, point_date)")
        self._connection.commit()

    def upsert_page(
        self,
        data_type: str,
        points: Iterable[dict],
        seen_keys: set | None = None,
    ) -> int:
        cur = self._connection.cursor()
        count = 0
        for point in points:
            parsed = parse_point(data_type, point)
            if seen_keys is not None:
                seen_keys.add(parsed["key"])
            cur.execute("""
                INSERT INTO universe.google_health_data_point
                    (data_type, point_key, name, source_platform, source_app, source_device,
                     start_time, end_time, point_date, source_local_date, date_basis, value_jsonb)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (data_type, point_key) DO UPDATE SET
                    value_jsonb=EXCLUDED.value_jsonb, point_date=EXCLUDED.point_date,
                    source_local_date=EXCLUDED.source_local_date,
                    date_basis=EXCLUDED.date_basis,
                    start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time, fetched_at=NOW()
            """, (
                data_type, parsed["key"], parsed["name"], parsed["platform"],
                parsed["app"], parsed["device"], parsed["start"], parsed["end"],
                parsed["pdate"], parsed["source_date"], parsed["date_basis"],
                json.dumps(parsed["raw"]),
            ))
            count += 1
        self._connection.commit()
        return count

    def delete_missing(
        self,
        data_type: str,
        window_start: date,
        window_end: date,
        seen_keys: set,
    ) -> int | None:
        """Delete raw rows of a fully-paged window that Google no longer has.

        Returns the number deleted, or None when the guard (see the
        reconciliation rule above RECONCILABLE_DATE_BASES) refused an
        implausibly large delete.
        Only call this for a window that was paged to completion.
        """
        cur = self._connection.cursor()
        where = """
            WHERE data_type = %s AND point_date >= %s AND point_date < %s
              AND date_basis = ANY(%s) AND NOT (point_key = ANY(%s))
        """
        params = (
            data_type, window_start, window_end,
            list(RECONCILABLE_DATE_BASES), list(seen_keys),
        )
        cur.execute(
            "SELECT COUNT(*) FROM universe.google_health_data_point" + where,
            params,
        )
        missing = cur.fetchone()[0]
        if missing == 0:
            return 0
        if missing > max(DELETE_GUARD_MIN_ROWS, len(seen_keys)):
            return None
        cur.execute(
            "DELETE FROM universe.google_health_data_point" + where,
            params,
        )
        self._connection.commit()
        return missing

    def temporal_audit(self, start_date: date, end_date: date) -> list[dict]:
        """Summarize the provenance used for the captured civil-date window."""
        cur = self._connection.cursor()
        cur.execute("""
            SELECT data_type, date_basis, COUNT(*),
                   MIN(source_local_date), MAX(source_local_date),
                   COUNT(*) FILTER (WHERE point_date IS NULL)
            FROM universe.google_health_data_point
            WHERE COALESCE(point_date, source_local_date) >= %s
              AND COALESCE(point_date, source_local_date) < %s
            GROUP BY data_type, date_basis
            ORDER BY data_type, date_basis
        """, (start_date, end_date))
        return [
            {
                "data_type": data_type,
                "date_basis": basis,
                "points": count,
                "first_source_date": first.isoformat() if first else None,
                "last_source_date": last.isoformat() if last else None,
                "missing_analysis_date": missing,
            }
            for data_type, basis, count, first, last, missing in cur.fetchall()
        ]


def capture_types(
    api: GoogleHealthApi,
    store: RawPointStore,
    data_types: Iterable[str],
    max_pages: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict:
    """Capture each type independently; an error never orphans the whole run."""
    if (start_date is None) != (end_date is None):
        raise ValueError("start_date and end_date must be provided together")
    if max_pages <= 0:
        raise ValueError("max_pages must be positive")
    bounded = start_date is not None and end_date is not None
    windows = (
        _bounded_windows(start_date, end_date) if bounded else [(None, None)]
    )
    results = {}
    for data_type in data_types:
        count = 0
        pages = 0
        error = None
        truncated_windows = []
        deleted = 0
        guarded_windows = []
        for window_start, window_end in windows:
            # Only bounded windows can be reconciled: deletions are judged
            # per civil window (see RECONCILABLE_DATE_BASES).
            seen_keys = set() if bounded else None
            page_token = None
            window_pages = 0
            point_filter = (
                filter_expression(data_type, window_start, window_end)
                if window_start is not None and window_end is not None
                else None
            )
            while window_pages < max_pages:
                try:
                    page = api.fetch_page(data_type, page_token, point_filter)
                except CaptureError as exc:
                    error = str(exc)
                    break
                try:
                    count += store.upsert_page(data_type, page.points, seen_keys)
                except TemporalResolutionError as exc:
                    error = f"temporal resolution failed: {str(exc)[:160]}"
                    break
                pages += 1
                window_pages += 1
                page_token = page.next_token
                if not page_token:
                    break
            if error is not None:
                break
            window = {
                "start": window_start.isoformat() if window_start else None,
                "end_exclusive": window_end.isoformat() if window_end else None,
            }
            if page_token:
                # Page cap hit: older points in this window were never seen,
                # so their absence proves nothing. No reconciliation.
                truncated_windows.append(window)
            elif seen_keys is not None:
                removed = store.delete_missing(
                    data_type, window_start, window_end, seen_keys
                )
                if removed is None:
                    guarded_windows.append(window)
                else:
                    deleted += removed
        if error is not None:
            results[data_type] = {
                "error": error, "points": count, "pages": pages, "deleted": deleted,
            }
        else:
            results[data_type] = {
                "points": count,
                "pages": pages,
                "truncated": bool(truncated_windows),
            }
            if bounded:
                results[data_type]["windows"] = len(windows)
                results[data_type]["truncated_windows"] = truncated_windows
                results[data_type]["deleted"] = deleted
                if guarded_windows:
                    results[data_type]["delete_guarded_windows"] = guarded_windows
    return results


def _bounded_windows(
    start_date: date,
    end_date: date,
    max_days: int = 90,
) -> list[tuple[date, date]]:
    """Split a civil range to Google Health's 90-day query limit, newest first."""
    if end_date <= start_date:
        raise ValueError("Google Health capture end must be after start")
    windows = []
    cursor = end_date
    while cursor > start_date:
        window_start = max(start_date, cursor - timedelta(days=max_days))
        windows.append((window_start, cursor))
        cursor = window_start
    return windows
