"""Compares forecast models on past prices, to decide whether to replace the dashboard's ARIMA.

Usage:
    python scripts/backtest_forecast.py [--years 5] [--test-years 2] [--out report.md]
    python scripts/backtest_forecast.py --synthetic   # quick run on made-up prices, no network

Three models forecast each stock's closing price 1 to 7 trading days ahead, each as a middle
line plus a likely range (the 10th to 90th percentile):

- No change: the price stays where it is. The range comes from the stock's recent volatility.
- ARIMA: what the dashboard uses now, ARIMA(10,1,0) fitted on the last 6 months of prices.
- Trees: one gradient-boosted tree model trained on every stock together, using recent returns,
  volatility, volume, the S&P 500 (SPY) and the VIX.

Every forecast is made "walk-forward": a model only sees prices up to the day it forecasts from,
so the scores show how it would really have done.
"""
import argparse
import json
import os
import sys
import time
import warnings
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm
from sklearn.ensemble import HistGradientBoostingRegressor
from statsmodels.tsa.arima.model import ARIMA
from threadpoolctl import threadpool_limits

HORIZONS = range(1, 8)
QUANTILES = (0.1, 0.5, 0.9)
Z90 = norm.ppf(0.9)  # how many standard deviations the 90th percentile is above the middle

ARIMA_WINDOW = 126  # about 6 months of trading days, like the dashboard
ORIGIN_STEP = 5  # forecast from every 5th trading day in the test period
RETRAIN_STEP = 126  # retrain the tree model about every 6 months
WARMUP = 60  # days of history the longest feature needs

STOCKS_FILE = Path(__file__).resolve().parent.parent / "backend" / "stocks.json"


# ---------------------------------------------------------------------------------------------
# Price data


def download_prices(tickers, years):
    """Daily adjusted closes and volumes from Yahoo Finance, as two date x ticker tables."""
    import yfinance as yf

    symbols = tickers + ["SPY", "^VIX"]
    for attempt in range(4):
        data = yf.download(
            symbols, period=f"{years}y", interval="1d", auto_adjust=True,
            group_by="column", progress=False, threads=False,
        )
        if not data.empty:
            break
        time.sleep(10 * (attempt + 1))
    else:
        sys.exit("Yahoo Finance returned no data")

    close = data["Close"]
    volume = data["Volume"]
    vix = close.pop("^VIX")
    volume = volume.drop(columns="^VIX")
    # Keep the days SPY traded on, and stocks with a full price history over the period
    close = close[close["SPY"].notna()]
    volume = volume.loc[close.index]
    complete = close.columns[close.notna().mean() > 0.99]
    close = close[complete].ffill()
    volume = volume[complete].ffill()
    vix = vix.reindex(close.index).ffill()
    return close, volume, vix


def synthetic_prices(n_stocks=12, n_days=750, seed=0):
    """Made-up prices with a shared market factor and changing volatility, for a quick test run."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range("2023-01-02", periods=n_days)
    market_vol = 0.01 * np.exp(np.cumsum(rng.normal(0, 0.05, n_days)).clip(-1, 1))
    market = rng.normal(0.0003, 1, n_days) * market_vol
    tickers = [f"S{i:02d}" for i in range(n_stocks)] + ["SPY"]
    returns = {}
    for t in tickers:
        beta = 1.0 if t == "SPY" else rng.uniform(0.5, 1.5)
        own = 0 if t == "SPY" else rng.normal(0, 0.012, n_days)
        returns[t] = beta * market + own
    close = 100 * np.exp(pd.DataFrame(returns, index=dates).cumsum())
    volume = pd.DataFrame(rng.lognormal(15, 0.3, close.shape), index=dates, columns=tickers)
    vix = pd.Series(100 * market_vol * np.sqrt(252), index=dates)
    return close, volume, vix


# ---------------------------------------------------------------------------------------------
# Features for the tree model


def build_features(close, volume, vix):
    """One row per (date, stock) with everything known at that day's close."""
    logp = np.log(close)
    r1 = logp.diff()
    vol20 = r1.rolling(20).std()
    stock_features = {
        "ret_1": r1,
        "ret_5": logp.diff(5),
        "ret_10": logp.diff(10),
        "ret_20": logp.diff(20),
        "ret_60": logp.diff(60),
        "vol_5": r1.rolling(5).std(),
        "vol_20": vol20,
        "vol_60": r1.rolling(60).std(),
        "ret_5_z": logp.diff(5) / (vol20 * np.sqrt(5)),
        "ret_20_z": logp.diff(20) / (vol20 * np.sqrt(20)),
        "gap_ma20": logp - logp.rolling(20).mean(),
        "gap_ma60": logp - logp.rolling(60).mean(),
        "volume_ratio": np.log(volume.rolling(5).mean() / volume.rolling(60).mean()),
    }
    spy = logp["SPY"]
    log_vix = np.log(vix)
    market_features = {
        "spy_ret_1": spy.diff(),
        "spy_ret_5": spy.diff(5),
        "spy_ret_20": spy.diff(20),
        "vix": log_vix,
        "vix_change_5": log_vix.diff(5),
    }
    stocks = [t for t in close.columns if t != "SPY"]
    frames = []
    for name, table in stock_features.items():
        frames.append(table[stocks].stack(future_stack=True).rename(name))
    features = pd.concat(frames, axis=1)
    dates = features.index.get_level_values(0)
    for name, series in market_features.items():
        features[name] = series.reindex(dates).to_numpy()
    features = features.replace([np.inf, -np.inf], np.nan)

    targets = pd.concat(
        [(logp.shift(-h) - logp)[stocks].stack(future_stack=True).rename(h) for h in HORIZONS],
        axis=1,
    )
    return features, targets


# ---------------------------------------------------------------------------------------------
# Models. Each returns log returns from the last close: {horizon: (low, middle, high)}.


def no_change_forecast(prices):
    sigma = np.diff(np.log(prices[-ARIMA_WINDOW:])).std()
    return {h: (-Z90 * sigma * np.sqrt(h), 0.0, Z90 * sigma * np.sqrt(h)) for h in HORIZONS}


def arima_forecast(prices):
    window = prices[-ARIMA_WINDOW:]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = ARIMA(window, order=(10, 1, 0)).fit(method="burg")
        result = fit.get_forecast(steps=len(HORIZONS))
    middle = np.asarray(result.predicted_mean)
    bounds = np.asarray(result.conf_int(alpha=0.2))
    last = window[-1]
    out = {}
    for i, h in enumerate(HORIZONS):
        prices_h = np.array([bounds[i, 0], middle[i], bounds[i, 1]])
        if not np.all(np.isfinite(prices_h)) or np.any(prices_h <= 0):
            raise ValueError("ARIMA forecast isn't a usable price")
        out[h] = tuple(np.log(prices_h / last))
    return out


def _one_thread_per_process():
    # Each process fits its own ARIMAs, so stop numpy also spreading each fit over every core
    threadpool_limits(1)


def _forecast_one_stock(args):
    """No-change and ARIMA forecasts for one stock at every origin (run in a separate process)."""
    ticker, prices, origins = args
    rows = []
    failures = 0
    for pos in origins:
        history = prices[: pos + 1]
        base = no_change_forecast(history)
        try:
            arima = arima_forecast(history)
        except Exception:
            # Count it, and score ARIMA as "no change" for this forecast, like a fallback would
            failures += 1
            arima = base
        for h in HORIZONS:
            rows.append((pos, ticker, h, "No change", *base[h]))
            rows.append((pos, ticker, h, "ARIMA (current)", *arima[h]))
    return rows, failures


def tree_models(train_x, train_y):
    """One quantile model per horizon and percentile."""
    models = {}
    for h in HORIZONS:
        known = train_y[h].notna()
        for q in QUANTILES:
            model = HistGradientBoostingRegressor(
                loss="quantile", quantile=q, max_iter=200, learning_rate=0.05,
                max_leaf_nodes=15, min_samples_leaf=200, l2_regularization=1.0, random_state=0,
            )
            model.fit(train_x[known], train_y.loc[known, h])
            models[h, q] = model
    return models


def tree_forecasts(features, targets, dates, origins):
    rows = []
    date_pos = pd.Series(np.arange(len(dates)), index=dates)
    row_pos = date_pos.reindex(features.index.get_level_values(0)).to_numpy()
    models = None
    for i, pos in enumerate(origins):
        if models is None or i % max(1, RETRAIN_STEP // ORIGIN_STEP) == 0:
            # Train only on rows whose 7-day outcome was already known on this day
            train = (row_pos >= WARMUP) & (row_pos + max(HORIZONS) <= pos)
            models = tree_models(features[train], targets[train])
        today = features[row_pos == pos].dropna()
        if today.empty:
            continue
        tickers = today.index.get_level_values(1)
        for h in HORIZONS:
            predicted = np.sort(
                np.column_stack([models[h, q].predict(today) for q in QUANTILES]), axis=1
            )
            for ticker, (low, mid, high) in zip(tickers, predicted):
                rows.append((pos, ticker, h, "Trees (new)", low, mid, high))
    return rows


# ---------------------------------------------------------------------------------------------
# Scoring


def pinball(actual, predicted, q):
    diff = actual - predicted
    return np.maximum(q * diff, (q - 1) * diff)


def score(forecasts, close):
    logp = np.log(close)
    actual = []
    for pos, ticker, h in zip(forecasts["pos"], forecasts["ticker"], forecasts["h"]):
        actual.append(logp[ticker].iat[pos + h] - logp[ticker].iat[pos])
    f = forecasts.assign(actual=actual)
    f["abs_error"] = (f["actual"] - f["mid"]).abs()
    f["range_loss"] = sum(pinball(f["actual"], f[col], q) for col, q in zip(("low", "mid", "high"), QUANTILES)) / 3
    f["inside"] = (f["actual"] >= f["low"]) & (f["actual"] <= f["high"])
    f["width"] = f["high"] - f["low"]
    moved = (f["mid"] != 0) & (f["actual"] != 0)
    f["right_direction"] = np.where(moved, np.sign(f["mid"]) == np.sign(f["actual"]), np.nan)
    return f


def bootstrap_difference(scored, model, baseline, column, n=2000, seed=0):
    """Mean % change in `column` vs the baseline, with a 95% interval from resampling forecast days.

    Resampling whole days keeps stocks that moved together on the same day together.
    """
    per_day = scored.pivot_table(index="pos", columns="model", values=column, aggfunc="mean")
    a, b = per_day[model].to_numpy(), per_day[baseline].to_numpy()
    rng = np.random.default_rng(seed)
    picks = rng.integers(0, len(a), size=(n, len(a)))
    ratios = a[picks].mean(axis=1) / b[picks].mean(axis=1)
    point = a.mean() / b.mean()
    return 100 * (point - 1), 100 * (np.percentile(ratios, 2.5) - 1), 100 * (np.percentile(ratios, 97.5) - 1)


def report(scored, close, origins, arima_failures, seconds):
    models = ["No change", "ARIMA (current)", "Trees (new)"]
    first, last = close.index[origins[0]].date(), close.index[origins[-1]].date()
    n_stocks = scored["ticker"].nunique()
    lines = [
        "# Forecast backtest",
        "",
        f"{n_stocks} stocks, forecasting from {len(origins)} days between {first} and {last}, "
        f"1 to 7 trading days ahead ({len(scored) // len(models):,} forecasts per model). "
        f"Took {seconds / 60:.1f} minutes.",
        "",
        "## Overall",
        "",
        "Lower is better for both errors. \"In range\" should be close to 80%.",
        "",
        "| Model | Middle-line error | Range score | In range | Range width | Right direction |",
        "|---|---|---|---|---|---|",
    ]
    for m in models:
        s = scored[scored["model"] == m]
        direction = "n/a" if m == "No change" else f"{100 * s['right_direction'].mean():.1f}%"
        lines.append(
            f"| {m} | {100 * s['abs_error'].mean():.3f}% | {100 * s['range_loss'].mean():.4f} | "
            f"{100 * s['inside'].mean():.1f}% | ±{50 * s['width'].mean():.2f}% | {direction} |"
        )
    lines += [
        "",
        "Middle-line error is the average gap between the forecast and the real price, as a % of "
        "the price. Range score (pinball loss) rewards ranges that are narrow but still contain "
        "the real price.",
        "",
        "## Compared with \"no change\"",
        "",
        "Negative means better than assuming the price stays the same. The 95% interval comes "
        "from resampling the forecast days; if it includes 0, the difference could be luck.",
        "",
        "| Model | Middle-line error | Range score |",
        "|---|---|---|",
    ]
    verdict = {}
    for m in models[1:]:
        err = bootstrap_difference(scored, m, "No change", "abs_error")
        rng_ = bootstrap_difference(scored, m, "No change", "range_loss")
        verdict[m] = (err, rng_)
        lines.append(
            f"| {m} | {err[0]:+.2f}% ({err[1]:+.2f}% to {err[2]:+.2f}%) | "
            f"{rng_[0]:+.2f}% ({rng_[1]:+.2f}% to {rng_[2]:+.2f}%) |"
        )
    trees_vs_arima = bootstrap_difference(scored, "Trees (new)", "ARIMA (current)", "range_loss")
    lines += [
        "",
        f"Trees vs ARIMA on range score: {trees_vs_arima[0]:+.2f}% "
        f"({trees_vs_arima[1]:+.2f}% to {trees_vs_arima[2]:+.2f}%).",
        "",
        "## Middle-line error by horizon",
        "",
        "| Days ahead | " + " | ".join(models) + " |",
        "|---|" + "---|" * len(models),
    ]
    by_h = scored.pivot_table(index="h", columns="model", values="abs_error", aggfunc="mean")
    for h in HORIZONS:
        lines.append(f"| {h} | " + " | ".join(f"{100 * by_h.loc[h, m]:.3f}%" for m in models) + " |")

    trees_range = verdict["Trees (new)"][1]
    beats_no_change = trees_range[2] < 0
    beats_arima = trees_vs_arima[2] < 0
    lines += ["", "## Verdict", ""]
    if beats_no_change and beats_arima:
        lines.append("The tree model's range score is better than both other models, beyond what "
                     "luck would explain. Switching is worth it.")
    elif beats_arima:
        lines.append("The tree model beats the current ARIMA, but not clearly \"no change\".")
    else:
        lines.append("The tree model doesn't clearly beat the current ARIMA.")
    if arima_failures:
        lines.append(f"\nARIMA failed {arima_failures} times; those were scored as \"no change\".")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--years", type=int, default=5, help="years of prices to download")
    parser.add_argument("--test-years", type=float, default=2, help="years at the end to forecast")
    parser.add_argument("--synthetic", action="store_true", help="use made-up prices (no network)")
    parser.add_argument("--out", help="also write the report to this Markdown file")
    args = parser.parse_args()

    started = time.time()
    if args.synthetic:
        close, volume, vix = synthetic_prices()
    else:
        tickers = [s["symbol"] for s in json.loads(STOCKS_FILE.read_text())]
        close, volume, vix = download_prices(tickers, args.years)
    stocks = [t for t in close.columns if t != "SPY"]
    print(f"Prices for {len(stocks)} stocks over {len(close)} days", file=sys.stderr)

    n_test = int(args.test_years * 252)
    first_origin = max(len(close) - n_test, WARMUP + ARIMA_WINDOW + 2 * RETRAIN_STEP)
    origins = list(range(first_origin, len(close) - max(HORIZONS), ORIGIN_STEP))

    rows = []
    jobs = [(t, close[t].to_numpy(), origins) for t in stocks]
    arima_failures = 0
    with ProcessPoolExecutor(max_workers=os.cpu_count(), initializer=_one_thread_per_process) as pool:
        for stock_rows, failures in pool.map(_forecast_one_stock, jobs):
            rows += stock_rows
            arima_failures += failures
    print(f"ARIMA and no-change done after {time.time() - started:.0f}s", file=sys.stderr)

    features, targets = build_features(close, volume, vix)
    rows += tree_forecasts(features, targets, close.index, origins)
    print(f"Tree model done after {time.time() - started:.0f}s", file=sys.stderr)

    forecasts = pd.DataFrame(rows, columns=["pos", "ticker", "h", "model", "low", "mid", "high"])
    # Score each model on the same forecasts only
    keys = ["pos", "ticker", "h"]
    counts = forecasts.groupby(keys)["model"].transform("count")
    forecasts = forecasts[counts == 3]
    scored = score(forecasts, close)
    text = report(scored, close, origins, arima_failures, time.time() - started)
    print(text)
    if args.out:
        Path(args.out).write_text(text)


if __name__ == "__main__":
    main()
