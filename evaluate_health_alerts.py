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

DELIVERY IS CONTROLLED FROM THE DASHBOARD. The evaluate response carries
a `delivery` policy (pushEnabled / pushSeverities / appriseUrl) sourced
from Settings → Notifications, so this script honours the UI without any
Windmill edits. The `apprise_url` / `push_severities` args are only a
fallback for an older server that doesn't return a policy.

Activation checklist:
  1. Deploy the dashboard build that includes /api/alerts/* + /api/settings/*.
  2. Register your Apprise key's target (Settings → Notifications has a
     "Send test" button to verify) at https://apprise.tail322ce1.ts.net/.
  3. Enable this script's schedule.
"""

import requests


def main(
    dashboard_url: str = "https://health-sync.tail322ce1.ts.net",
    # Apprise config is keyed `apprise`; ?tag=health scopes delivery to the
    # health target only (not the finance/security/discord targets in the
    # same shared config). The dashboard's delivery policy overrides this.
    apprise_url: str = "https://apprise.tail322ce1.ts.net/notify/apprise?tag=health",
    push_severities: list = ["alert", "warn"],
):
    # 1. Trigger detection. The server persists new alerts (with a
    #    per-kind cooldown) and returns only what it just created, along
    #    with the delivery policy from the user's notification settings.
    resp = requests.post(f"{dashboard_url}/api/alerts/evaluate", timeout=120)
    resp.raise_for_status()
    data = resp.json()
    created = data.get("created", [])

    # Delivery policy from the dashboard UI; fall back to this script's
    # args if an older server build doesn't return one.
    delivery = data.get("delivery") or {}
    push_enabled = delivery.get("pushEnabled", True)
    severities = delivery.get("pushSeverities") or push_severities
    target = delivery.get("appriseUrl") or apprise_url

    # 2. Forward the new high-severity ones to Apprise — unless push is
    #    switched off in settings.
    pushed = 0
    failed = 0
    skipped = 0
    for alert in created:
        if not push_enabled or alert.get("severity") not in severities:
            skipped += 1
            continue
        title = f"\U0001fa7a {alert.get('title', 'Health alert')}"  # 🩺
        body = alert.get("detail", "")
        # Apprise notification "type" maps to the icon/colour it renders.
        apprise_type = "failure" if alert.get("severity") == "alert" else "warning"
        try:
            push = requests.post(
                target,
                json={"title": title, "body": body, "type": apprise_type},
                timeout=30,
            )
            push.raise_for_status()
            pushed += 1
        except Exception as exc:  # noqa: BLE001 - log + continue, don't abort the run
            print(f"Apprise push failed for alert {alert.get('id')}: {exc}")
            failed += 1

    summary = {
        "created": len(created),
        "pushed": pushed,
        "failed": failed,
        "skipped": skipped,
        "push_enabled": push_enabled,
    }
    print(summary)
    return summary
