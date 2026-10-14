#!/usr/bin/env python3
"""Smoke test for the live site: is the API up, and does every endpoint answer correctly and quickly?

The workflow in .github/workflows/smoke-test.yml runs this every morning. To run it by hand:

    python scripts/smoke_test.py https://your-api.onrender.com [https://your-site.github.io/repo/]

Uses only the standard library, so there's nothing to install.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

# Render's free plan sleeps when nobody has used it for a while and takes up to a minute or two to wake
WAKE_UP_SECONDS = 180
# Once awake, every endpoint should answer within this
MAX_SECONDS = 20

# (name, path, check that the response looks right)
CHECKS = [
    ("Price", "/price?stock=AAPL",
     lambda body: isinstance(body, dict) and isinstance(body.get("price"), (int, float)) and body["price"] > 0),
    ("3-month price history", "/price_history?stock=AAPL&range=daily",
     lambda body: isinstance(body, list) and len(body) >= 20),
    ("7-day forecast", "/predict?stock=AAPL",
     lambda body: isinstance(body, list) and len(body) == 7),
    ("Search", "/search_stock?q=apple",
     lambda body: isinstance(body, list) and any(s.get("symbol") == "AAPL" for s in body)),
    ("Stock headlines", "/sentiment?stock=AAPL", lambda body: isinstance(body, list)),
    ("Trending news", "/trending_news", lambda body: isinstance(body, list)),
]
# No headlines usually means NewsAPI's daily limit was reached rather than a bug, so only warn
WARN_IF_EMPTY = {"Stock headlines", "Trending news"}


def fetch(url, timeout):
    """Return (HTTP status, parsed JSON or None, seconds taken). Raises if the server can't be reached."""
    start = time.monotonic()
    request = urllib.request.Request(url, headers={"User-Agent": "dashboard-smoke-test"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    seconds = time.monotonic() - start
    try:
        body = json.loads(raw)
    except ValueError:
        body = None
    return status, body, seconds


def wake_up(api):
    """Call /health until the server answers. Returns its response, or None if it never woke up."""
    deadline = time.monotonic() + WAKE_UP_SECONDS
    while time.monotonic() < deadline:
        try:
            status, body, seconds = fetch(f"{api}/health", timeout=60)
            if status == 200:
                print(f"Server is up (took {seconds:.1f}s to answer)")
                return body
            print(f"/health returned {status}, retrying...")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            print(f"Waiting for the server to wake up ({type(error).__name__})...")
        time.sleep(10)
    return None


def run(api, site=None):
    """Run every check. Returns (failures, warnings, rows for the summary table)."""
    failures, warnings, rows = [], [], []

    health = wake_up(api)
    if health is None:
        return [f"The API at {api} didn't respond within {WAKE_UP_SECONDS} seconds"], warnings, rows

    for key, is_set in (health.get("keys") or {}).items():
        if not is_set:
            failures.append(f"The {key} API key isn't set on the server")

    for name, path, looks_right in CHECKS:
        try:
            status, body, seconds = fetch(api + path, timeout=MAX_SECONDS * 3)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            failures.append(f"{name} ({path}): couldn't connect ({type(error).__name__})")
            rows.append((name, "-", "-", "couldn't connect"))
            continue

        if status != 200:
            problem = f"returned HTTP {status}"
        elif not looks_right(body):
            problem = f"unexpected response: {json.dumps(body)[:120]}"
        elif seconds > MAX_SECONDS:
            problem = f"too slow ({seconds:.1f}s, limit {MAX_SECONDS}s)"
        else:
            problem = None

        if problem:
            failures.append(f"{name} ({path}): {problem}")
        elif name in WARN_IF_EMPTY and not body:
            warnings.append(f"{name} ({path}) came back empty. NewsAPI's daily limit may have been reached.")
        rows.append((name, str(status), f"{seconds:.1f}s", problem or "ok"))

    if site:
        try:
            status, _, seconds = fetch(site, timeout=30)
            if status != 200:
                failures.append(f"The website ({site}) returned HTTP {status}")
            rows.append(("Website", str(status), f"{seconds:.1f}s", "ok" if status == 200 else f"HTTP {status}"))
        except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
            failures.append(f"The website ({site}) couldn't be reached ({type(error).__name__})")

    return failures, warnings, rows


def report(failures, warnings, rows):
    print()
    for name, status, seconds, result in rows:
        print(f"{'ok' if result == 'ok' else 'FAIL':<4}  {name:<24} {status:>4}  {seconds:>6}  {result}")
    # In GitHub Actions these show up as annotations on the run, and the table on its summary page
    for warning in warnings:
        print(f"::warning::{warning}")
    for failure in failures:
        print(f"::error::{failure}")
    summary_file = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_file:
        with open(summary_file, "a") as summary:
            summary.write("| Check | Status | Time | Result |\n| --- | --- | --- | --- |\n")
            for row in rows:
                summary.write("| " + " | ".join(row) + " |\n")


def main(argv):
    if len(argv) < 2 or not argv[1].startswith("http"):
        print("Usage: python scripts/smoke_test.py <API URL> [website URL]")
        print("In GitHub Actions, set the API_URL repository variable.")
        return 2
    api = argv[1].rstrip("/")
    site = argv[2] if len(argv) > 2 else None

    failures, warnings, rows = run(api, site)
    report(failures, warnings, rows)
    print(f"\n{len(failures)} failed, {len(warnings)} warnings")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
