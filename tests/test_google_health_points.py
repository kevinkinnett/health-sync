import unittest

from google_health_points import parse_point


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
            "steps": {"date": {"year": 2026, "month": 8, "day": 9}},
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
                "sampleTime": {"physicalTime": "2026-08-09T02:15:00Z"},
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
        self.assertEqual(parsed["pdate"], "2026-08-09")
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

    def test_content_hash_keeps_undated_unnamed_points_deterministic(self):
        point = {"dataSource": {"platform": "FITBIT"}, "metadata": {"b": 2, "a": 1}}

        first = parse_point("metadata", point)
        second = parse_point("metadata", point)

        self.assertEqual(first["key"], second["key"])
        self.assertRegex(first["key"], r"^metadata\|FITBIT\|\|\|[0-9a-f]{10}$")


if __name__ == "__main__":
    unittest.main()
