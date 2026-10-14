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


def _fetch_with_retries(ticker, period, interval):
    for delay in RETRY_DELAYS:
        try:
            return yf.Ticker(ticker).history(period=period, interval=interval)
        except TEMPORARY_ERRORS as error:
            logger.warning("Yahoo Finance request for %s failed (%s), trying again in %ss",
                           ticker, type(error).__name__, delay)
            time.sleep(delay)
    # Last attempt: if this fails too, the error goes to the caller
    return yf.Ticker(ticker).history(period=period, interval=interval)
