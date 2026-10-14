import math

import pandas as pd

from fakes import empty_prices, make_prices
from services import predictor
from services.predictor import predict_stock_price


def test_forecasts_the_next_seven_days(fake_yfinance):
    prices = make_prices()
    calls = fake_yfinance(prices)

    forecast = predict_stock_price("AAPL")

    assert calls == [{"ticker": "AAPL", "period": "6mo", "interval": "1d"}]
    assert len(forecast) == 7

    last_day = prices.index[-1].date()
    days_ahead = [(pd.Timestamp(point["time"]).date() - last_day).days for point in forecast]
    assert days_ahead == [1, 2, 3, 4, 5, 6, 7]


def test_forecast_prices_are_sensible(fake_yfinance):
    prices = make_prices()
    fake_yfinance(prices)
    last_close = prices["Close"].iloc[-1]

    forecast = predict_stock_price("AAPL")

    assert len(forecast) == 7
    for point in forecast:
        assert math.isfinite(point["price"])
        assert round(point["price"], 2) == point["price"]
        assert abs(point["price"] - last_close) / last_close < 0.2  # stays near recent prices


def test_no_price_data_gives_empty_forecast(fake_yfinance):
    fake_yfinance(empty_prices())
    assert predict_stock_price("NOPE") == []


def test_model_error_gives_empty_forecast(fake_yfinance, monkeypatch):
    fake_yfinance(make_prices())

    def broken_arima(*args, **kwargs):
        raise ValueError("model failed to fit")

    monkeypatch.setattr(predictor, "ARIMA", broken_arima)

    assert predict_stock_price("AAPL") == []


def test_forecast_is_reused_within_the_hour(fake_yfinance, monkeypatch):
    calls = fake_yfinance(make_prices())
    clock = [1000.0]
    monkeypatch.setattr(predictor.time, "monotonic", lambda: clock[0])

    first = predict_stock_price("AAPL")
    clock[0] += 30 * 60
    second = predict_stock_price("aapl")  # same stock, different case

    assert second == first
    assert len(calls) == 1


def test_forecast_is_refreshed_after_an_hour(fake_yfinance, monkeypatch):
    calls = fake_yfinance(make_prices())
    clock = [1000.0]
    monkeypatch.setattr(predictor.time, "monotonic", lambda: clock[0])

    predict_stock_price("AAPL")
    clock[0] += 61 * 60
    predict_stock_price("AAPL")

    assert len(calls) == 2


def test_failed_forecast_is_not_cached(fake_yfinance):
    calls = fake_yfinance(empty_prices())

    assert predict_stock_price("AAPL") == []
    assert predict_stock_price("AAPL") == []

    assert len(calls) == 2
