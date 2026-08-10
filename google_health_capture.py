"""Testable Google Health raw-capture collaborators.

No Windmill or run-tracking imports live here: HTTP pagination and PostgreSQL
persistence can be exercised independently from the production coordinator.
"""

import json
from dataclasses import dataclass
from typing import Iterable

import requests

try:  # Windmill workspace import
    from u.kevin.google_health_points import parse_point
except ModuleNotFoundError:  # Local tests / development
    from google_health_points import parse_point


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

    def fetch_page(self, data_type: str, page_token: str | None = None) -> Page:
        params: dict[str, object] = {"pageSize": 1000}
        if page_token:
            params["pageToken"] = page_token
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
                value_jsonb JSONB NOT NULL, fetched_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (data_type, point_key))
        """)
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
                    (data_type, point_key, name, source_platform, source_app, source_device, start_time, end_time, point_date, value_jsonb)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (data_type, point_key) DO UPDATE SET
                    value_jsonb=EXCLUDED.value_jsonb, point_date=EXCLUDED.point_date,
                    start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time, fetched_at=NOW()
            """, (
                data_type, parsed["key"], parsed["name"], parsed["platform"],
                parsed["app"], parsed["device"], parsed["start"], parsed["end"],
                parsed["pdate"], json.dumps(parsed["raw"]),
            ))
            count += 1
        self._connection.commit()
        return count


def capture_types(
    api: GoogleHealthApi,
    store: RawPointStore,
    data_types: Iterable[str],
    max_pages: int,
) -> dict:
    """Capture each type independently; an error never orphans the whole run."""
    results = {}
    for data_type in data_types:
        page_token = None
        count = 0
        pages = 0
        error = None
        while pages < max_pages:
            try:
                page = api.fetch_page(data_type, page_token)
            except CaptureError as exc:
                error = str(exc)
                break
            count += store.upsert_page(data_type, page.points)
            pages += 1
            page_token = page.next_token
            if not page_token:
                break
        results[data_type] = {"points": count} if error is None else {"error": error}
    return results
