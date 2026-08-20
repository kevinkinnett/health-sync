import unittest
from datetime import date

import requests

from google_health_capture import (
    CaptureError,
    GoogleHealthApi,
    Page,
    _bounded_windows,
    capture_types,
)


class Response:
    def __init__(self, status_code=200, body=None, text=""):
        self.status_code = status_code
        self._body = body or {}
        self.text = text

    def json(self):
        return self._body


class GoogleHealthCaptureTests(unittest.TestCase):
    def test_api_passes_page_token_and_maps_response(self):
        calls = []

        class Session:
            @staticmethod
            def get(url, **kwargs):
                calls.append((url, kwargs))
                return Response(body={"dataPoints": [{"name": "p"}], "nextPageToken": "next"})

        page = GoogleHealthApi("secret", Session).fetch_page(
            "steps", "prior", 'steps.interval.civil_start_time >= "2026-08-01"'
        )
        self.assertEqual(page, Page([{"name": "p"}], "next"))
        self.assertEqual(calls[0][1]["params"], {
            "pageSize": 1000,
            "pageToken": "prior",
            "filter": 'steps.interval.civil_start_time >= "2026-08-01"',
        })
        self.assertEqual(calls[0][1]["headers"], {"Authorization": "Bearer secret"})

    def test_api_normalizes_transport_and_http_failures(self):
        class TimeoutSession:
            @staticmethod
            def get(*_args, **_kwargs):
                raise requests.Timeout("slow")

        with self.assertRaisesRegex(CaptureError, "request failed"):
            GoogleHealthApi("token", TimeoutSession).fetch_page("steps")

        class BadSession:
            @staticmethod
            def get(*_args, **_kwargs):
                return Response(503, text="unavailable")

        with self.assertRaisesRegex(CaptureError, "503"):
            GoogleHealthApi("token", BadSession).fetch_page("steps")

    def test_capture_respects_page_budget_and_isolates_type_failures(self):
        class Api:
            calls = []

            def fetch_page(self, data_type, token=None, point_filter=None):
                self.calls.append((data_type, token, point_filter))
                if data_type == "broken":
                    raise CaptureError("failed")
                return Page([{"id": len(self.calls)}], "more")

        class Store:
            pages = []

            def upsert_page(self, data_type, points):
                self.pages.append((data_type, points))
                return len(points)

        api, store = Api(), Store()
        result = capture_types(api, store, ["steps", "broken"], max_pages=2)
        self.assertEqual(result, {
            "steps": {"points": 2, "pages": 2, "truncated": True},
            "broken": {"error": "failed", "points": 0, "pages": 0},
        })
        self.assertEqual([call[0] for call in api.calls], ["steps", "steps", "broken"])

    def test_capture_applies_a_shape_specific_closed_open_filter(self):
        class Api:
            calls = []

            def fetch_page(self, data_type, token=None, point_filter=None):
                self.calls.append((data_type, point_filter))
                return Page([], None)

        class Store:
            @staticmethod
            def upsert_page(_data_type, points):
                return len(points)

        api = Api()
        result = capture_types(
            api,
            Store(),
            ["nutrition-log", "weight", "sleep"],
            max_pages=5,
            start_date=date(2026, 8, 12),
            end_date=date(2026, 8, 16),
        )

        self.assertEqual(result["nutrition-log"]["truncated"], False)
        filters = dict(api.calls)
        self.assertIn("nutrition_log.interval.civil_start_time", filters["nutrition-log"])
        self.assertIn("weight.sample_time.civil_time", filters["weight"])
        self.assertIn("sleep.interval.civil_end_time", filters["sleep"])

    def test_historical_capture_is_split_at_google_query_limit_newest_first(self):
        windows = _bounded_windows(date(2026, 1, 1), date(2026, 8, 16))

        self.assertEqual(windows[0], (date(2026, 5, 18), date(2026, 8, 16)))
        self.assertEqual(windows[-1], (date(2026, 1, 1), date(2026, 2, 17)))
        self.assertTrue(all((end - start).days <= 90 for start, end in windows))

    def test_page_budget_applies_to_each_bounded_window(self):
        class Api:
            calls = []

            def fetch_page(self, data_type, token=None, point_filter=None):
                self.calls.append((data_type, point_filter))
                return Page([], None)

        class Store:
            @staticmethod
            def upsert_page(_data_type, points):
                return len(points)

        api = Api()
        result = capture_types(
            api,
            Store(),
            ["steps"],
            max_pages=1,
            start_date=date(2026, 1, 1),
            end_date=date(2026, 8, 16),
        )

        self.assertEqual(result["steps"]["windows"], 3)
        self.assertEqual(result["steps"]["pages"], 3)
        self.assertEqual(len(api.calls), 3)
