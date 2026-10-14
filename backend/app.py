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
import yfinance as yf
import requests
import json
from dotenv import load_dotenv
from services.predictor import predict_stock_price

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

def extract_symbols(text):
    """Extracts potential stock symbols from a string of text."""
    # A simple regex to find capitalized words/symbols
    potential_symbols = set(re.findall(r'\b[A-Z]{1,5}\b', text))

    # Filter against our known list of stocks for better accuracy
    known_symbols = {stock['symbol'] for stock in LOCAL_STOCKS}

    # Return the intersection, limited to 5
    return list(potential_symbols.intersection(known_symbols))[:5]

# --- All of your @app.route functions remain exactly the same below ---

@app.route("/sentiment", methods=["GET"])
def get_sentiment():
    # ... (no changes needed here)
    ticker = request.args.get("stock", "TSLA")
    articles = fetch_news(ticker)
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
    # ... (no changes needed here)
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

    # 2. If not found, fallback to Alpha Vantage
    url = (
        f"https://www.alphavantage.co/query?function=SYMBOL_SEARCH"
        f"&keywords={query}&apikey={ALPHAVANTAGE_KEY}"
    )
    try:
        r = requests.get(url, timeout=5)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print("Error contacting Alpha Vantage:", e)
        return jsonify([]), 500

    av_matches = data.get("bestMatches", [])
    results = []
    for item in av_matches:
        symbol = item.get("1. symbol")
        name = item.get("2. name")
        if symbol and name:
            results.append({"symbol": symbol, "name": name})

    return jsonify(results[:10])


@app.route("/price", methods=["GET"])
def get_price():
    ticker = request.args.get("stock", "TSLA")
    # Daily bars: the last one is today's (updated live during market hours) and the one
    # before it is the previous close, so "change" is the day's move, as on a stock app.
    data = yf.Ticker(ticker).history(period="5d", interval="1d")
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

    stock = yf.Ticker(ticker)

    if time_range == 'intraday':
        # Fetch intraday data for the last day
        hist = stock.history(period="1d", interval="5m")
    else:
        # Default to daily data for the last 3 months
        hist = stock.history(period="3mo", interval="1d")

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

if __name__ == "__main__":
    app.run(debug=True)
