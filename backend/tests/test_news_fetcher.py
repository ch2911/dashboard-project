from datetime import datetime

from fakes import FakeResponse
from services.news_fetcher import fetch_news


def install_newsapi(monkeypatch, payload):
    """Fake NewsAPI. Returns a dict that records the URL requested."""
    seen = {}

    def fake_get(url, *args, **kwargs):
        seen["url"] = url
        return FakeResponse(payload)

    monkeypatch.setattr("requests.get", fake_get)
    return seen


def test_uses_api_key_from_environment(monkeypatch):
    monkeypatch.setenv("NEWSAPI_KEY", "test-key")
    seen = install_newsapi(monkeypatch, {"articles": []})

    fetch_news("AAPL")

    assert "apiKey=test-key" in seen["url"]
    assert "q=AAPL" in seen["url"]


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
