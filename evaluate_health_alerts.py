"""
Windmill scheduled script — proactive health-alert evaluation + push.

Runs daily (after the morning Fitbit sync). It asks the dashboard to
run anomaly detection over the recovery signals, then forwards any
NEWLY-created alerts to Apprise so they reach the phone before you'd
otherwise open the app.

Why this lives in Windmill (not a node cron inside the server): the
ingest already runs here on a schedule, the workers are on the Tailnet
(so they can reach both the dashboard and Apprise), and keeping the
schedule observable next to the ingest jobs is the established pattern.

Detection + dedup/cooldown live server-side (POST /api/alerts/evaluate
returns ONLY alerts created this run), so this script just fans the
new ones out to Apprise — no risk of re-pushing a persisting condition.

Activation checklist:
  1. Deploy the dashboard build that includes /api/alerts/* .
  2. Configure your Apprise key's targets (the `apprise_url` default
     points at the "health" key) at https://apprise.tail322ce1.ts.net/.
  3. Enable this script's schedule.
"""

import requests


def main(
    dashboard_url: str = "https://health-sync.tail322ce1.ts.net",
    apprise_url: str = "https://apprise.tail322ce1.ts.net/notify/health",
    push_severities: list = ["alert", "warn"],
):
    # 1. Trigger detection. The server persists new alerts (with a
    #    per-kind cooldown) and returns only what it just created.
    resp = requests.post(f"{dashboard_url}/api/alerts/evaluate", timeout=120)
    resp.raise_for_status()
    created = resp.json().get("created", [])

    # 2. Forward the new high-severity ones to Apprise.
    pushed = 0
    failed = 0
    for alert in created:
        if alert.get("severity") not in push_severities:
            continue
        title = f"\U0001fa7a {alert.get('title', 'Health alert')}"  # 🩺
        body = alert.get("detail", "")
        # Apprise notification "type" maps to the icon/colour it renders.
        apprise_type = "failure" if alert.get("severity") == "alert" else "warning"
        try:
            push = requests.post(
                apprise_url,
                json={"title": title, "body": body, "type": apprise_type},
                timeout=30,
            )
            push.raise_for_status()
            pushed += 1
        except Exception as exc:  # noqa: BLE001 - log + continue, don't abort the run
            print(f"Apprise push failed for alert {alert.get('id')}: {exc}")
            failed += 1

    summary = {"created": len(created), "pushed": pushed, "failed": failed}
    print(summary)
    return summary
