from datetime import datetime

import pytest

import app as app_module
from fakes import empty_prices, make_prices


# /price

def test_price_compares_latest_price_with_previous_close(client, fake_yfinance):
    prices = make_prices(n=5)
    prices.loc[prices.index[-2], "Close"] = 200.0
    prices.loc[prices.index[-1], "Close"] = 210.0
    calls = fake_yfinance(prices)

    data = client.get("/price?stock=AAPL").get_json()

    assert data == {"ticker": "AAPL", "price": 210.0, "change": 5.0}
    assert calls == [{"ticker": "AAPL", "period": "5d", "interval": "1d"}]


def test_price_ignores_missing_latest_close(client, fake_yfinance):
    prices = make_prices(n=5)
    prices.loc[prices.index[-2], "Close"] = 100.0
    prices.loc[prices.index[-1], "Close"] = float("nan")  # Yahoo sometimes sends an empty last bar
    prices.loc[prices.index[-3], "Close"] = 80.0
    fake_yfinance(prices)

    data = client.get("/price?stock=AAPL").get_json()

    assert data == {"ticker": "AAPL", "price": 100.0, "change": 25.0}


def test_price_with_only_one_day_of_data_has_no_change(client, fake_yfinance):
    fake_yfinance(make_prices(n=1))
    data = client.get("/price?stock=NEW").get_json()
    assert data["change"] == 0.0


def test_price_for_unknown_ticker_returns_404(client, fake_yfinance):
    fake_yfinance(empty_prices())
    response = client.get("/price?stock=NOPE")
    assert response.status_code == 404


# /price_history

@pytest.mark.parametrize(
    "query, period, interval",
    [
        ("&range=daily", "3mo", "1d"),
        ("&range=intraday", "1d", "5m"),
        ("", "3mo", "1d"),  # daily is the default
    ],
)
def test_price_history_uses_requested_range(client, fake_yfinance, query, period, interval):
    calls = fake_yfinance(make_prices(n=5))

    data = client.get(f"/price_history?stock=TSLA{query}").get_json()

    assert calls[0]["period"] == period
    assert calls[0]["interval"] == interval
    assert len(data) == 5
    assert set(data[0]) == {"time", "price"}
    datetime.fromisoformat(data[0]["time"])


def test_price_history_for_unknown_ticker_returns_404(client, fake_yfinance):
    fake_yfinance(empty_prices())
    response = client.get("/price_history?stock=NOPE")
    assert response.status_code == 404


# /sentiment

def test_sentiment_scores_each_headline(client, monkeypatch):
    searched = []
    articles = [
        {"title": "Profits soar to a record high", "time": "2026-10-01T09:00:00Z", "url": "https://example.com/1"},
        {"title": "Shares crash after terrible results", "time": "2026-10-01T10:00:00Z", "url": "https://example.com/2"},
    ]

    def fake_fetch_news(query):
        searched.append(query)
        return articles

    monkeypatch.setattr(app_module, "fetch_news", fake_fetch_news)

    data = client.get("/sentiment?stock=NVDA").get_json()

    assert searched == ["NVDA"]
    assert [item["sentiment"]["label"] for item in data] == ["positive", "negative"]
    assert data[0]["url"] == "https://example.com/1"


# /trending_news

def test_trending_news_tags_the_stocks_each_headline_mentions(client, monkeypatch):
    searched = []
    articles = [
        {"title": "NVDA and AMD lead a chip rally", "time": "2026-10-01T09:00:00Z", "url": "https://example.com/1"},
        {"title": "Markets close flat", "time": "2026-10-01T10:00:00Z", "url": "https://example.com/2"},
    ]

    def fake_fetch_news(query):
        searched.append(query)
        return articles

    monkeypatch.setattr(app_module, "fetch_news", fake_fetch_news)

    data = client.get("/trending_news").get_json()

    assert searched == ["finance OR markets"]
    assert data[0]["affected_stocks"] == ["NVDA"]  # AMD isn't in the tracked list
    assert data[1]["affected_stocks"] == []
    assert {"title", "time", "url", "sentiment", "affected_stocks"} <= set(data[0])


# /predict

def test_predict_returns_the_forecast(client, monkeypatch):
    forecast = [{"time": "2026-10-14T00:00:00", "price": 101.5}]
    monkeypatch.setattr(app_module, "predict_stock_price", lambda ticker: forecast if ticker == "AAPL" else [])

    data = client.get("/predict?stock=AAPL").get_json()

    assert data == forecast


# Errors

def test_unexpected_error_returns_json_with_cors_header(client, monkeypatch):
    def broken_fetch_news(query):
        raise RuntimeError("NewsAPI is down")

    monkeypatch.setattr(app_module, "fetch_news", broken_fetch_news)

    response = client.get("/sentiment?stock=AAPL", headers={"Origin": "https://ch2911.github.io"})

    assert response.status_code == 500
    assert "error" in response.get_json()
    assert response.headers["Access-Control-Allow-Origin"] in ("*", "https://ch2911.github.io")


def test_unknown_route_returns_json_404(client):
    response = client.get("/not-a-route")
    assert response.status_code == 404
    assert "error" in response.get_json()
