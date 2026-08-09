import unittest

from google_health_points import parse_point


class ParsePointTests(unittest.TestCase):
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
