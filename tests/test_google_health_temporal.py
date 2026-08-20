import unittest
from datetime import datetime, timezone

from google_health_temporal import (
    TemporalResolutionError,
    filter_expression,
    local_capture_window,
    resolve_point_time,
)


class GoogleHealthTemporalTests(unittest.TestCase):
    def test_late_edst_food_uses_google_civil_start_date(self):
        value = {
            "interval": {
                "startTime": "2026-08-14T01:00:00Z",
                "endTime": "2026-08-14T01:15:00Z",
                "startUtcOffset": "-14400s",
                "endUtcOffset": "-14400s",
                "civilStartTime": {
                    "date": {"year": 2026, "month": 8, "day": 13},
                    "time": {"hours": 21},
                },
                "civilEndTime": {
                    "date": {"year": 2026, "month": 8, "day": 13},
                    "time": {"hours": 21, "minutes": 15},
                },
            }
        }

        resolved = resolve_point_time("nutrition-log", value)

        self.assertEqual(resolved.analysis_date, "2026-08-13")
        self.assertEqual(resolved.date_basis, "google_civil_start")

    def test_interval_uses_embedded_est_offset_when_civil_time_is_absent(self):
        value = {
            "interval": {
                "startTime": "2026-01-16T02:00:00Z",
                "endTime": "2026-01-16T02:30:00Z",
                "startUtcOffset": "-18000s",
                "endUtcOffset": "-18000s",
            }
        }

        resolved = resolve_point_time("exercise", value)

        self.assertEqual(resolved.analysis_date, "2026-01-15")
        self.assertEqual(resolved.date_basis, "google_start_offset")

    def test_sample_uses_civil_sample_date_instead_of_physical_utc_date(self):
        value = {
            "sampleTime": {
                "physicalTime": "2026-04-11T01:30:00Z",
                "utcOffset": "-14400s",
                "civilTime": {
                    "date": {"year": 2026, "month": 4, "day": 10},
                    "time": {"hours": 21, "minutes": 30},
                },
            }
        }

        resolved = resolve_point_time("weight", value)

        self.assertEqual(resolved.analysis_date, "2026-04-10")
        self.assertEqual(resolved.date_basis, "google_civil_sample")
        self.assertEqual(resolved.source_local_time, "21:30:00")

    def test_sample_clock_falls_back_to_physical_time_and_offset(self):
        resolved = resolve_point_time(
            "weight",
            {
                "sampleTime": {
                    "physicalTime": "2026-08-11T01:05:30Z",
                    "utcOffset": "-14400s",
                }
            },
        )

        self.assertEqual(resolved.analysis_date, "2026-08-10")
        self.assertEqual(resolved.source_local_time, "21:05:30")

    def test_sample_without_civil_clock_or_offset_keeps_time_unknown(self):
        resolved = resolve_point_time(
            "weight",
            {
                "sampleTime": {
                    "physicalTime": "2026-08-11T01:05:30Z",
                    "civilTime": {
                        "date": {"year": 2026, "month": 8, "day": 10},
                    },
                }
            },
        )

        self.assertEqual(resolved.analysis_date, "2026-08-10")
        self.assertIsNone(resolved.source_local_time)

    def test_sleep_uses_local_end_as_wake_date(self):
        value = {
            "interval": {
                "startTime": "2026-08-13T03:00:00Z",
                "endTime": "2026-08-13T11:00:00Z",
                "startUtcOffset": "-14400s",
                "endUtcOffset": "-14400s",
            }
        }

        resolved = resolve_point_time("sleep", value)

        self.assertEqual(resolved.source_local_date, "2026-08-12")
        self.assertEqual(resolved.analysis_date, "2026-08-13")
        self.assertEqual(resolved.date_basis, "google_end_offset")

    def test_sleep_respects_the_offset_change_on_spring_forward_night(self):
        value = {
            "interval": {
                "startTime": "2026-03-08T04:00:00Z",
                "endTime": "2026-03-08T11:00:00Z",
                "startUtcOffset": "-18000s",
                "endUtcOffset": "-14400s",
            }
        }

        resolved = resolve_point_time("sleep", value)

        self.assertEqual(resolved.source_local_date, "2026-03-07")
        self.assertEqual(resolved.analysis_date, "2026-03-08")

    def test_invalid_civil_and_physical_times_fail_closed(self):
        with self.assertRaises(TemporalResolutionError):
            resolve_point_time(
                "weight",
                {
                    "sampleTime": {
                        "physicalTime": "not-a-timestamp",
                        "civilTime": {
                            "date": {"year": 2026, "month": 13, "day": 40}
                        },
                    }
                },
            )

    def test_unknown_type_fails_closed(self):
        with self.assertRaises(TemporalResolutionError):
            resolve_point_time("future-mystery-type", {"date": {}})

    def test_filter_uses_the_temporal_shape_declared_for_each_type(self):
        from datetime import date

        start = date(2026, 8, 12)
        end = date(2026, 8, 16)
        self.assertIn("nutrition_log.interval.civil_start_time", filter_expression("nutrition-log", start, end))
        self.assertIn("weight.sample_time.civil_time", filter_expression("weight", start, end))
        self.assertIn("sleep.interval.civil_end_time", filter_expression("sleep", start, end))
        self.assertIn("daily_resting_heart_rate.date", filter_expression("daily-resting-heart-rate", start, end))

    def test_capture_window_is_anchored_to_eastern_calendar_day(self):
        # 00:30 UTC is still the prior evening in New York.
        start, end = local_capture_window(
            3, now=datetime(2026, 8, 15, 0, 30, tzinfo=timezone.utc)
        )

        self.assertEqual(start.isoformat(), "2026-08-11")
        self.assertEqual(end.isoformat(), "2026-08-15")


if __name__ == "__main__":
    unittest.main()
