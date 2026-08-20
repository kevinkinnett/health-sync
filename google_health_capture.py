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

    def upsert_page(self, data_type: str, points: Iterable[dict]) -> int:
        cur = self._connection.cursor()
        count = 0
        for point in points:
            parsed = parse_point(data_type, point)
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
    windows = (
        _bounded_windows(start_date, end_date)
        if start_date is not None and end_date is not None
        else [(None, None)]
    )
    results = {}
    for data_type in data_types:
        count = 0
        pages = 0
        error = None
        truncated_windows = []
        for window_start, window_end in windows:
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
                    count += store.upsert_page(data_type, page.points)
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
            if page_token:
                truncated_windows.append({
                    "start": window_start.isoformat() if window_start else None,
                    "end_exclusive": window_end.isoformat() if window_end else None,
                })
        if error is not None:
            results[data_type] = {"error": error, "points": count, "pages": pages}
        else:
            results[data_type] = {
                "points": count,
                "pages": pages,
                "truncated": bool(truncated_windows),
            }
            if start_date is not None:
                results[data_type]["windows"] = len(windows)
                results[data_type]["truncated_windows"] = truncated_windows
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
