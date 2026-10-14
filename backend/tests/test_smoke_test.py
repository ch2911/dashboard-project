"""The daily smoke test (scripts/smoke_test.py) decides whether GitHub emails a failure, so check
it fails for real problems and stays green otherwise. Every request is faked."""
import importlib.util
import os
import urllib.error

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "smoke_test.py")
spec = importlib.util.spec_from_file_location("smoke_test", SCRIPT)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

API = "https://api.example.com"
SITE = "https://site.example.com/"

GOOD = {
    "/health": {"status": "ok", "keys": {"newsapi": True, "alphavantage": True}},
    "/price?stock=AAPL": {"ticker": "AAPL", "price": 190.5, "change": 1.2},
    "/price_history?stock=AAPL&range=daily": [{"time": "d", "price": 1}] * 60,
    "/predict?stock=AAPL": [{"date": "d", "price": 1}] * 7,
    "/search_stock?q=apple": [{"symbol": "AAPL", "name": "Apple Inc."}],
    "/sentiment?stock=AAPL": [{"title": "Apple up"}],
    "/trending_news": [{"title": "Markets up"}],
}


@pytest.fixture
def server(monkeypatch):
    """A fake API and website. Tests change `responses` to break things: a value is a JSON body,
    an (HTTP status, body) pair, an exception to raise, or (status, body, seconds taken)."""
    responses = {API + path: body for path, body in GOOD.items()}
    responses[SITE] = (200, None)

    def fetch(url, timeout):
        answer = responses[url]
        if isinstance(answer, Exception):
            raise answer
        if isinstance(answer, tuple):
            return answer if len(answer) == 3 else (*answer, 0.5)
        return 200, answer, 0.5

    monkeypatch.setattr(smoke, "fetch", fetch)
    monkeypatch.setattr(smoke.time, "sleep", lambda seconds: None)
    return responses


def test_everything_working_passes(server):
    failures, warnings, rows = smoke.run(API, SITE)
    assert failures == [] and warnings == []
    assert [row[0] for row in rows] == [name for name, _, _ in smoke.CHECKS] + ["Website"]
    assert all(row[3] == "ok" for row in rows)


def test_an_endpoint_error_fails(server):
    server[API + "/price?stock=AAPL"] = (500, {"error": "boom"})
    failures, _, _ = smoke.run(API)
    assert failures == ["Price (/price?stock=AAPL): returned HTTP 500"]


@pytest.mark.parametrize("path, body", [
    ("/price?stock=AAPL", {"price": 0}),
    ("/predict?stock=AAPL", [{"price": 1}] * 6),
    ("/search_stock?q=apple", [{"symbol": "APLE"}]),
    ("/price_history?stock=AAPL&range=daily", {"error": "x"}),
])
def test_the_wrong_kind_of_answer_fails(server, path, body):
    server[API + path] = body
    failures, _, _ = smoke.run(API)
    assert len(failures) == 1 and "unexpected response" in failures[0]


def test_a_slow_endpoint_fails(server):
    server[API + "/predict?stock=AAPL"] = (200, GOOD["/predict?stock=AAPL"], smoke.MAX_SECONDS + 1)
    failures, _, _ = smoke.run(API)
    assert failures == [f"7-day forecast (/predict?stock=AAPL): too slow (21.0s, limit {smoke.MAX_SECONDS}s)"]


def test_no_headlines_only_warns(server):
    server[API + "/trending_news"] = []
    failures, warnings, _ = smoke.run(API)
    assert failures == []
    assert warnings and "NewsAPI" in warnings[0]


def test_a_missing_api_key_fails(server):
    server[API + "/health"] = {"keys": {"newsapi": True, "alphavantage": False}}
    failures, _, _ = smoke.run(API)
    assert failures == ["The alphavantage API key isn't set on the server"]


def test_optional_features_dont_fail(server):
    server[API + "/health"] = {**GOOD["/health"], "features": {"delete_profile": False}}
    assert smoke.run(API)[0] == []


def test_an_unreachable_endpoint_fails_without_stopping_the_others(server):
    server[API + "/sentiment?stock=AAPL"] = urllib.error.URLError("reset")
    failures, _, rows = smoke.run(API)
    assert failures == ["Stock headlines (/sentiment?stock=AAPL): couldn't connect (URLError)"]
    assert len(rows) == len(smoke.CHECKS)


def test_a_broken_website_fails(server):
    server[SITE] = (404, None)
    assert smoke.run(API, SITE)[0] == [f"The website ({SITE}) returned HTTP 404"]

    server[SITE] = TimeoutError()
    assert smoke.run(API, SITE)[0] == [f"The website ({SITE}) couldn't be reached (TimeoutError)"]


def test_waits_for_a_sleeping_server_to_wake_up(server, monkeypatch):
    answers = [ConnectionError(), (503, None), (200, GOOD["/health"])]

    def health(url, timeout):
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return (*answer, 30.0)

    original = smoke.fetch
    monkeypatch.setattr(smoke, "fetch", lambda url, timeout: health(url, timeout) if url.endswith("/health")
                        else original(url, timeout))
    assert smoke.run(API)[0] == []
    assert answers == []


def test_fails_if_the_server_never_wakes_up(server, monkeypatch):
    server[API + "/health"] = ConnectionError()
    clock = iter(range(0, 10_000, 10))
    monkeypatch.setattr(smoke.time, "monotonic", lambda: next(clock))
    failures, _, rows = smoke.run(API)
    assert failures == [f"The API at {API} didn't respond within {smoke.WAKE_UP_SECONDS} seconds"]
    assert rows == []


def test_exit_code_and_summary_table(server, monkeypatch, tmp_path, capsys):
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))

    assert smoke.main(["smoke_test.py", API + "/", SITE]) == 0
    assert "| Price | 200 | 0.5s | ok |" in summary.read_text()

    server[API + "/price?stock=AAPL"] = (500, None)
    assert smoke.main(["smoke_test.py", API]) == 1
    assert "::error::Price (/price?stock=AAPL): returned HTTP 500" in capsys.readouterr().out


def test_usage_message_without_an_api_url(capsys):
    assert smoke.main(["smoke_test.py"]) == 2
    assert smoke.main(["smoke_test.py", "api.example.com"]) == 2
    assert "Usage" in capsys.readouterr().out


@pytest.fixture
def local_server():
    """A real HTTP server on this machine, so fetch() is tested without reaching the internet."""
    import http.server
    import threading

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            status, body = {"/ok": (200, b'{"price": 1}'), "/missing": (404, b'{"error": "no"}')}.get(
                self.path, (200, b"<html>not json</html>"))
            self.send_response(status)
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_port}"
    httpd.shutdown()


def test_fetch_reads_json_errors_and_non_json(local_server):
    status, body, seconds = smoke.fetch(local_server + "/ok", timeout=5)
    assert (status, body) == (200, {"price": 1}) and seconds >= 0
    assert smoke.fetch(local_server + "/missing", timeout=5)[:2] == (404, {"error": "no"})
    assert smoke.fetch(local_server + "/page", timeout=5)[:2] == (200, None)
