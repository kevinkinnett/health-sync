import unittest

import requests

from google_health_capture import CaptureError, GoogleHealthApi, Page, capture_types


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

        page = GoogleHealthApi("secret", Session).fetch_page("steps", "prior")
        self.assertEqual(page, Page([{"name": "p"}], "next"))
        self.assertEqual(calls[0][1]["params"], {"pageSize": 1000, "pageToken": "prior"})
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

            def fetch_page(self, data_type, token=None):
                self.calls.append((data_type, token))
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
        self.assertEqual(result, {"steps": {"points": 2}, "broken": {"error": "failed"}})
        self.assertEqual([call[0] for call in api.calls], ["steps", "steps", "broken"])
