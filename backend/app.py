import os

# Render's free plan gives this app a fraction of one CPU, but numpy's maths libraries start
# one thread per core on the host machine. Those threads then fight over that small share and
# make the forecast take over 30 seconds. One thread each avoids that. This has to run before
# numpy is imported (yfinance and statsmodels import it).
for _thread_var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_thread_var, "1")

import sys
import re
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from services.news_fetcher import fetch_news
from services.sentiment import analyze_sentiment
import requests
import json
from dotenv import load_dotenv
from services.predictor import predict_stock_price
from services.cache import TTLCache
from services.market_data import get_history
from services import accounts
from yfinance.exceptions import YFRateLimitError

# This helper function finds the correct path for bundled files
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_path, relative_path)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


@app.errorhandler(YFRateLimitError)
def handle_yahoo_rate_limit(error):
    """Yahoo Finance still refused after the retries in market_data. Say so instead of a generic error."""
    app.logger.warning("Yahoo Finance rate limit on %s", request.full_path)
    return jsonify({"error": "Yahoo Finance is busy right now. Please try again in a minute."}), 503


@app.errorhandler(Exception)
def handle_error(error):
    """Return errors as JSON so they still carry the CORS header and the frontend can read them."""
    if isinstance(error, HTTPException):
        return jsonify({"error": error.description}), error.code
    app.logger.exception("Request to %s failed", request.full_path)
    return jsonify({"error": "Something went wrong getting this data. Please try again."}), 500

load_dotenv()
ALPHAVANTAGE_KEY = os.getenv("ALPHAVANTAGE_KEY")

# Use the helper function to open stocks.json
stocks_json_path = resource_path("stocks.json")
with open(stocks_json_path, "r") as f:
    LOCAL_STOCKS = json.load(f)

STOCK_NAMES = {stock["symbol"]: stock["name"] for stock in LOCAL_STOCKS}

# Alpha Vantage's free plan allows 25 requests a day, and company names rarely change,
# so search results are kept for a day.
_search_cache = TTLCache(seconds=24 * 60 * 60)

# Words to drop from company names before searching the news, e.g. "Goldman Sachs Group Inc."
# becomes "Goldman Sachs", which is how headlines refer to it.
_NAME_ENDINGS = re.compile(
    r"(,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|Company|Companies|Co\.|plc|PLC|p\.l\.c\.|"
    r"Ltd\.?|Limited|Group|Holdings?|Class [A-C]|Platforms|Technologies|Trust)|\s*&|\.com)$"
)


def short_company_name(name):
    previous = None
    while previous != name:
        previous = name
        name = _NAME_ENDINGS.sub("", name).strip()
    return name


def news_query(ticker):
    """NewsAPI search for a stock: its ticker and/or its company name.

    Very short tickers (e.g. "T", "GE") and ones with an exchange suffix (e.g. "RR.L") match too
    many unrelated words, so only the company name is used for those.
    """
    terms = []
    if len(ticker) >= 3 and "." not in ticker:
        terms.append(ticker)
    name = STOCK_NAMES.get(ticker)
    if name:
        terms.append(f'"{short_company_name(name)}"')
    return " OR ".join(terms) or ticker

def extract_symbols(text):
    """Extracts potential stock symbols from a string of text."""
    # A simple regex to find capitalized words/symbols
    potential_symbols = set(re.findall(r'\b[A-Z]{1,5}\b', text))

    # Filter against our known list of stocks for better accuracy
    known_symbols = {stock['symbol'] for stock in LOCAL_STOCKS}

    # Return the intersection, limited to 5
    return list(potential_symbols.intersection(known_symbols))[:5]

@app.route("/sentiment", methods=["GET"])
def get_sentiment():
    ticker = request.args.get("stock", "TSLA")
    articles = fetch_news(news_query(ticker), search_in="title,description")
    analyzed = [
        {
            "title": a["title"],
            "time": a["time"],
            "url": a["url"],
            "sentiment": analyze_sentiment(a["title"])
        }
        for a in articles
    ]
    return jsonify(analyzed)


@app.route("/search_stock", methods=["GET"])
def search_stock():
    query = request.args.get("q", "").lower().strip()
    if not query:
        return jsonify([])

    # 1. Search local stocks first
    matches = [
        stock for stock in LOCAL_STOCKS
        if query in stock["symbol"].lower() or query in stock["name"].lower()
    ]

    if matches:
        return jsonify(matches[:10])  # return up to 10 suggestions

    # 2. If not found, fall back to Alpha Vantage (results are cached for a day)
    cached = _search_cache.get(query)
    if cached is not None:
        return jsonify(cached)

    url = (
        f"https://www.alphavantage.co/query?function=SYMBOL_SEARCH"
        f"&keywords={query}&apikey={ALPHAVANTAGE_KEY}"
    )
    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        # Only the error type is logged: the message would include the URL, which contains the key
        app.logger.warning("Couldn't reach Alpha Vantage (%s)", type(e).__name__)
        return jsonify([]), 500

    if "bestMatches" not in data:
        # Alpha Vantage explains problems (missing key, daily limit reached) in one of these fields
        reason = data.get("Note") or data.get("Information") or data.get("Error Message") or "no reason given"
        app.logger.warning("Alpha Vantage search for %r returned no results: %s", query, reason)
        return jsonify([])

    results = []
    for item in data["bestMatches"]:
        symbol = item.get("1. symbol")
        name = item.get("2. name")
        if symbol and name:
            results.append({"symbol": symbol, "name": name})

    results = results[:10]
    _search_cache.set(query, results)
    return jsonify(results)


@app.route("/price", methods=["GET"])
def get_price():
    ticker = request.args.get("stock", "TSLA")
    # Daily bars: the last one is today's (updated live during market hours) and the one
    # before it is the previous close, so "change" is the day's move, as on a stock app.
    data = get_history(ticker, period="5d", interval="1d", cache_seconds=60)
    closes = data["Close"].dropna() if "Close" in data else []
    if len(closes) == 0:
        return jsonify({"error": "No data"}), 404

    price = float(closes.iloc[-1])
    if len(closes) > 1:
        previous_close = float(closes.iloc[-2])
        change = (price - previous_close) / previous_close * 100
    else:
        change = 0.0  # only one day of data, e.g. a new listing

    return jsonify({
        "ticker": ticker,
        "price": round(price, 2),
        "change": round(change, 2)
    })

@app.route("/price_history", methods=["GET"])
def price_history():
    ticker = request.args.get("stock", "TSLA")
    # Get the requested time range, defaulting to 'daily'
    time_range = request.args.get("range", "daily")

    if time_range == 'intraday':
        # Today's prices in 5-minute steps, reused for 5 minutes
        hist = get_history(ticker, period="1d", interval="5m", cache_seconds=5 * 60)
    else:
        # Default to daily data for the last 3 months, reused for 15 minutes
        hist = get_history(ticker, period="3mo", interval="1d", cache_seconds=15 * 60)

    if hist.empty:
        return jsonify({"error": "No data"}), 404

    result = []
    for timestamp, row in hist.iterrows():
        result.append({
            "time": timestamp.isoformat(),
            "price": round(row["Close"], 2)
        })

    return jsonify(result)

@app.route("/trending_news", methods=["GET"])
def get_trending_news():
    # Use a general query for broad financial news
    articles = fetch_news("finance OR markets")

    analyzed = []
    for a in articles:
        # For each article, extract affected stocks
        affected_stocks = extract_symbols(a['title'])
        analyzed.append({
            "title": a["title"],
            "time": a["time"],
            "url": a["url"],
            "sentiment": analyze_sentiment(a["title"]),
            "affected_stocks": affected_stocks,
        })

    return jsonify(analyzed)

@app.route("/predict", methods=["GET"])
def get_prediction():
    ticker = request.args.get("stock", "TSLA")
    predictions = predict_stock_price(ticker)
    return jsonify(predictions)

@app.route("/account", methods=["DELETE"])
def delete_account():
    """Delete the signed-in user's profile: their pinned stocks and their Supabase login.

    The frontend sends the user's Supabase access token, which proves who is asking. Deleting a
    login needs Supabase's service role key, which must stay on the server.
    """
    if not accounts.is_configured():
        return jsonify({"error": "Deleting profiles isn't set up on the server yet."}), 503

    header = request.headers.get("Authorization", "")
    token = header[len("Bearer "):].strip() if header.startswith("Bearer ") else ""
    if not token:
        return jsonify({"error": "Please sign in again."}), 401

    user_id = accounts.user_id_for_token(token)
    if user_id is None:
        return jsonify({"error": "Please sign in again."}), 401

    accounts.delete_user(user_id)
    return jsonify({"deleted": True})


@app.route("/health", methods=["GET"])
def health():
    """For uptime checks: confirms the server is running and which API keys are set (not their values)."""
    return jsonify({
        "status": "ok",
        "keys": {
            "newsapi": bool(os.getenv("NEWSAPI_KEY")),
            "alphavantage": bool(ALPHAVANTAGE_KEY),
        },
        # Optional features, reported separately so the smoke test doesn't fail without them
        "features": {
            "delete_profile": accounts.is_configured(),
        },
    })


if __name__ == "__main__":
    app.run(debug=True)
