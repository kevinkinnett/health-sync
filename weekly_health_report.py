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

import requests


def main(
    dashboard_url: str = "https://health-sync.tail322ce1.ts.net",
    apprise_url: str = "https://apprise.tail322ce1.ts.net/notify/health",
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
        try:
            requests.post(
                apprise_url,
                json={
                    "title": "\U0001fa7a Weekly health report",  # 🩺
                    "body": "Your weekly AI insights are generating — open the dashboard in a few minutes to read them.",
                    "type": "info",
                },
                timeout=30,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"Apprise notify failed: {exc}")

    print({"jobId": job.get("jobId")})
    return {"jobId": job.get("jobId")}
