"""Pure Eight Sleep night normalization.

The trends endpoint can return a main overnight session followed by one or
more naps.  Storage and readiness must use the session named by
``mainSessionId``; array order is not a semantic contract.
"""

from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean
from typing import Any, Optional
from zoneinfo import ZoneInfo


def parse_dt(value: Optional[str], timezone_name: str) -> Optional[datetime]:
    """Parse an Eight Sleep timestamp and attach the configured zone if naive."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    has_offset = text.endswith("Z") or (
        len(text) >= 6 and text[-6] in "+-" and text[-3] == ":"
    )
    try:
        if has_offset:
            return datetime.fromisoformat(text.replace("Z", "+00:00"))
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    try:
        zone = ZoneInfo(timezone_name)
    except Exception:  # noqa: BLE001 - invalid user configuration has a safe fallback
        zone = timezone.utc
    return parsed.replace(tzinfo=zone)


def _session_sleep_seconds(session: dict[str, Any]) -> float:
    summary = session.get("stageSummary") or {}
    value = summary.get("sleepDuration", session.get("duration", 0))
    return float(value) if isinstance(value, (int, float)) else 0.0


def select_main_session(day: dict[str, Any]) -> dict[str, Any]:
    """Return the declared main session, falling back to the longest session."""
    sessions = [item for item in (day.get("sessions") or []) if isinstance(item, dict)]
    if not sessions:
        return {}
    main_id = day.get("mainSessionId")
    if main_id is not None:
        wanted = str(main_id)
        match = next((session for session in sessions if str(session.get("id")) == wanted), None)
        if match is not None:
            return match
    return max(sessions, key=_session_sleep_seconds)


def local_wake_date(day: dict[str, Any], timezone_name: str) -> Optional[str]:
    """Canonical night key: the wake date in the configured IANA timezone."""
    session = select_main_session(day)
    wake = parse_dt(session.get("sleepEnd") or day.get("sleepEnd"), timezone_name)
    if wake is not None:
        try:
            return wake.astimezone(ZoneInfo(timezone_name)).date().isoformat()
        except Exception:  # noqa: BLE001
            return wake.date().isoformat()
    fallback = day.get("day")
    return fallback if isinstance(fallback, str) and fallback else None


def numeric_values(series: Any) -> list[float]:
    """Flatten an Eight Sleep timeseries (scalars or ``[timestamp, value]``)."""
    values: list[float] = []
    if isinstance(series, list):
        for entry in series:
            value = entry[-1] if isinstance(entry, (list, tuple)) and entry else entry
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                values.append(float(value))
    return values


def series_mean(timeseries: dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        values = numeric_values(timeseries.get(key)) if isinstance(timeseries, dict) else []
        if values:
            return mean(values)
    return None


def series_minmax(timeseries: dict[str, Any], key: str) -> tuple[Optional[float], Optional[float]]:
    values = numeric_values(timeseries.get(key)) if isinstance(timeseries, dict) else []
    if not values:
        return (None, None)
    return (min(values), max(values))
