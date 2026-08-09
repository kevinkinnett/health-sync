"""Pure normalization helpers for Google Health API data points.

This module intentionally has no Windmill, network, or database dependencies.
It can be tested locally and deployed as ``u.kevin.google_health_points`` for
the ingestion job to import.
"""

import hashlib
import json


def parse_point(data_type: str, point: dict) -> dict:
    """Normalize one Google Health point for raw-table persistence.

    The fallback key is ordered from most to least granular. In particular,
    timestamped samples must not collapse into a single row for their date.
    """
    value_key = next(
        (key for key in point if key not in ("name", "dataSource")), None
    )
    value = point.get(value_key, {}) if value_key else {}
    source = point.get("dataSource", {})
    platform = source.get("platform")
    app = (source.get("application") or {}).get("packageName")
    device = (source.get("device") or {}).get("displayName")
    start = end = point_date = None

    if isinstance(value, dict):
        interval = value.get("interval")
        sample_time = value.get("sampleTime")
        civil_date = value.get("date")
        if isinstance(interval, dict):
            start, end = interval.get("startTime"), interval.get("endTime")
        elif isinstance(sample_time, dict):
            start = end = sample_time.get("physicalTime")
        if isinstance(civil_date, dict):
            point_date = (
                f"{civil_date['year']:04d}-{civil_date['month']:02d}-"
                f"{civil_date['day']:02d}"
            )

    if not point_date and start:
        point_date = start[:10]

    key = point.get("name")
    if not key:
        key = "|".join(
            [data_type, platform or "", app or "", start or point_date or ""]
        )
        if not (point_date or start):
            digest = hashlib.md5(
                json.dumps(point, sort_keys=True).encode()
            ).hexdigest()[:10]
            key += "|" + digest

    return {
        "key": key,
        "name": point.get("name"),
        "platform": platform,
        "app": app,
        "device": device,
        "start": start,
        "end": end,
        "pdate": point_date,
        "raw": point,
    }
