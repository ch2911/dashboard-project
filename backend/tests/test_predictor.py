import math

import pandas as pd
import pytest

from fakes import empty_prices, make_prices
from services import predictor
from services.predictor import predict_stock_price


def test_forecasts_the_next_seven_trading_days(fake_yfinance):
    prices = make_prices()
    calls = fake_yfinance(prices)

    forecast = predict_stock_price("AAPL")

    assert calls == [{"ticker": "AAPL", "period": "6mo", "interval": "1d"}]
    assert len(forecast) == 7

    last_day = prices.index[-1]
    expected = pd.bdate_range(last_day + pd.Timedelta(days=1), periods=7)
    assert [pd.Timestamp(point["time"]) for point in forecast] == list(expected)


@pytest.mark.parametrize(
    "last_day, expected",
    [
        # Last close on a Friday: the forecast starts the next Monday
        ("2026-10-09", ["10-12", "10-13", "10-14", "10-15", "10-16", "10-19", "10-20"]),
        # Last close on a Wednesday: the forecast skips the weekend in the middle
        ("2026-10-14", ["10-15", "10-16", "10-19", "10-20", "10-21", "10-22", "10-23"]),
    ],
)
def test_forecast_dates_skip_weekends(fake_yfinance, last_day, expected):
    prices = make_prices()
    prices.index = pd.bdate_range(end=last_day, periods=len(prices), tz="America/New_York")
    fake_yfinance(prices)

    forecast = predict_stock_price("AAPL")

    dates = [pd.Timestamp(point["time"]) for point in forecast]
    assert [date.strftime("%m-%d") for date in dates] == expected
    assert all(date.weekday() < 5 for date in dates)


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


def test_forecast_is_reused_within_the_hour(fake_yfinance, clock):
    calls = fake_yfinance(make_prices())

    first = predict_stock_price("AAPL")
    clock.advance(30 * 60)
    second = predict_stock_price("aapl")  # same stock, different case

    assert second == first
    assert len(calls) == 1


def test_forecast_is_refreshed_after_an_hour(fake_yfinance, clock):
    calls = fake_yfinance(make_prices())

    predict_stock_price("AAPL")
    clock.advance(61 * 60)
    predict_stock_price("AAPL")

    assert len(calls) == 2


def test_failed_forecast_is_not_cached(fake_yfinance):
    calls = fake_yfinance(empty_prices())

    assert predict_stock_price("AAPL") == []
    assert predict_stock_price("AAPL") == []

    assert len(calls) == 2
