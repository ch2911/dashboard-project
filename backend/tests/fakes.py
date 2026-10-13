"""Stand-ins for the external APIs, so tests never touch the network or need API keys."""
import numpy as np
import pandas as pd


class FakeResponse:
    """Minimal replacement for a requests.Response."""

    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def make_prices(n=126, start="2026-04-01", step=0.5, seed=0):
    """Daily Open/Close prices shaped like yfinance's history() output."""
    index = pd.date_range(start, periods=n, freq="B", tz="America/New_York")
    rng = np.random.default_rng(seed)
    close = 100 + step * np.arange(n) + rng.normal(0, 1, n)
    return pd.DataFrame({"Open": close - 0.5, "Close": close}, index=index)


def empty_prices():
    return pd.DataFrame(columns=["Open", "Close"])
