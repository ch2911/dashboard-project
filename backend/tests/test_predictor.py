import math

import numpy as np
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


def test_middle_line_stays_at_the_last_close(fake_yfinance):
    prices = make_prices()
    fake_yfinance(prices)
    last_close = round(prices["Close"].iloc[-1], 2)

    forecast = predict_stock_price("AAPL")

    assert len(forecast) == 7
    assert all(point["price"] == last_close for point in forecast)


def test_range_widens_with_the_square_root_of_days_ahead(fake_yfinance):
    prices = make_prices()
    fake_yfinance(prices)
    last_close = prices["Close"].iloc[-1]
    daily_swing = np.diff(np.log(prices["Close"].to_numpy())).std()

    forecast = predict_stock_price("AAPL")

    for days_ahead, point in enumerate(forecast, start=1):
        spread = predictor.RANGE_Z * daily_swing * math.sqrt(days_ahead)
        assert point["low"] == pytest.approx(last_close * math.exp(-spread), abs=0.01)
        assert point["high"] == pytest.approx(last_close * math.exp(spread), abs=0.01)
        assert point["low"] < point["price"] < point["high"]
    widths = [point["high"] - point["low"] for point in forecast]
    assert widths == sorted(widths)


def test_jumpier_stocks_get_wider_ranges(fake_yfinance):
    fake_yfinance(make_prices(seed=1))
    calm = predict_stock_price("CALM")
    predictor.clear_cache()

    jumpy_prices = make_prices(seed=1)
    jumpy_prices["Close"] = 100 * np.exp(3 * np.log(jumpy_prices["Close"] / 100))  # triple the moves
    fake_yfinance(jumpy_prices)
    jumpy = predict_stock_price("JUMPY")

    def relative_width(point):
        return (point["high"] - point["low"]) / point["price"]

    assert relative_width(jumpy[-1]) > 2 * relative_width(calm[-1])


def test_no_price_data_gives_empty_forecast(fake_yfinance):
    fake_yfinance(empty_prices())
    assert predict_stock_price("NOPE") == []


def test_too_few_prices_gives_empty_forecast(fake_yfinance):
    fake_yfinance(make_prices(n=10))
    assert predict_stock_price("NEW") == []


def test_bad_prices_give_empty_forecast(fake_yfinance):
    # A zero price would make the range infinite, which isn't valid JSON
    prices = make_prices()
    prices.iloc[-5, prices.columns.get_loc("Close")] = 0.0
    fake_yfinance(prices)

    with np.errstate(divide="ignore", invalid="ignore"):
        assert predict_stock_price("AAPL") == []


def test_unexpected_error_gives_empty_forecast(monkeypatch):
    def broken(*args, **kwargs):
        raise ValueError("unexpected data")

    monkeypatch.setattr(predictor, "get_history", broken)

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
