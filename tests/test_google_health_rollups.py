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
        return [("users/me/dataTypes/weight/dataPoints/abc", {
            "weight": {
                "sampleTime": {
                    "physicalTime": "2026-08-11T01:00:00Z",
                    "utcOffset": "-14400s",
                },
                "weightGrams": 84_500,
            },
        })]


class RecordingCursor:
    def __init__(self, rows=()):
        self.rows = list(rows)
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    def fetchall(self):
        return self.rows


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    @staticmethod
    def raise_for_status():
        return None

    def json(self):
        return self.payload


class GoogleHealthRollupTests(unittest.TestCase):
    def test_sleep_wake_date_respects_embedded_dst_offset(self):
        interval = {
            "startTime": "2026-05-02T23:58:00Z",
            "endTime": "2026-05-03T08:53:00Z",
            "endUtcOffset": "-14400s",
        }

        self.assertEqual(
            rollups._sleep_wake_date("2026-05-02", interval).isoformat(),
            "2026-05-03",
        )

    def test_sleep_rollup_keeps_naps_separate_from_main_sleep(self):
        cursor = RecordingCursor([
            ({"sleep": {
                "summary": {"minutesAsleep": 420, "minutesInSleepPeriod": 460, "stagesSummary": []},
                "interval": {"startTime": "2026-08-10T03:00:00Z", "endTime": "2026-08-10T11:00:00Z", "endUtcOffset": "-14400s"},
            }},),
            ({"sleep": {
                "summary": {"minutesAsleep": 45, "minutesInSleepPeriod": 60, "stagesSummary": []},
                "interval": {"startTime": "2026-08-10T18:00:00Z", "endTime": "2026-08-10T19:00:00Z", "endUtcOffset": "-14400s"},
            }},),
        ])

        self.assertEqual(rollups._rollup_sleep(cursor, "2026-08-01"), 1)
        _, params = cursor.calls[-1]
        self.assertEqual(params[1], 420)
        self.assertEqual(params[4], 45)

    def test_default_storage_mapping_preserves_the_legacy_contract(self):
        tables = rollups.LEGACY_ROLLUP_TABLES

        self.assertEqual(tables.raw_points, "universe.google_health_data_point")
        self.assertEqual({
            tables.activity_daily,
            tables.body_weight,
            tables.breathing_rate_daily,
            tables.exercise_log,
            tables.food_log_daily,
            tables.heart_rate_daily,
            tables.hrv_daily,
            tables.skin_temp_daily,
            tables.sleep_daily,
            tables.spo2_daily,
        }, {
            "universe.fitbit_activity_daily",
            "universe.fitbit_body_weight",
            "universe.fitbit_breathing_rate_daily",
            "universe.fitbit_exercise_log",
            "universe.fitbit_food_log_daily",
            "universe.fitbit_heart_rate_daily",
            "universe.fitbit_hrv_daily",
            "universe.fitbit_skin_temp_daily",
            "universe.fitbit_sleep_daily",
            "universe.fitbit_spo2_daily",
        })

    def test_storage_mapping_rejects_unqualified_or_unsafe_identifiers(self):
        for value in (
            "fitbit_activity_daily",
            "universe.fitbit_activity_daily; DROP TABLE universe.health_alert",
            "universe.\"fitbit_activity_daily\"",
            "Universe.fitbit_activity_daily",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                rollups.RollupStorageTables(activity_daily=value)

    def test_every_generated_upsert_uses_the_injected_storage_mapping(self):
        tables = rollups.RollupStorageTables(
            raw_points="capture.points",
            activity_daily="rollup.activity",
            body_weight="rollup.weight",
            breathing_rate_daily="rollup.breathing",
            exercise_log="rollup.exercise",
            food_log_daily="rollup.food",
            heart_rate_daily="rollup.heart_rate",
            hrv_daily="rollup.hrv",
            skin_temp_daily="rollup.skin_temp",
            sleep_daily="rollup.sleep",
            spo2_daily="rollup.spo2",
        )
        executed = []

        cursor = RecordingCursor()
        rollups._sql_rollups(cursor, "2026-08-01", tables)
        executed.extend(sql for sql, _ in cursor.calls)

        cursor = RecordingCursor([({
                "sleep": {
                    "summary": {
                        "minutesAsleep": 420,
                        "minutesInSleepPeriod": 460,
                        "stagesSummary": [],
                    },
                    "interval": {
                        "startTime": "2026-08-10T03:00:00Z",
                        "endTime": "2026-08-10T11:00:00Z",
                    },
                },
            },
        )])
        rollups._rollup_sleep(cursor, "2026-08-01", tables)
        executed.extend(sql for sql, _ in cursor.calls)

        cursor = RecordingCursor([(
            "users/me/dataTypes/weight/dataPoints/abc",
            {"weight": {
                "sampleTime": {
                    "physicalTime": "2026-08-10T12:00:00Z",
                    "utcOffset": "-14400s",
                },
                "weightGrams": 84_500,
            }},
        )])
        rollups._rollup_weight(cursor, "2026-08-01", tables)
        executed.extend(sql for sql, _ in cursor.calls)

        cursor = RecordingCursor([({"nutritionLog": {
            "interval": {
                "startTime": "2026-08-10T12:00:00Z",
                "endTime": "2026-08-10T12:10:00Z",
                "startUtcOffset": "-14400s",
                "endUtcOffset": "-14400s",
            },
            "energy": {"kcal": 500},
        }},)])
        rollups._rollup_food(cursor, "2026-08-01", tables)
        executed.extend(sql for sql, _ in cursor.calls)

        cursor = RecordingCursor([(
            "users/me/dataTypes/exercise/dataPoints/123",
            {
                "exercise": {
                    "interval": {
                        "startTime": "2026-08-10T13:00:00Z",
                        "startUtcOffset": "-14400s",
                    },
                    "displayName": "Walk",
                },
            },
        )])
        rollups._rollup_exercise(cursor, "2026-08-01", tables)
        executed.extend(sql for sql, _ in cursor.calls)

        civil_day = {"year": 2026, "month": 8, "day": 10}

        def post(url, **_kwargs):
            data_type = url.split("/dataTypes/", 1)[1].split("/", 1)[0]
            point = {"civilStartTime": {"date": civil_day}}
            point.update({
                "total-calories": {"totalCalories": {"kcalSum": 2000}},
                "active-minutes": {
                    "activeMinutes": {"activeMinutesRollupByActivityLevel": []},
                },
                "distance": {"distance": {"millimetersSum": 5000}},
                "floors": {"floors": {"countSum": 2}},
            }[data_type])
            return FakeResponse({"rollupDataPoints": [point]})

        cursor = RecordingCursor()
        with patch.object(rollups.requests, "post", side_effect=post):
            rollups._rollup_activity_daily("token", cursor, 1, tables)
        executed.extend(sql for sql, _ in cursor.calls)

        insert_targets = {
            sql.split("INSERT INTO", 1)[1].split(None, 1)[0]
            for sql in executed
            if "INSERT INTO" in sql
        }
        self.assertEqual(insert_targets, {
            tables.activity_daily,
            tables.body_weight,
            tables.breathing_rate_daily,
            tables.exercise_log,
            tables.food_log_daily,
            tables.heart_rate_daily,
            tables.hrv_daily,
            tables.skin_temp_daily,
            tables.sleep_daily,
            tables.spo2_daily,
        })
        rendered_sql = "\n".join(executed)
        self.assertIn("FROM capture.points", rendered_sql)
        self.assertNotIn("universe.fitbit_", rendered_sql)
        self.assertNotIn("CREATE TABLE", rendered_sql)
        self.assertNotIn("ALTER TABLE", rendered_sql)

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

    def test_raw_date_repair_can_skip_network_daily_rollups(self):
        connection = Connection()
        with (
            patch.object(rollups, "_sql_rollups"),
            patch.object(rollups, "_rollup_sleep", return_value=2),
            patch.object(rollups, "_rollup_food", return_value=3),
            patch.object(rollups, "_rollup_weight", return_value=4),
            patch.object(rollups, "_rollup_exercise", return_value=5),
            patch.object(rollups, "_rollup_activity_daily") as network_rollup,
        ):
            result = rollups.run_rollups(
                connection,
                "token",
                1000,
                include_network_activity=False,
            )

        network_rollup.assert_not_called()
        self.assertEqual(result["activity_skipped"], "disabled for raw-date repair")
        self.assertEqual(connection.commits, 1)

    def test_weight_rollup_uses_stable_negative_compatibility_id(self):
        cursor = WeightCursor()

        self.assertEqual(rollups._rollup_weight(cursor, "2026-08-01"), 1)

        _, params = cursor.calls[-1]
        self.assertLess(params[0], 0)
        self.assertEqual(params[1], "2026-08-10")
        self.assertEqual(params[2], "21:00:00")
        self.assertEqual(params[3], 84.5)
        self.assertEqual(params[4], rollups.MARK)

    def test_weight_rollup_preserves_google_civil_clock_time(self):
        cursor = RecordingCursor([(
            "users/me/dataTypes/weight/dataPoints/civil",
            {"weight": {
                "sampleTime": {
                    "physicalTime": "2026-08-11T01:15:00Z",
                    "civilTime": {
                        "date": {"year": 2026, "month": 8, "day": 10},
                        "time": {"hours": 21, "minutes": 15},
                    },
                },
                "weightGrams": 84_500,
            }},
        )])

        self.assertEqual(rollups._rollup_weight(cursor, "2026-08-01"), 1)

        _, params = cursor.calls[-1]
        self.assertEqual(params[1], "2026-08-10")
        self.assertEqual(params[2], "21:15:00")

    def test_food_rollup_splits_entries_by_google_civil_date_not_utc_date(self):
        def entry(local_day, start, kcal):
            return ({"nutritionLog": {
                "interval": {
                    "startTime": start,
                    "endTime": start,
                    "civilStartTime": {"date": local_day},
                    "civilEndTime": {"date": local_day},
                },
                "energy": {"kcal": kcal},
            }},)

        cursor = RecordingCursor([
            entry({"year": 2026, "month": 8, "day": 13}, "2026-08-14T01:00:00Z", 1600),
            entry({"year": 2026, "month": 8, "day": 14}, "2026-08-14T12:00:00Z", 1635),
        ])

        self.assertEqual(rollups._rollup_food(cursor, "2026-08-01"), 2)
        inserts = [
            params for sql, params in cursor.calls
            if "INSERT INTO universe.fitbit_food_log_daily" in sql
        ]
        self.assertEqual([(params[0], params[1]) for params in inserts], [
            ("2026-08-13", 1600),
            ("2026-08-14", 1635),
        ])


if __name__ == "__main__":
    unittest.main()
