import unittest
from unittest.mock import patch

import google_health_rollups as rollups


class Connection:
    def __init__(self, cursor=None):
        self._cursor = cursor or object()
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class WeightCursor:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    @staticmethod
    def fetchall():
        return [("2026-08-10", "users/me/dataTypes/weight/dataPoints/abc", {
            "weight": {"grams": 84_500},
        })]


class GoogleHealthRollupTests(unittest.TestCase):
    def test_network_rollup_failure_preserves_committed_sql_rollups(self):
        connection = Connection()
        with (
            patch.object(rollups, "_sql_rollups"),
            patch.object(rollups, "_rollup_sleep", return_value=2),
            patch.object(rollups, "_rollup_food", return_value=3),
            patch.object(rollups, "_rollup_weight", return_value=4),
            patch.object(rollups, "_rollup_exercise", return_value=5),
            patch.object(rollups, "_rollup_activity_daily", side_effect=RuntimeError("offline")),
        ):
            result = rollups.run_rollups(connection, "token", 45)

        self.assertEqual(connection.commits, 1)
        self.assertEqual(connection.rollbacks, 1)
        self.assertEqual(result["activity_error"], "offline")
        self.assertEqual(result["sleep_days"], 2)

    def test_weight_rollup_uses_stable_negative_compatibility_id(self):
        cursor = WeightCursor()

        self.assertEqual(rollups._rollup_weight(cursor, "2026-08-01"), 1)

        _, params = cursor.calls[-1]
        self.assertLess(params[0], 0)
        self.assertEqual(params[2], 84.5)
        self.assertEqual(params[3], rollups.MARK)


if __name__ == "__main__":
    unittest.main()
