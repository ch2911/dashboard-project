import pytest
import requests
from yfinance.exceptions import YFRateLimitError

from fakes import empty_prices, make_prices
from services.market_data import get_history


def install_flaky_yahoo(monkeypatch, failures, error=YFRateLimitError):
    """Fake yfinance that raises `error` for the first `failures` requests, then returns prices."""
    calls = []

    class FlakyTicker:
        def __init__(self, ticker):
            self.ticker = ticker

        def history(self, period, interval):
            calls.append(self.ticker)
            if len(calls) <= failures:
                raise error()
            return make_prices(n=5)

    monkeypatch.setattr("yfinance.Ticker", FlakyTicker)
    return calls


def test_tries_again_after_a_rate_limit(monkeypatch, sleeps):
    # This is what happened on Render: Yahoo refused the first request after the server started
    calls = install_flaky_yahoo(monkeypatch, failures=1)

    data = get_history("AAPL", period="5d", interval="1d", cache_seconds=60)

    assert not data.empty
    assert len(calls) == 2
    assert sleeps == [2]


def test_gives_up_after_three_attempts(monkeypatch, sleeps):
    calls = install_flaky_yahoo(monkeypatch, failures=10)

    with pytest.raises(YFRateLimitError):
        get_history("AAPL", period="5d", interval="1d", cache_seconds=60)

    assert len(calls) == 3
    assert sleeps == [2, 5]


def test_tries_again_after_a_connection_error(monkeypatch, sleeps):
    calls = install_flaky_yahoo(monkeypatch, failures=2, error=requests.exceptions.ConnectionError)

    data = get_history("AAPL", period="5d", interval="1d", cache_seconds=60)

    assert not data.empty
    assert len(calls) == 3


def test_other_errors_are_not_retried(monkeypatch, sleeps):
    calls = install_flaky_yahoo(monkeypatch, failures=1, error=ValueError)

    with pytest.raises(ValueError):
        get_history("AAPL", period="5d", interval="1d", cache_seconds=60)

    assert len(calls) == 1
    assert sleeps == []


def test_results_are_reused_until_they_expire(fake_yfinance, clock):
    calls = fake_yfinance(make_prices(n=5))

    get_history("AAPL", period="5d", interval="1d", cache_seconds=60)
    clock.advance(59)
    get_history("aapl", period="5d", interval="1d", cache_seconds=60)   # same stock, from the cache
    get_history("AAPL", period="3mo", interval="1d", cache_seconds=60)  # different range, fetched
    clock.advance(2)
    get_history("AAPL", period="5d", interval="1d", cache_seconds=60)   # expired, fetched again

    assert [call["period"] for call in calls] == ["5d", "3mo", "5d"]


def test_empty_results_are_not_cached(fake_yfinance):
    calls = fake_yfinance(empty_prices())

    get_history("NOPE", period="5d", interval="1d", cache_seconds=60)
    get_history("NOPE", period="5d", interval="1d", cache_seconds=60)

    assert len(calls) == 2
