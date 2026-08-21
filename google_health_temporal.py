"""Canonical temporal semantics for Google Health data points.

Google exposes four different time shapes (daily, interval, sample, and
session).  A physical UTC instant and a health-analysis day are not
interchangeable: food belongs to its civil start date, while sleep belongs to
its civil wake date.  This module is the single policy registry and pure
resolver used by capture and rollups.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo


DEFAULT_USER_TIMEZONE = "America/New_York"

TemporalShape = Literal["daily", "interval", "sample", "session"]
DayPolicy = Literal["explicit_date", "local_start", "local_sample", "wake_end"]


class TemporalResolutionError(ValueError):
    """A supported Google type did not contain enough time evidence."""


@dataclass(frozen=True)
class GoogleDataTypeSpec:
    api_name: str
    payload_key: str
    shape: TemporalShape
    day_policy: DayPolicy
    filter_field: str


@dataclass(frozen=True)
class ResolvedTime:
    start_time: str | None
    end_time: str | None
    source_local_date: str
    analysis_date: str
    date_basis: str
    source_local_time: str | None = None


_SPECS = (
    GoogleDataTypeSpec("daily-resting-heart-rate", "dailyRestingHeartRate", "daily", "explicit_date", "daily_resting_heart_rate.date"),
    GoogleDataTypeSpec("daily-respiratory-rate", "dailyRespiratoryRate", "daily", "explicit_date", "daily_respiratory_rate.date"),
    GoogleDataTypeSpec("daily-sleep-temperature-derivations", "dailySleepTemperatureDerivations", "daily", "explicit_date", "daily_sleep_temperature_derivations.date"),
    GoogleDataTypeSpec("daily-heart-rate-variability", "dailyHeartRateVariability", "daily", "explicit_date", "daily_heart_rate_variability.date"),
    GoogleDataTypeSpec("heart-rate-variability", "heartRateVariability", "sample", "local_sample", "heart_rate_variability.sample_time.civil_time"),
    GoogleDataTypeSpec("oxygen-saturation", "oxygenSaturation", "sample", "local_sample", "oxygen_saturation.sample_time.civil_time"),
    GoogleDataTypeSpec("weight", "weight", "sample", "local_sample", "weight.sample_time.civil_time"),
    GoogleDataTypeSpec("vo2-max", "vo2Max", "sample", "local_sample", "vo2_max.sample_time.civil_time"),
    GoogleDataTypeSpec("steps", "steps", "interval", "local_start", "steps.interval.civil_start_time"),
    GoogleDataTypeSpec("distance", "distance", "interval", "local_start", "distance.interval.civil_start_time"),
    GoogleDataTypeSpec("active-zone-minutes", "activeZoneMinutes", "interval", "local_start", "active_zone_minutes.interval.civil_start_time"),
    GoogleDataTypeSpec("nutrition-log", "nutritionLog", "session", "local_start", "nutrition_log.interval.civil_start_time"),
    GoogleDataTypeSpec("exercise", "exercise", "session", "local_start", "exercise.interval.civil_start_time"),
    GoogleDataTypeSpec("sleep", "sleep", "session", "wake_end", "sleep.interval.civil_end_time"),
)

GOOGLE_DATA_TYPES = {spec.api_name: spec for spec in _SPECS}


def spec_for(data_type: str) -> GoogleDataTypeSpec:
    try:
        return GOOGLE_DATA_TYPES[data_type]
    except KeyError as exc:
        raise TemporalResolutionError(
            f"Google Health type {data_type!r} has no declared temporal policy"
        ) from exc


def resolve_point_time(
    data_type: str,
    value: dict,
    timezone_name: str = DEFAULT_USER_TIMEZONE,
) -> ResolvedTime:
    """Resolve physical instants and the declared health-analysis date."""
    spec = spec_for(data_type)

    if spec.shape == "daily":
        day = _civil_date(value.get("date"))
        if day is None:
            raise TemporalResolutionError(f"{data_type} is missing its civil date")
        return ResolvedTime(None, None, day, day, "google_explicit_date")

    if spec.shape in ("interval", "session"):
        interval = value.get("interval")
        if not isinstance(interval, dict):
            raise TemporalResolutionError(f"{data_type} is missing its interval")
        start = _text(interval.get("startTime"))
        end = _text(interval.get("endTime"))
        local_start, start_basis = _interval_side_date(
            interval, "start", timezone_name
        )
        local_end, end_basis = _interval_side_date(interval, "end", timezone_name)
        if spec.day_policy == "wake_end":
            analysis = local_end
            basis = end_basis
        else:
            analysis = local_start
            basis = start_basis
        source_date = local_start or analysis
        if analysis is None or source_date is None:
            raise TemporalResolutionError(
                f"{data_type} interval has no resolvable civil date"
            )
        return ResolvedTime(start, end, source_date, analysis, basis)

    sample = value.get("sampleTime")
    if not isinstance(sample, dict):
        raise TemporalResolutionError(f"{data_type} is missing its sampleTime")
    physical = _text(sample.get("physicalTime"))
    civil = sample.get("civilTime") if isinstance(sample.get("civilTime"), dict) else {}
    local = _civil_date(civil.get("date"))
    local_time = _civil_time(civil.get("time"))
    if local_time is None:
        local_time = _offset_local_time(
            physical,
            _text(sample.get("utcOffset")),
        )
    if local is not None:
        basis = "google_civil_sample"
    else:
        local, basis = _instant_date(
            physical, _text(sample.get("utcOffset")), timezone_name, "sample"
        )
    if local is None:
        raise TemporalResolutionError(f"{data_type} sample has no resolvable date")
    return ResolvedTime(
        physical,
        physical,
        local,
        local,
        basis,
        source_local_time=local_time,
    )


def filter_expression(data_type: str, start: date, end: date) -> str:
    """Closed-open Google list filter expressed in the type's civil shape."""
    if end <= start:
        raise ValueError("Google Health capture end must be after start")
    field = spec_for(data_type).filter_field
    return (
        f'{field} >= "{start.isoformat()}" AND '
        f'{field} < "{end.isoformat()}"'
    )


def local_capture_window(
    days_back: int,
    timezone_name: str = DEFAULT_USER_TIMEZONE,
    now: datetime | None = None,
) -> tuple[date, date]:
    """Include today plus ``days_back`` completed local calendar days."""
    if days_back < 0:
        raise ValueError("days_back must be non-negative")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    today = current.astimezone(ZoneInfo(timezone_name)).date()
    return today - timedelta(days=days_back), today + timedelta(days=1)


def local_today(
    timezone_name: str = DEFAULT_USER_TIMEZONE,
    now: datetime | None = None,
) -> date:
    return local_capture_window(0, timezone_name, now)[0]


def _interval_side_date(
    interval: dict,
    side: Literal["start", "end"],
    timezone_name: str,
) -> tuple[str | None, str]:
    civil_key = "civilStartTime" if side == "start" else "civilEndTime"
    instant_key = "startTime" if side == "start" else "endTime"
    offset_key = "startUtcOffset" if side == "start" else "endUtcOffset"
    civil = interval.get(civil_key)
    civil_date = _civil_date(civil.get("date")) if isinstance(civil, dict) else None
    if civil_date is not None:
        return civil_date, f"google_civil_{side}"
    return _instant_date(
        _text(interval.get(instant_key)),
        _text(interval.get(offset_key)),
        timezone_name,
        side,
    )


def _instant_date(
    instant_text: str | None,
    offset_text: str | None,
    timezone_name: str,
    label: str,
) -> tuple[str | None, str]:
    if instant_text is None:
        return None, f"missing_{label}_time"
    try:
        instant = datetime.fromisoformat(instant_text.replace("Z", "+00:00"))
    except ValueError:
        return None, f"invalid_{label}_time"
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    seconds = _offset_seconds(offset_text)
    if seconds is not None:
        return (
            (instant.astimezone(timezone.utc) + timedelta(seconds=seconds))
            .date()
            .isoformat(),
            f"google_{label}_offset",
        )
    return (
        instant.astimezone(ZoneInfo(timezone_name)).date().isoformat(),
        f"configured_timezone_{label}",
    )


def _offset_seconds(value: str | None) -> float | None:
    if value is None or not value.endswith("s"):
        return None
    try:
        return float(value[:-1])
    except ValueError:
        return None


def _offset_local_time(
    instant_text: str | None,
    offset_text: str | None,
) -> str | None:
    seconds = _offset_seconds(offset_text)
    if instant_text is None or seconds is None:
        return None
    try:
        instant = datetime.fromisoformat(instant_text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    local = instant.astimezone(timezone.utc) + timedelta(seconds=seconds)
    return local.time().replace(tzinfo=None).isoformat()


def _civil_date(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    try:
        return date(
            int(value["year"]),
            int(value["month"]),
            int(value["day"]),
        ).isoformat()
    except (KeyError, TypeError, ValueError):
        return None


def _civil_time(value: object) -> str | None:
    if not isinstance(value, dict):
        return None
    try:
        hours = int(value.get("hours", 0))
        minutes = int(value.get("minutes", 0))
        seconds = int(value.get("seconds", 0))
        microseconds = int(value.get("nanos", 0)) // 1000
        return datetime(
            2000,
            1,
            1,
            hours,
            minutes,
            seconds,
            microseconds,
        ).time().isoformat()
    except (TypeError, ValueError):
        return None


def _text(value: object) -> str | None:
    return value if isinstance(value, str) and value else None
