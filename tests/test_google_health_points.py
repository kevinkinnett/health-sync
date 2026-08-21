import unittest

from google_health_points import parse_point
from google_health_temporal import TemporalResolutionError


class ParsePointTests(unittest.TestCase):
    def test_sleep_uses_local_wake_date_not_utc_start_date(self):
        point = {
            "sleep": {
                "date": {"year": 2026, "month": 5, "day": 2},
                "interval": {
                    "startTime": "2026-05-02T23:58:00Z",
                    "endTime": "2026-05-03T08:53:00Z",
                    "startUtcOffset": "-14400s",
                    "endUtcOffset": "-14400s",
                }
            },
            "dataSource": {"platform": "FITBIT"},
        }

        parsed = parse_point("sleep", point)

        self.assertEqual(parsed["pdate"], "2026-05-03")

    def test_sleep_without_embedded_offset_falls_back_to_eastern_timezone(self):
        point = {
            "sleep": {
                "interval": {
                    "startTime": "2026-01-14T23:00:00Z",
                    "endTime": "2026-01-15T03:30:00Z",
                }
            },
            "dataSource": {"platform": "FITBIT"},
        }

        parsed = parse_point("sleep", point)

        self.assertEqual(parsed["pdate"], "2026-01-14")

    def test_preserves_a_google_name_as_the_stable_key(self):
        point = {
            "name": "users/me/dataTypes/steps/dataPoints/abc",
            "dataSource": {"platform": "FITBIT"},
            "steps": {
                "interval": {
                    "startTime": "2026-08-09T12:00:00Z",
                    "endTime": "2026-08-09T12:01:00Z",
                    "startUtcOffset": "-14400s",
                    "endUtcOffset": "-14400s",
                },
                "count": "40",
            },
        }

        parsed = parse_point("steps", point)

        self.assertEqual(parsed["key"], point["name"])
        self.assertEqual(parsed["pdate"], "2026-08-09")

    def test_uses_the_full_sample_timestamp_for_unnamed_intraday_points(self):
        point = {
            "dataSource": {
                "platform": "FITBIT",
                "application": {"packageName": "com.fitbit.FitbitMobile"},
                "device": {"displayName": "Pixel Watch"},
            },
            "oxygenSaturation": {
                "sampleTime": {
                    "physicalTime": "2026-08-09T02:15:00Z",
                    "utcOffset": "-14400s",
                    "civilTime": {
                        "date": {"year": 2026, "month": 8, "day": 8},
                        "time": {"hours": 22, "minutes": 15},
                    },
                },
                "percentage": 96.4,
            },
        }

        parsed = parse_point("oxygen-saturation", point)

        self.assertEqual(
            parsed["key"],
            "oxygen-saturation|FITBIT|com.fitbit.FitbitMobile|"
            "2026-08-09T02:15:00Z",
        )
        self.assertEqual(parsed["start"], "2026-08-09T02:15:00Z")
        self.assertEqual(parsed["end"], "2026-08-09T02:15:00Z")
        self.assertEqual(parsed["pdate"], "2026-08-08")
        self.assertEqual(parsed["date_basis"], "google_civil_sample")
        self.assertEqual(parsed["device"], "Pixel Watch")

    def test_date_only_summaries_get_one_key_per_day(self):
        point = {
            "dataSource": {"platform": "FITBIT"},
            "dailyRestingHeartRate": {
                "date": {"year": 2026, "month": 8, "day": 9},
                "beatsPerMinute": 58,
            },
        }

        parsed = parse_point("daily-resting-heart-rate", point)

        self.assertEqual(
            parsed["key"], "daily-resting-heart-rate|FITBIT||2026-08-09"
        )

    def test_undeclared_types_fail_closed_instead_of_guessing_a_utc_day(self):
        point = {"dataSource": {"platform": "FITBIT"}, "metadata": {"b": 2, "a": 1}}

        with self.assertRaises(TemporalResolutionError):
            parse_point("metadata", point)


if __name__ == "__main__":
    unittest.main()
