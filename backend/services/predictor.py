import numpy as np
import pandas as pd

from services.cache import TTLCache
from services.market_data import get_history

# Forecasts only change when new prices come in, so each ticker's forecast is reused for an
# hour. Failed forecasts aren't cached, so they're retried on the next request.
_forecast_cache = TTLCache(seconds=60 * 60)

# The range covers the middle 80% of likely prices. Its edges are this many standard deviations
# from the middle (the 10th and 90th percentiles of a normal distribution).
RANGE_Z = 1.2816


def clear_cache():
    _forecast_cache.clear()


def predict_stock_price(ticker):
    key = ticker.upper()
    cached = _forecast_cache.get(key)
    if cached is not None:
        return cached

    forecast = _make_forecast(ticker)
    if forecast:
        _forecast_cache.set(key, forecast)
    return forecast


def _make_forecast(ticker):
    """The next 7 trading days: today's price as the middle line, plus a likely range.

    The middle line stays at the latest close. A backtest on two years of real prices
    (scripts/backtest_forecast.py) found that no model we tried, including the ARIMA used
    before, predicted the next week's price better than that. The range is the useful part:
    it shows how far the price usually moves, based on the last six months' daily swings,
    and widens with the square root of the days ahead.
    """
    try:
        stock_data = get_history(ticker, period="6mo", interval="1d", cache_seconds=60 * 60)
        if stock_data.empty:
            return []
        closes = stock_data["Close"].dropna()
        if len(closes) < 20:
            return []

        last_price = float(closes.iloc[-1])
        daily_swing = float(np.diff(np.log(closes.to_numpy())).std())
        if not np.isfinite(daily_swing) or last_price <= 0:
            return []

        # Each forecast step is one trading day, so date them on weekdays only. Market holidays
        # aren't skipped, so a forecast spanning one has a point on that day.
        last_date = closes.index[-1]
        forecast = []
        for days_ahead in range(1, 8):
            spread = RANGE_Z * daily_swing * np.sqrt(days_ahead)
            forecast.append({
                "time": (last_date + pd.offsets.BDay(days_ahead)).isoformat(),
                "price": round(last_price, 2),
                "low": round(last_price * float(np.exp(-spread)), 2),
                "high": round(last_price * float(np.exp(spread)), 2),
            })
        return forecast
    except Exception as e:
        print(f"Prediction failed for {ticker}: {e}")
        return []
