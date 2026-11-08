"""
Windmill scheduled script — weekly AI health report.

Kicks off the dashboard's multi-category AI insight generation on a
schedule (Mondays) instead of only when you press the button, and pings
Apprise so you know a fresh report is ready to read.

The generation itself (the agentic per-category loop) runs inside the
dashboard via the existing POST /api/insights/generate — this script is
just the scheduled trigger + a heads-up notification.

Activation: enable this script's schedule once the dashboard is
deployed and your Apprise key is configured (see
evaluate_health_alerts.py for the Apprise setup notes).
"""

import urllib.parse

import requests

try:
    from u.kevin.notify import send  # shared Windmill helper on claw (not in this repo)
except ImportError:  # outside Windmill, e.g. unit tests (they patch `send`)
    def send(*_args, **_kwargs):
        raise RuntimeError("u/kevin/notify is only available inside Windmill on claw")


def main(
    dashboard_url: str = "https://health-sync.tail322ce1.ts.net",
    # Keyed `apprise`; ?tag=health scopes to the health target in the
    # shared Apprise config (see evaluate_health_alerts.py).
    apprise_url: str = "https://apprise.tail322ce1.ts.net/notify/apprise?tag=health",
    notify: bool = True,
):
    # Kick off generation (returns immediately with a job id; the
    # categories generate in the background and persist when done).
    resp = requests.post(
        f"{dashboard_url}/api/insights/generate",
        json={},
        timeout=60,
    )
    resp.raise_for_status()
    job = resp.json()

    if notify:
        # Via claw's notify-relay (u/kevin/notify, 2026-11-08); only the ?tag= of apprise_url is used.
        tag = (urllib.parse.parse_qs(urllib.parse.urlsplit(apprise_url or "").query).get("tag") or ["health"])[0]
        r = send("🩺 Weekly health report",  # health emoji
                 "Your weekly AI insights are generating - open the dashboard in a few minutes to read them.",
                 tags=tag, type="info", source="weekly_health_report", expect="9d")
        if not r["sent"]:
            print(f"notify failed: {r['detail']}")

    print({"jobId": job.get("jobId")})
    return {"jobId": job.get("jobId")}
