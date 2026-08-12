import unittest

from eight_sleep_points import local_wake_date, select_main_session, series_mean


class EightSleepPointTests(unittest.TestCase):
    def test_declared_main_session_wins_over_later_nap(self):
        main = {
            "id": "main",
            "sleepEnd": "2026-08-12T09:43:00Z",
            "stageSummary": {"sleepDuration": 22_080},
            "timeseries": {"heartRate": [[1, 61.0], [2, 63.0]]},
        }
        nap = {
            "id": "nap",
            "stageSummary": {"sleepDuration": 1_800},
            "timeseries": {"heartRate": [[1, 82.0]]},
        }
        day = {"day": "2026-08-12", "mainSessionId": "main", "sessions": [main, nap]}

        selected = select_main_session(day)

        self.assertIs(selected, main)
        self.assertEqual(series_mean(selected["timeseries"], "heartRate"), 62.0)
        self.assertEqual(local_wake_date(day, "America/New_York"), "2026-08-12")

    def test_longest_session_is_safe_fallback_when_main_id_is_missing(self):
        shorter = {"id": "short", "stageSummary": {"sleepDuration": 1_800}}
        longer = {
            "id": "long",
            "sleepEnd": "2026-01-15T12:30:00Z",
            "stageSummary": {"sleepDuration": 24_000},
        }
        day = {"sessions": [longer, shorter]}

        self.assertIs(select_main_session(day), longer)
        # January uses EST (UTC-5), proving this is not a fixed EDT offset.
        self.assertEqual(local_wake_date(day, "America/New_York"), "2026-01-15")


if __name__ == "__main__":
    unittest.main()
