"""Price data from Yahoo Finance (through yfinance), with retries and short-lived caching.

Yahoo limits how many requests it answers from each IP address, and Render's free servers share
addresses with other apps, so Yahoo sometimes refuses with "Too Many Requests". This happens
especially on the first request after the server starts, when yfinance fetches a login cookie.
Trying again a few seconds later usually works, and reusing recent results means fewer requests.
"""
import logging
import time

import requests
import yfinance as yf
from yfinance.exceptions import YFRateLimitError

from services.cache import TTLCache

logger = logging.getLogger(__name__)

# Seconds to wait before the second and third attempts
RETRY_DELAYS = (2, 5)

# Errors that are worth retrying because they usually clear up by themselves
TEMPORARY_ERRORS = (YFRateLimitError, requests.exceptions.ConnectionError, requests.exceptions.Timeout)

_history_cache = TTLCache(seconds=60)

# Company names Yahoo sends along with the prices. They rarely change, so they're kept for a day.
_name_cache = TTLCache(seconds=24 * 60 * 60)


def clear_cache():
    _history_cache.clear()


def get_history(ticker, period, interval, cache_seconds):
    """Price history as a DataFrame (like yfinance's Ticker.history), reused for `cache_seconds`.

    Empty results aren't cached, so they're retried on the next request.
    """
    key = (ticker.upper(), period, interval)
    cached = _history_cache.get(key)
    if cached is not None:
        return cached

    data = _fetch_with_retries(ticker, period, interval)
    if not data.empty:
        _history_cache.set(key, data, seconds=cache_seconds)
    return data


def company_name(ticker):
    """The company's name from the last price download for this ticker, or None if there isn't one."""
    return _name_cache.get(ticker.upper())


def daily_move(data):
    """(latest price, % change from the previous close, date of the latest bar) from daily bars.

    The last daily bar is today's (updated live during market hours) and the one before it is the
    previous close, so the change is the day's move, as on a stock app. Returns None without data.
    """
    closes = data["Close"].dropna() if "Close" in data else []
    if len(closes) == 0:
        return None

    price = float(closes.iloc[-1])
    if len(closes) > 1:
        previous_close = float(closes.iloc[-2])
        change = (price - previous_close) / previous_close * 100
    else:
        change = 0.0  # only one day of data, e.g. a new listing
    return price, change, closes.index[-1].date()


def _fetch_with_retries(ticker, period, interval):
    for delay in RETRY_DELAYS:
        try:
            return _fetch(ticker, period, interval)
        except TEMPORARY_ERRORS as error:
            logger.warning("Yahoo Finance request for %s failed (%s), trying again in %ss",
                           ticker, type(error).__name__, delay)
            time.sleep(delay)
    # Last attempt: if this fails too, the error goes to the caller
    return _fetch(ticker, period, interval)


def _fetch(ticker, period, interval):
    stock = yf.Ticker(ticker)
    data = stock.history(period=period, interval=interval)
    _remember_name(ticker, stock)
    return data


def _remember_name(ticker, stock):
    """Save the company name Yahoo sent with the prices, so it costs no extra request."""
    try:
        metadata = stock.history_metadata or {}
    except Exception:
        return  # the name is a nice extra, so never let it break the prices
    name = metadata.get("longName") or metadata.get("shortName")
    if isinstance(name, str) and name.strip():
        _name_cache.set(ticker.upper(), name.strip())
