from datetime import datetime

from fakes import FakeResponse
from services.news_fetcher import fetch_news


def install_newsapi(monkeypatch, payload):
    """Fake NewsAPI. Returns a dict that records the URL requested."""
    seen = {}

    def fake_get(url, *args, **kwargs):
        seen["url"] = url
        seen.update(kwargs)
        return FakeResponse(payload)

    monkeypatch.setattr("requests.get", fake_get)
    return seen


def test_uses_api_key_from_environment(monkeypatch):
    monkeypatch.setenv("NEWSAPI_KEY", "test-key")
    seen = install_newsapi(monkeypatch, {"articles": []})

    fetch_news("AAPL")

    assert seen["headers"]["X-Api-Key"] == "test-key"
    assert "test-key" not in seen["url"]  # keeps the key out of URLs and error logs
    assert seen["params"]["q"] == "AAPL"
    assert seen["timeout"] == 10


def test_returns_at_most_20_articles(monkeypatch):
    articles = [
        {"title": f"Headline {i}", "url": f"https://example.com/{i}", "publishedAt": "2026-10-01T09:00:00Z"}
        for i in range(30)
    ]
    install_newsapi(monkeypatch, {"articles": articles})

    result = fetch_news("AAPL")

    assert len(result) == 20
    assert result[0] == {"title": "Headline 0", "time": "2026-10-01T09:00:00Z", "url": "https://example.com/0"}


def test_fills_in_missing_title_and_time(monkeypatch):
    install_newsapi(monkeypatch, {"articles": [{"title": None, "url": "https://example.com/a", "publishedAt": None}]})

    [article] = fetch_news("AAPL")

    assert article["title"] == ""
    datetime.fromisoformat(article["time"])  # a valid timestamp was filled in


def test_error_response_gives_no_articles(monkeypatch):
    # NewsAPI replies like this for a bad key or when the daily limit is reached
    install_newsapi(monkeypatch, {"status": "error", "code": "apiKeyInvalid"})

    assert fetch_news("AAPL") == []


def test_passes_search_in_when_given(monkeypatch):
    seen = install_newsapi(monkeypatch, {"articles": []})

    fetch_news('AAPL OR "Apple"', search_in="title,description")

    assert seen["params"]["searchIn"] == "title,description"
    assert seen["params"]["q"] == 'AAPL OR "Apple"'


def test_results_are_reused_for_15_minutes(monkeypatch, clock):
    requests_made = []

    def fake_get(url, *args, **kwargs):
        requests_made.append(kwargs["params"]["q"])
        return FakeResponse({"articles": [{"title": "Headline", "url": "https://example.com", "publishedAt": "2026-10-01T09:00:00Z"}]})

    monkeypatch.setattr("requests.get", fake_get)

    first = fetch_news("AAPL")
    clock.advance(14 * 60)
    second = fetch_news("AAPL")
    fetch_news("MSFT")  # a different search isn't served from the cache
    clock.advance(2 * 60)
    fetch_news("AAPL")  # 16 minutes on, AAPL is fetched again

    assert second == first
    assert requests_made == ["AAPL", "MSFT", "AAPL"]


def test_error_responses_are_not_cached(monkeypatch):
    requests_made = []

    def fake_get(url, *args, **kwargs):
        requests_made.append(1)
        return FakeResponse({"status": "error", "code": "rateLimited", "message": "Too many requests"})

    monkeypatch.setattr("requests.get", fake_get)

    fetch_news("AAPL")
    fetch_news("AAPL")

    assert len(requests_made) == 2
