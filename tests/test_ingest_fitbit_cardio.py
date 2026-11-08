"""Tests for the Fitbit cardio-fitness (VO2 max) ingest.

``wmill`` and the ``u.kevin.*`` workspace imports are stubbed with local
modules, and psycopg is stubbed when absent (CI installs only
requirements-test.txt), as in test_ingest_audit_fixes.
"""

import json
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
if not hasattr(_psycopg, "Connection"):
    _psycopg.Connection = object
if not hasattr(_psycopg, "connect"):
    _psycopg.connect = None

import ingest_common  # noqa: E402

sys.modules.setdefault("wmill", types.ModuleType("wmill"))
for _name in ("u", "u.kevin"):
    _pkg = types.ModuleType(_name)
    _pkg.__path__ = []
    sys.modules.setdefault(_name, _pkg)
sys.modules.setdefault("u.kevin.ingest_common", ingest_common)

import ingest_fitbit_cardio as cardio  # noqa: E402


class FakeResponse:
    def __init__(self, status, body, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class DateChunksTest(unittest.TestCase):
    def test_spans_are_closed_contiguous_and_capped_at_30_days(self):
        spans = cardio.date_chunks(date(2026, 6, 12), date(2026, 8, 20))
        self.assertEqual(spans[0], (date(2026, 6, 12), date(2026, 7, 11)))
        self.assertEqual(spans[-1][1], date(2026, 8, 20))
        for (s, e), (s2, _) in zip(spans, spans[1:]):
            self.assertEqual((s2 - e).days, 1)
        self.assertTrue(all((e - s).days + 1 <= 30 for s, e in spans))

    def test_single_day(self):
        self.assertEqual(cardio.date_chunks(date(2026, 10, 24), date(2026, 10, 24)),
                         [(date(2026, 10, 24), date(2026, 10, 24))])


class ParseCardioTest(unittest.TestCase):
    def test_keeps_range_string_and_marks_source(self):
        rows = cardio.parse_cardio([{"dateTime": "2026-10-24", "value": {"vo2Max": "43-47"}}])
        self.assertEqual(rows[0][:2], ("2026-10-24", "43-47"))
        self.assertEqual(json.loads(rows[0][2])["_src"], "fitbit_web_api")

    def test_single_number_becomes_text_and_missing_value_is_null(self):
        rows = cardio.parse_cardio([
            {"dateTime": "2026-10-23", "value": {"vo2Max": 44.6}},
            {"dateTime": "2026-10-22", "value": {}},
            {"value": {"vo2Max": "40-44"}},  # no date: skipped
        ])
        self.assertEqual([(r[0], r[1]) for r in rows], [("2026-10-23", "44.6"), ("2026-10-22", None)])


class TokenRefreshTest(unittest.TestCase):
    def test_rotated_refresh_token_is_saved_before_use(self):
        saved = []
        creds = {"client_id": "id", "client_secret": "s", "refresh_token": "old", "expires_at": 0}

        class Session:
            def post(self, *a, **k):
                return FakeResponse(200, {"access_token": "new-at", "refresh_token": "new-rt", "expires_in": 28800})

        with patch.object(cardio.wmill, "get_resource", lambda _p: dict(creds), create=True), \
             patch.object(cardio.wmill, "set_resource", lambda p, c, resource_type=None: saved.append((p, dict(c))), create=True):
            out = cardio.fitbit_creds("u/kevin/fitbit_oauth", session=Session())

        self.assertEqual(out["access_token"], "new-at")
        self.assertEqual(saved[0][0], "u/kevin/fitbit_oauth")
        self.assertEqual(saved[0][1]["refresh_token"], "new-rt")

    def test_live_token_is_not_refreshed(self):
        creds = {"access_token": "live", "expires_at": 10**12}

        class Session:
            def post(self, *a, **k):
                raise AssertionError("must not refresh a live token")

        with patch.object(cardio.wmill, "get_resource", lambda _p: dict(creds), create=True):
            self.assertEqual(cardio.fitbit_creds("x", session=Session())["access_token"], "live")


class FakeConn:
    def __init__(self):
        self.updates = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def rollback(self):
        pass


class MainStatusTest(unittest.TestCase):
    def _run(self, fetch, **kwargs):
        conn = FakeConn()
        with patch.object(cardio.wmill, "get_resource", lambda _p: {}, create=True), \
             patch.object(cardio, "conn_kwargs", lambda _r: {}), \
             patch.object(cardio.psycopg, "connect", lambda **_k: conn, create=True), \
             patch.object(cardio, "create_ingest_run", lambda *_a: 7), \
             patch.object(cardio, "update_ingest_run", lambda c, rid, st, n, e, d: conn.updates.append((st, n, e, d))), \
             patch.object(cardio, "fitbit_creds", lambda _p: {"access_token": "t"}), \
             patch.object(cardio, "fetch_span", fetch), \
             patch.object(cardio, "upsert_rows", lambda _c, rows: len(rows)), \
             patch.object(cardio, "local_today", lambda: date(2026, 10, 25)):
            try:
                result = cardio.main(**kwargs)
            except RuntimeError as exc:
                result = exc
        return conn.updates[-1], result

    def test_backfill_walks_every_span_and_reports_latest_value(self):
        seen = []

        def fetch(_c, s, e):
            seen.append((s, e))
            return [{"dateTime": e.isoformat(), "value": {"vo2Max": "43-47"}}]

        (status, written, errs, details), _ = self._run(fetch, backfill_from="2026-06-12")
        self.assertEqual(status, "completed")
        self.assertEqual(seen[0][0], date(2026, 6, 12))
        self.assertEqual(seen[-1][1], date(2026, 10, 25))
        self.assertEqual(written, len(seen))
        self.assertEqual(details["latest_value_date"], "2026-10-25")

    def test_one_failing_span_is_partial_not_fatal(self):
        def fetch(_c, s, _e):
            if s == date(2026, 6, 12):
                raise RuntimeError("HTTP 500")
            return [{"dateTime": s.isoformat(), "value": {"vo2Max": "43-47"}}]

        (status, written, errs, _), _ = self._run(fetch, backfill_from="2026-06-12")
        self.assertEqual(status, "partial")
        self.assertEqual(errs, 1)
        self.assertGreater(written, 0)

    def test_everything_failing_raises_so_windmill_marks_the_job_failed(self):
        def fetch(*_a):
            raise RuntimeError("HTTP 401")

        (status, written, _, _), result = self._run(fetch)
        self.assertEqual((status, written), ("failed", 0))
        self.assertIsInstance(result, RuntimeError)


if __name__ == "__main__":
    unittest.main()
