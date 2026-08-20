"""Pure normalization helpers for Google Health API data points.

This module intentionally has no Windmill, network, or database dependencies.
It can be tested locally and deployed as ``u.kevin.google_health_points`` for
the ingestion job to import.
"""

import hashlib
import json

try:  # Windmill workspace import
    from u.kevin.google_health_temporal import (
        TemporalResolutionError,
        resolve_point_time,
        spec_for,
    )
except ModuleNotFoundError:  # Local tests / development
    from google_health_temporal import (
        TemporalResolutionError,
        resolve_point_time,
        spec_for,
    )


def parse_point(data_type: str, point: dict) -> dict:
    """Normalize one Google Health point for raw-table persistence.

    The fallback key is ordered from most to least granular. In particular,
    timestamped samples must not collapse into a single row for their date.
    """
    spec = spec_for(data_type)
    value = point.get(spec.payload_key)
    if not isinstance(value, dict):
        raise TemporalResolutionError(
            f"{data_type} point is missing payload key {spec.payload_key!r}"
        )
    source = point.get("dataSource", {})
    platform = source.get("platform")
    app = (source.get("application") or {}).get("packageName")
    device = (source.get("device") or {}).get("displayName")
    resolved = resolve_point_time(data_type, value)
    start = resolved.start_time
    end = resolved.end_time
    point_date = resolved.analysis_date

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
        "source_date": resolved.source_local_date,
        "date_basis": resolved.date_basis,
        "raw": point,
    }
