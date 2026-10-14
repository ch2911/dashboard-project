"""Checking that a ticker from a request looks like a real one before it's sent to Yahoo Finance.

Anyone can call the API, so without this check any text (very long strings, odd characters) would
be passed on to Yahoo and used as a cache key. Matches frontend/utils/stockLinks.ts.
"""
import re

# Yahoo Finance tickers: letters and digits, plus "." (RR.L), "-" (BRK-B), "=" (GBPUSD=X) and "^" (^GSPC)
TICKER_PATTERN = re.compile(r"^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$")


def clean_ticker(raw):
    """The ticker in upper case, or None if it doesn't look like a ticker."""
    ticker = (raw or "").strip().upper()
    return ticker if TICKER_PATTERN.fullmatch(ticker) else None
