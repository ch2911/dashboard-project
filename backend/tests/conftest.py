import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

import app as app_module  # noqa: E402
from services import cache  # noqa: E402


@pytest.fixture(autouse=True)
def block_real_apis(monkeypatch):
    """Fail loudly if any test tries to reach a real API. Tests swap in fakes instead."""

    def blocked(*args, **kwargs):
        raise AssertionError("A test tried to call a real external API")

    monkeypatch.setattr("requests.get", blocked)
    monkeypatch.setattr("yfinance.Ticker", blocked)


@pytest.fixture(autouse=True)
def empty_caches():
    """Start every test without cached forecasts, news or searches from earlier tests."""
    cache.clear_all()
    yield
    cache.clear_all()


@pytest.fixture
def clock(monkeypatch):
    """A clock the caches read, which tests move forward with clock.advance(seconds)."""

    class Clock:
        now = 1000.0

        def advance(self, seconds):
            self.now += seconds

    fake = Clock()
    monkeypatch.setattr(cache.time, "monotonic", lambda: fake.now)
    return fake


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as test_client:
        yield test_client


@pytest.fixture
def fake_yfinance(monkeypatch):
    """Make yfinance return a given DataFrame. Returns the list of history() calls made."""
    calls = []

    def install(frame):
        class FakeTicker:
            def __init__(self, ticker):
                self.ticker = ticker

            def history(self, period, interval):
                calls.append({"ticker": self.ticker, "period": period, "interval": interval})
                return frame

        monkeypatch.setattr("yfinance.Ticker", FakeTicker)
        return calls

    return install
