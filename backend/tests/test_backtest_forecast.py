"""scripts/backtest_forecast.py decides which forecast the dashboard shows, so check that it scores
forecasts correctly, that the tree model only learns from the past, and that it runs end to end.
Prices are made up or faked, so nothing reaches Yahoo Finance."""
import importlib.util
import os
import sys

import numpy as np
import pandas as pd
import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "backtest_forecast.py")
spec = importlib.util.spec_from_file_location("backtest_forecast", SCRIPT)
backtest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backtest)


@pytest.fixture(autouse=True)
def small_trees(monkeypatch):
    """Far fewer boosting rounds, so the tree model trains in a moment."""
    monkeypatch.setitem(backtest.TREE_SETTINGS, "max_iter", 5)
    monkeypatch.setitem(backtest.TREE_SETTINGS, "min_samples_leaf", 20)


def random_walk(n=200, daily_swing=0.01, seed=0):
    return 100 * np.exp(np.cumsum(np.random.default_rng(seed).normal(0, daily_swing, n)))


def test_pinball_loss_charges_more_for_missing_on_the_unlikely_side():
    # The 90th percentile should rarely be beaten: being 1 too low costs 0.9, 1 too high only 0.1
    assert backtest.pinball(np.array([1.0]), np.array([0.0]), 0.9)[0] == pytest.approx(0.9)
    assert backtest.pinball(np.array([0.0]), np.array([1.0]), 0.9)[0] == pytest.approx(0.1)


def test_no_change_range_is_centred_and_widens_with_the_square_root_of_days():
    forecast = backtest.no_change_forecast(random_walk())

    low_1, mid_1, high_1 = forecast[1]
    low_4, mid_4, high_4 = forecast[4]
    assert mid_1 == mid_4 == 0
    assert low_4 == -high_4
    assert high_4 == pytest.approx(2 * high_1)


def test_recent_volatility_reacts_to_a_jumpy_last_fortnight():
    calm = random_walk(190, 0.01)
    jumpy_end = calm[-1] * np.exp(np.cumsum(np.random.default_rng(1).normal(0, 0.05, 10)))
    prices = np.concatenate([calm, jumpy_end])

    six_months = backtest.no_change_forecast(prices)[1][2]
    recent = backtest.recent_volatility_forecast(prices)[1][2]

    assert recent > 1.5 * six_months


def test_arima_forecast_gives_a_range_around_a_middle_line():
    forecast = backtest.arima_forecast(random_walk())

    assert sorted(forecast) == list(backtest.HORIZONS)
    for low, mid, high in forecast.values():
        assert low < mid < high


def test_a_failed_arima_is_scored_as_no_change(monkeypatch):
    def broken(prices):
        raise ValueError("didn't fit")

    monkeypatch.setattr(backtest, "arima_forecast", broken)
    rows, failures = backtest._forecast_one_stock(("AAA", random_walk(), [150, 160]))

    assert failures == 2
    arima = [r for r in rows if r[3] == "ARIMA (current)"]
    no_change = [r for r in rows if r[3] == "No change"]
    assert [r[4:] for r in arima] == [r[4:] for r in no_change]


def test_tree_model_only_learns_from_days_whose_outcome_was_known(monkeypatch):
    close, volume, vix = backtest.synthetic_prices(n_stocks=3, n_days=450)
    features, targets = backtest.build_features(close, volume, vix)
    origins = list(range(330, 440, backtest.ORIGIN_STEP))

    last_training_day = []
    real_tree_models = backtest.tree_models

    def recording(train_x, train_y):
        last_training_day.append(train_x.index.get_level_values(0).max())
        return real_tree_models(train_x, train_y)

    monkeypatch.setattr(backtest, "tree_models", recording)
    rows = backtest.tree_forecasts(features, targets, close.index, origins)

    retrain_every = max(1, backtest.RETRAIN_STEP // backtest.ORIGIN_STEP)
    retrain_days = origins[::retrain_every]
    assert len(last_training_day) == len(retrain_days)
    for trained_until, origin in zip(last_training_day, retrain_days):
        # The 7-day outcome of the last training row must be known on the forecast day
        assert trained_until <= close.index[origin - max(backtest.HORIZONS)]
    assert {r[3] for r in rows} == {"Trees (new)"}
    assert all(low <= mid <= high for *_, low, mid, high in rows)


def test_runs_end_to_end_on_made_up_prices():
    close, volume, vix = backtest.synthetic_prices(n_stocks=3, n_days=520)

    scored, origins, failures = backtest.run_backtest(close, volume, vix, test_days=60, workers=1)
    text = backtest.report(scored, close, origins, failures, seconds=3)

    counts = scored["model"].value_counts()
    assert set(counts.index) == set(backtest.MODELS)
    assert counts.nunique() == 1  # every model scored on the same forecasts
    assert len(scored) == len(backtest.MODELS) * 3 * len(origins) * len(backtest.HORIZONS)
    # Made-up prices are random walks, so the no-change range should hold most outcomes
    no_change = scored[scored["model"] == "No change"]
    assert 0.6 < no_change["inside"].mean() < 0.97
    assert "3 stocks" in text
    assert "## Verdict" in text
    for model in backtest.MODELS:
        assert f"| {model} |" in text


def test_report_mentions_arima_failures():
    close, volume, vix = backtest.synthetic_prices(n_stocks=2, n_days=500)
    scored, origins, _ = backtest.run_backtest(close, volume, vix, test_days=30, workers=1)

    assert "ARIMA failed 4 times" in backtest.report(scored, close, origins, 4, seconds=1)


def test_too_little_history_stops_with_a_message():
    close, volume, vix = backtest.synthetic_prices(n_stocks=2, n_days=300)

    with pytest.raises(SystemExit, match="Not enough price history"):
        backtest.run_backtest(close, volume, vix, test_days=60, workers=1)


def fake_download(frames):
    """A stand-in for yfinance.download that returns each of `frames` in turn."""
    calls = []

    def download(symbols, **kwargs):
        calls.append(symbols)
        return frames[len(calls) - 1]

    return download, calls


def yahoo_frame(days=30):
    dates = pd.bdate_range("2026-01-05", periods=days)
    symbols = ["AAA", "NEW", "SPY", "^VIX"]
    columns = pd.MultiIndex.from_product([["Close", "Volume"], symbols])
    data = pd.DataFrame(1.0, index=dates, columns=columns)
    data[("Close", "NEW")] = [np.nan] * (days // 2) + [5.0] * (days - days // 2)  # listed mid-way
    return data


def test_download_keeps_stocks_with_a_full_history(monkeypatch):
    download, calls = fake_download([pd.DataFrame(), yahoo_frame()])  # the first try fails
    monkeypatch.setattr("yfinance.download", download)
    monkeypatch.setattr(backtest.time, "sleep", lambda seconds: None)

    close, volume, vix = backtest.download_prices(["AAA", "NEW"], years=1)

    assert len(calls) == 2
    assert calls[0] == ["AAA", "NEW", "SPY", "^VIX"]
    assert list(close.columns) == ["AAA", "SPY"]
    assert list(volume.columns) == ["AAA", "SPY"]
    assert len(vix) == len(close) == 30


def test_download_gives_up_after_four_empty_tries(monkeypatch):
    download, calls = fake_download([pd.DataFrame()] * 4)
    monkeypatch.setattr("yfinance.download", download)
    monkeypatch.setattr(backtest.time, "sleep", lambda seconds: None)

    with pytest.raises(SystemExit):
        backtest.download_prices(["AAA"], years=1)
    assert len(calls) == 4


def test_main_writes_the_report(monkeypatch, tmp_path, capsys):
    small = backtest.synthetic_prices(n_stocks=2, n_days=500)
    monkeypatch.setattr(backtest, "synthetic_prices", lambda: small)
    real_run = backtest.run_backtest
    monkeypatch.setattr(backtest, "run_backtest", lambda *args: real_run(*args, workers=1))
    out = tmp_path / "report.md"
    monkeypatch.setattr(sys, "argv", ["backtest_forecast.py", "--synthetic", "--test-years", "0.1", "--out", str(out)])

    backtest.main()

    assert out.read_text().startswith("# Forecast backtest")
    assert "# Forecast backtest" in capsys.readouterr().out
