"""Regression tests for the 2026-10 ingest audit findings.

The Windmill entry points import ``wmill`` and ``u.kevin.*`` workspace
modules, neither of which exists locally. They are stubbed below with the
local modules of the same name so ``main()`` can run against fake DB/HTTP
collaborators. CI installs only requirements-test.txt, so ``psycopg`` is
stubbed too when absent; every test patches ``psycopg.connect`` anyway.
"""

import re
import sys
import types
import unittest
from datetime import date
from unittest.mock import patch

try:
    import psycopg as _psycopg
except ModuleNotFoundError:
    _psycopg = types.ModuleType("psycopg")
    sys.modules["psycopg"] = _psycopg
# Another test module may already have registered a BARE psycopg stub
# (unittest discovery imports test_health_data_invariants first), so fill
# in what ingest_common needs at import time rather than trusting it.
if not hasattr(_psycopg, "Connection"):
    _psycopg.Connection = object
if not hasattr(_psycopg, "connect"):
    _psycopg.connect = None

import eight_sleep_points  # noqa: E402
import google_health_capture  # noqa: E402
import google_health_points  # noqa: E402
import google_health_rollups  # noqa: E402
import google_health_temporal  # noqa: E402
import ingest_common  # noqa: E402
from google_health_capture import Page, RawPointStore, capture_types  # noqa: E402


def _install_windmill_stubs():
    sys.modules.setdefault("wmill", types.ModuleType("wmill"))
    for name in ("u", "u.kevin"):
        package = types.ModuleType(name)
        package.__path__ = []
        sys.modules.setdefault(name, package)
    for module in (
        eight_sleep_points,
        google_health_capture,
        google_health_points,
        google_health_rollups,
        google_health_temporal,
        ingest_common,
    ):
        sys.modules.setdefault(f"u.kevin.{module.__name__}", module)


_install_windmill_stubs()

import evaluate_health_alerts  # noqa: E402
import ingest_eight_sleep  # noqa: E402
import ingest_google_health  # noqa: E402


class RecordingCursor:
    def __init__(self, rows=(), one=None):
        self.rows = list(rows)
        self.one = one
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.one


class Connection:
    def __init__(self, cursor=None):
        self._cursor = cursor or RecordingCursor()
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return self._cursor

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False


def _normalized(sql):
    return " ".join(sql.split())


# ---------------------------------------------------------------------------
# Finding 1: dailyRollUp failure must not be reported as 'completed'
# ---------------------------------------------------------------------------


class NetworkRollupFailureStatusTests(unittest.TestCase):
    def _run_main(self, rolled):
        finalized = []

        class Writer:
            def __init__(self, *_args):
                pass

            @staticmethod
            def write(*_args):
                return rolled

        captured = {"steps": {"points": 7, "pages": 1, "truncated": False}}
        with (
            patch.object(ingest_google_health, "google_access_token", return_value="t"),
            patch.object(ingest_google_health.wmill, "get_resource", create=True,
                         return_value={"host": "h", "user": "u", "password": "p", "dbname": "d"}),
            patch.object(ingest_google_health.psycopg, "connect", return_value=Connection()),
            patch.object(ingest_google_health, "RawPointStore"),
            patch.object(ingest_google_health, "create_ingest_run", return_value=42),
            patch.object(ingest_google_health, "capture_raw", return_value=(captured, [])),
            patch.object(ingest_google_health, "GoogleHealthRollupWriter", Writer),
            patch.object(ingest_google_health, "update_ingest_run",
                         side_effect=lambda *args: finalized.append(args)),
        ):
            result = ingest_google_health.main(write_daily=True)
        return result, finalized

    def test_activity_rollup_error_marks_run_partial(self):
        result, finalized = self._run_main({
            "since": "2026-09-01", "sleep_days": 3,
            "activity_error": "403 Client Error: Forbidden",
        })

        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["errors"], 1)
        _conn, run_id, status, _rows, errors, _details = finalized[0]
        self.assertEqual((run_id, status, errors), (42, "partial", 1))

    def test_clean_rollup_still_completes(self):
        result, finalized = self._run_main({"since": "2026-09-01", "activity_days": 45})

        self.assertEqual(result["status"], "ok")
        self.assertEqual(finalized[0][2], "completed")


# ---------------------------------------------------------------------------
# Finding 2: points deleted in the Fitbit app must leave the raw store
# ---------------------------------------------------------------------------


class ReconcilingStore:
    """Fake RawPointStore: keys are the fake points' ``name``."""

    def __init__(self):
        self.deletes = []

    @staticmethod
    def upsert_page(_data_type, points, seen_keys=None):
        if seen_keys is not None:
            seen_keys.update(point["name"] for point in points)
        return len(points)

    def delete_missing(self, data_type, start, end, seen_keys):
        self.deletes.append((data_type, start, end, set(seen_keys)))
        return 1


class CaptureDeletionReconciliationTests(unittest.TestCase):
    def test_only_windows_paged_to_completion_are_reconciled(self):
        # 2026-01-01..2026-08-16 splits into three <=90-day windows, newest
        # first. The newest finishes in one page; the middle hits the page cap
        # (its older points were never seen); the oldest errors.
        class Api:
            def fetch_page(self, data_type, token=None, point_filter=None):
                if '>= "2026-05-18"' in point_filter:
                    return Page([{"name": "new-1"}, {"name": "new-2"}], None)
                if '>= "2026-02-17"' in point_filter:
                    return Page([{"name": "mid-1"}], "more")
                raise google_health_capture.CaptureError("503")

        store = ReconcilingStore()
        result = capture_types(
            Api(), store, ["nutrition-log"], max_pages=1,
            start_date=date(2026, 1, 1), end_date=date(2026, 8, 16),
        )

        self.assertEqual(store.deletes, [(
            "nutrition-log", date(2026, 5, 18), date(2026, 8, 16), {"new-1", "new-2"},
        )])
        self.assertEqual(result["nutrition-log"]["deleted"], 1)

    def test_truncated_window_is_never_reconciled(self):
        class Api:
            @staticmethod
            def fetch_page(*_args):
                return Page([{"name": "p"}], "more")

        store = ReconcilingStore()
        result = capture_types(
            Api(), store, ["sleep"], max_pages=2,
            start_date=date(2026, 10, 13), end_date=date(2026, 10, 17),
        )

        self.assertEqual(store.deletes, [])
        self.assertTrue(result["sleep"]["truncated"])

    def test_guard_refusal_is_reported_and_counts_as_a_run_error(self):
        class Api:
            @staticmethod
            def fetch_page(*_args):
                return Page([], None)

        class GuardedStore(ReconcilingStore):
            @staticmethod
            def delete_missing(*_args):
                return None

        result = capture_types(
            Api(), GuardedStore(), ["steps"], max_pages=2,
            start_date=date(2026, 10, 13), end_date=date(2026, 10, 17),
        )

        self.assertEqual(result["steps"]["delete_guarded_windows"], [
            {"start": "2026-10-13", "end_exclusive": "2026-10-17"},
        ])
        self.assertEqual(ingest_google_health.count_errors(result, {}), 1)

    def test_upsert_records_the_persisted_point_key(self):
        cursor = RecordingCursor()
        seen = set()
        point = {
            "name": "users/me/dataTypes/weight/dataPoints/abc",
            "weight": {
                "sampleTime": {"physicalTime": "2026-10-14T12:00:00Z", "utcOffset": "-14400s"},
                "weightGrams": 84_500,
            },
        }

        RawPointStore(Connection(cursor)).upsert_page("weight", [point], seen)

        self.assertEqual(seen, {"users/me/dataTypes/weight/dataPoints/abc"})
        self.assertEqual(cursor.calls[0][1][1], "users/me/dataTypes/weight/dataPoints/abc")

    def test_delete_is_scoped_to_window_civil_dates_and_unseen_keys(self):
        cursor = RecordingCursor(one=(2,))
        connection = Connection(cursor)

        deleted = RawPointStore(connection).delete_missing(
            "nutrition-log", date(2026, 10, 13), date(2026, 10, 17), {"kept"},
        )

        self.assertEqual(deleted, 2)
        sql, params = cursor.calls[-1]
        sql = _normalized(sql)
        self.assertTrue(sql.startswith("DELETE FROM universe.google_health_data_point"))
        self.assertIn("point_date >= %s AND point_date < %s", sql)
        self.assertIn("NOT (point_key = ANY(%s))", sql)
        data_type, start, end, bases, keys = params
        self.assertEqual((data_type, start, end, keys),
                         ("nutrition-log", date(2026, 10, 13), date(2026, 10, 17), ["kept"]))
        # Fallback-dated rows may disagree with Google's civil filter by a day.
        self.assertNotIn("configured_timezone_start", bases)
        self.assertNotIn("google_start_offset", bases)
        self.assertIn("google_civil_start", bases)
        self.assertEqual(connection.commits, 1)

    def test_delete_guard_refuses_a_window_that_returned_almost_nothing(self):
        cursor = RecordingCursor(one=(900,))

        deleted = RawPointStore(Connection(cursor)).delete_missing(
            "steps", date(2026, 10, 13), date(2026, 10, 17), set(),
        )

        self.assertIsNone(deleted)
        self.assertFalse(any(sql.lstrip().startswith("DELETE") for sql, _ in cursor.calls))

    def test_weight_rollup_drops_google_rows_whose_raw_point_was_deleted(self):
        cursor = RecordingCursor([(
            "users/me/dataTypes/weight/dataPoints/abc",
            {"weight": {
                "sampleTime": {"physicalTime": "2026-10-14T12:00:00Z", "utcOffset": "-14400s"},
                "weightGrams": 84_500,
            }},
        )])

        google_health_rollups._rollup_weight(cursor, "2026-10-01")

        deletes = [(sql, p) for sql, p in cursor.calls if "DELETE FROM" in sql]
        self.assertEqual(len(deletes), 1)
        sql, params = deletes[0]
        self.assertIn("source='google_health'", sql)
        inserted_id = cursor.calls[-1][1][0]
        self.assertEqual(params, ("2026-10-01", [inserted_id]))

    def test_exercise_rollup_drops_google_rows_whose_raw_point_was_deleted(self):
        cursor = RecordingCursor([(
            "users/me/dataTypes/exercise/dataPoints/123",
            {"exercise": {
                "interval": {"startTime": "2026-10-14T13:00:00Z", "startUtcOffset": "-14400s"},
                "displayName": "Walk",
            }},
        )])

        google_health_rollups._rollup_exercise(cursor, "2026-10-01")

        deletes = [(sql, p) for sql, p in cursor.calls if "DELETE FROM" in sql]
        self.assertEqual(len(deletes), 1)
        sql, params = deletes[0]
        # Legacy Fitbit rows (no Google payload) are never pruned.
        self.assertIn("raw_jsonb->'exercise' IS NOT NULL", sql)
        self.assertEqual(params, ("2026-10-01", [123]))


# ---------------------------------------------------------------------------
# Finding 3: one failed Eight Sleep upsert must not poison the run
# ---------------------------------------------------------------------------


class AbortingConnection(Connection):
    """psycopg semantics: a failed statement aborts until rollback()."""

    def __init__(self):
        super().__init__()
        self.aborted = False

    def execute(self):
        if self.aborted:
            raise RuntimeError("InFailedSqlTransaction")

    def rollback(self):
        super().rollback()
        self.aborted = False


class EightSleepRollbackTests(unittest.TestCase):
    def _run(self, conn, update_state=None):
        finalized = []
        written = []

        def upsert_day(c, day, _tz):
            c.execute()
            if day.get("bad"):
                c.aborted = True
                raise ValueError("numeric field overflow")
            written.append(day["day"])
            return 1

        def default_update_state(c, *_args):
            c.execute()

        def finalize(c, run_id, status, rows, errors, details):
            c.execute()
            finalized.append((run_id, status, rows, errors, details))

        class Client:
            user_id = "u1"

            def __init__(self, *_args):
                pass

            @staticmethod
            def get(_path):
                return {"user": {"userId": "u1"}}

        days = [{"day": "2026-10-10"}, {"day": "2026-10-11", "bad": True},
                {"day": "2026-10-12"}, {"day": "2026-10-13"}]
        with (
            patch.object(ingest_eight_sleep.wmill, "get_variable", create=True, return_value="x"),
            patch.object(ingest_eight_sleep, "EightClient", Client),
            patch.object(ingest_eight_sleep.psycopg, "connect", return_value=conn),
            patch.object(ingest_eight_sleep, "ensure_tables"),
            patch.object(ingest_eight_sleep, "get_state", return_value={"latest_session_date": "x"}),
            patch.object(ingest_eight_sleep, "create_ingest_run", return_value=7),
            patch.object(ingest_eight_sleep, "fetch_trends", return_value=days),
            patch.object(ingest_eight_sleep, "upsert_day", upsert_day),
            patch.object(ingest_eight_sleep, "local_wake_date", lambda day, _tz: day["day"]),
            patch.object(ingest_eight_sleep, "update_state", update_state or default_update_state),
            patch.object(ingest_eight_sleep, "update_ingest_run", finalize),
            patch("builtins.print"),  # the script prints a non-cp1252 arrow
        ):
            try:
                result = ingest_eight_sleep.main(
                    db={"host": "h", "user": "u", "password": "p", "dbname": "d"},
                    recent_days=0,
                )
            except Exception as exc:  # noqa: BLE001
                result = exc
        return result, written, finalized

    def test_bad_night_is_rolled_back_and_later_nights_still_land(self):
        conn = AbortingConnection()

        result, written, finalized = self._run(conn)

        self.assertEqual(written, ["2026-10-10", "2026-10-12", "2026-10-13"])
        self.assertEqual(result["status"], "partial")
        self.assertEqual(result["errors"], 1)
        self.assertEqual(finalized[0][:4], (7, "partial", 3, 1))

    def test_crash_while_finalizing_still_closes_the_running_row(self):
        conn = AbortingConnection()

        def broken_update_state(c, *_args):
            c.aborted = True
            raise ValueError("state upsert failed")

        result, _written, finalized = self._run(conn, broken_update_state)

        self.assertIsInstance(result, ValueError)
        self.assertEqual(len(finalized), 1)
        self.assertEqual(finalized[0][1], "failed")


# ---------------------------------------------------------------------------
# Finding 4: a failed alert push must fail the Windmill job
# ---------------------------------------------------------------------------


class AlertPushFailureTests(unittest.TestCase):
    class Response:
        def __init__(self, body=None, ok=True):
            self._body = body or {}
            self._ok = ok

        def raise_for_status(self):
            if not self._ok:
                raise RuntimeError("502 Bad Gateway")

        def json(self):
            return self._body

    def _post(self, push_ok):
        pushes = []

        def post(url, **kwargs):
            if url.endswith("/api/alerts/evaluate"):
                return self.Response({"created": [
                    {"id": 1, "severity": "alert", "title": "Low HRV"},
                    {"id": 2, "severity": "warn", "title": "Ingest stale"},
                ]})
            pushes.append(kwargs["json"]["title"])
            return self.Response(ok=push_ok(len(pushes)))

        return post, pushes

    def test_failed_push_fails_the_job_after_trying_every_alert(self):
        post, pushes = self._post(lambda n: n != 1)

        with patch.object(evaluate_health_alerts.requests, "post", post):
            with self.assertRaisesRegex(RuntimeError, "1 of 2"):
                evaluate_health_alerts.main()

        self.assertEqual(len(pushes), 2)

    def test_all_pushes_delivered_returns_summary(self):
        post, _pushes = self._post(lambda _n: True)

        with patch.object(evaluate_health_alerts.requests, "post", post):
            summary = evaluate_health_alerts.main()

        self.assertEqual((summary["pushed"], summary["failed"]), (2, 0))


# ---------------------------------------------------------------------------
# Findings 5 & 6: rollup ON CONFLICT clauses
# ---------------------------------------------------------------------------


def _conflict_assignments(sql):
    """Map column -> expression from an ON CONFLICT ... DO UPDATE SET clause."""
    body = _normalized(re.sub(r"--[^\n]*", "", sql)).split("DO UPDATE SET", 1)[1]
    body = body.split(" WHERE ", 1)[0]
    assignments, depth, current = {}, 0, ""
    for char in body + ",":
        if char == "," and depth == 0:
            column, expression = current.split("=", 1)
            assignments[column.strip()] = expression.strip()
            current = ""
            continue
        depth += {"(": 1, ")": -1}.get(char, 0)
        current += char
    return assignments


class RollupConflictClauseTests(unittest.TestCase):
    def test_native_hrv_only_relabels_rows_whose_rmssd_it_supplied(self):
        cursor = RecordingCursor()
        google_health_rollups._sql_rollups(cursor, "2026-10-01")
        native = next(sql for sql, _ in cursor.calls
                      if "data_type='daily-heart-rate-variability'" in sql)

        marker = _conflict_assignments(native)["raw_jsonb"]

        self.assertNotEqual(marker, "EXCLUDED.raw_jsonb")
        self.assertRegex(
            marker,
            r"^CASE WHEN EXCLUDED\.daily_rmssd IS NOT NULL THEN EXCLUDED\.raw_jsonb "
            r"ELSE fitbit_hrv_daily\.raw_jsonb END$",
        )

    def test_exercise_edit_moves_date_start_and_name(self):
        cursor = RecordingCursor([(
            "users/me/dataTypes/exercise/dataPoints/123",
            {"exercise": {
                "interval": {"startTime": "2026-10-14T13:00:00Z", "startUtcOffset": "-14400s"},
                "displayName": "Run",
            }},
        )])
        google_health_rollups._rollup_exercise(cursor, "2026-10-01")
        insert = next(sql for sql, _ in cursor.calls if "INSERT INTO" in sql)

        assignments = _conflict_assignments(insert)

        self.assertEqual(assignments["date"], "EXCLUDED.date")
        self.assertEqual(assignments["start_time"], "EXCLUDED.start_time")
        self.assertEqual(assignments["activity_name"], "EXCLUDED.activity_name")


if __name__ == "__main__":
    unittest.main()
