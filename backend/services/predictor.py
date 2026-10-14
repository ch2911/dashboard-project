import warnings

import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

from services.cache import TTLCache
from services.market_data import get_history

# Forecasts only change when new prices come in, so each ticker's forecast is reused for an
# hour. Failed forecasts aren't cached, so they're retried on the next request.
_forecast_cache = TTLCache(seconds=60 * 60)


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
    try:
        # Six months of daily closing prices
        stock_data = get_history(ticker, period="6mo", interval="1d", cache_seconds=60 * 60)
        if stock_data.empty:
            return []

        # ARIMA(10,1,0): each day's change depends on the previous 10 days' changes.
        # Burg's method estimates this directly instead of by iterative maximum likelihood.
        # It uses about a sixth of the CPU and gives near-identical forecasts, which matters
        # on a small server.
        # Pass just the prices, not the dates: trading days skip weekends and holidays, and
        # statsmodels 0.15 refuses to forecast from dates without a regular frequency. The
        # forecast dates are worked out separately below.
        model = ARIMA(stock_data["Close"].to_numpy(), order=(10, 1, 0))
        with warnings.catch_warnings():
            # Burg's method works on the daily changes, so statsmodels warns that it differenced
            # the prices first. That's expected, so keep it out of the server logs.
            warnings.filterwarnings("ignore", message="Provided `endog` series has been differenced")
            model_fit = model.fit(method="burg")

        # Predict the next 7 days
        predictions = model_fit.forecast(steps=7)

        # Create future dates for the predictions
        last_date = stock_data.index[-1]
        future_dates = pd.to_datetime([last_date + pd.DateOffset(days=i) for i in range(1, 8)])

        return [
            {"time": date.isoformat(), "price": round(float(price), 2)}
            for date, price in zip(future_dates, predictions)
        ]
    except Exception as e:
        print(f"Prediction failed for {ticker}: {e}")
        return []
