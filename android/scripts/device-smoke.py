#!/usr/bin/env python3
"""Run the optional Android smoke test against a disposable localhost backend.

Usage: python3 scripts/device-smoke.py /tmp/disposable-account.json [emulator-5554]
The input file has username/password/origin; no credential enters the APK or logs.
"""
import base64
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.request

root = Path(__file__).resolve().parents[1]
account = json.loads(Path(sys.argv[1]).read_text())
if account["origin"] != "http://localhost:3000":
    raise SystemExit("Use only the disposable localhost:3000 backend.")
adb = str(Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk"))) / "platform-tools/adb")
device = sys.argv[2] if len(sys.argv) > 2 else "emulator-5554"
base = [adb, "-s", device]
for apk in ["app/build/outputs/apk/debug/app-debug.apk", "app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"]:
    subprocess.run(base + ["install", "-r", str(root / apk)], check=True)
subprocess.run(base + ["reverse", "tcp:3000", "tcp:3000"], check=True)
jar = http.cookiejar.CookieJar()
browser = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def post(path, data):
    request = urllib.request.Request(account["origin"] + path, json.dumps(data).encode(), {"Content-Type": "application/json", "Origin": account["origin"]})
    with browser.open(request, timeout=20) as response:
        return json.load(response)

post("/api/auth/sign-in/username", {"username": account["username"], "password": account["password"]})
verifier = secrets.token_urlsafe(32)
state = secrets.token_urlsafe(32)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
url = post("/api/native/authorize", {"challenge": challenge, "state": state})["url"]
handoff = json.dumps({"origin": account["origin"], "state": state, "verifier": verifier, "url": url, "expires": int(time.time() * 1000) + 60000})
# Only the 60-second single-use handoff crosses to app-private runtime storage.
try:
    subprocess.run(base + ["shell", "run-as", "com.littleoffice.android", "mkdir", "-p", "files"], check=True)
    subprocess.run(base + ["shell", "run-as", "com.littleoffice.android", "sh", "-c", "'cat > files/smoke-handoff.json'"], input=handoff.encode(), check=True)
    result = subprocess.run(base + ["shell", "am", "instrument", "-w", "-e", "class", "com.littleoffice.android.NativeSmokeTest", "com.littleoffice.android.test/androidx.test.runner.AndroidJUnitRunner"], text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=True, timeout=150)
    print(result.stdout)
    if "OK (1 test)" not in result.stdout:
        raise SystemExit("Android smoke test failed or did not run.")
finally:
    subprocess.run(base + ["shell", "run-as", "com.littleoffice.android", "rm", "-f", "files/smoke-handoff.json"], check=False)
    try:
        post("/api/auth/sign-out", {})
    except Exception:
        pass
