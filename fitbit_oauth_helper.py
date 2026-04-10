"""
One-time helper to complete the Fitbit OAuth 2.0 flow.

1. Opens your browser to authorize the app
2. You paste the redirect URL back here
3. Exchanges the auth code for access + refresh tokens
4. Prints the tokens to paste into your Windmill resource
"""

import base64
import json
import os
import sys
import time
import webbrowser
from urllib.parse import parse_qs, urlparse

import requests

CLIENT_ID = os.environ.get("FITBIT_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("FITBIT_CLIENT_SECRET", "")
REDIRECT_URI = "http://localhost:8888/callback"

if not CLIENT_ID or not CLIENT_SECRET:
    print("Set FITBIT_CLIENT_ID and FITBIT_CLIENT_SECRET environment variables.")
    sys.exit(1)
SCOPES = "activity heartrate sleep weight oxygen_saturation respiratory_rate temperature cardio_fitness"

AUTH_URL = (
    f"https://www.fitbit.com/oauth2/authorize"
    f"?response_type=code"
    f"&client_id={CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
    f"&scope={SCOPES.replace(' ', '+')}"
    f"&expires_in=604800"
)
TOKEN_URL = "https://api.fitbit.com/oauth2/token"


def main():
    print("Opening browser for Fitbit authorization...\n")
    webbrowser.open(AUTH_URL)

    print("After authorizing, you'll be redirected to fitbit.com.")
    print("Copy the FULL URL from your browser's address bar and paste it here.\n")
    redirect_url = input("Paste redirect URL: ").strip()

    # Extract the code from the URL
    parsed = urlparse(redirect_url)
    qs = parse_qs(parsed.query)
    if "code" not in qs:
        # Maybe they pasted just the code itself
        code = redirect_url
    else:
        code = qs["code"][0]

    print(f"\nExchanging code for tokens...")

    # Build Basic auth header
    credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()

    response = requests.post(
        TOKEN_URL,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "client_id": CLIENT_ID,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
            "code": code,
        },
        timeout=30,
    )

    if response.status_code != 200:
        print(f"\nError {response.status_code}: {response.text}")
        return

    token_data = response.json()
    expires_at = int(time.time()) + token_data.get("expires_in", 28800)

    print("\n" + "=" * 60)
    print("SUCCESS! Copy this into your Windmill resource u/kevin/fitbit_oauth:")
    print("=" * 60)

    resource = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "access_token": token_data["access_token"],
        "refresh_token": token_data["refresh_token"],
        "expires_at": expires_at,
    }
    print(json.dumps(resource, indent=2))

    print(f"\nUser ID: {token_data.get('user_id')}")
    print(f"Scopes granted: {token_data.get('scope')}")
    print(f"Token expires at: {time.ctime(expires_at)}")


if __name__ == "__main__":
    main()
