# In backend/app.py
import os
import sys # Import the sys module
from flask import Flask, jsonify, request
from flask_cors import CORS
from services.news_fetcher import fetch_news
from services.sentiment import analyze_sentiment
import yfinance as yf
import requests
import json
from dotenv import load_dotenv

# This helper function finds the correct path for bundled files
def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

load_dotenv()
ALPHAVANTAGE_KEY = os.getenv("ALPHAVANTAGE_KEY")

# Use the helper function to open stocks.json
stocks_json_path = resource_path("stocks.json")
with open(stocks_json_path, "r") as f:
    LOCAL_STOCKS = json.load(f)

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
    # ... (no changes needed here)
    ticker = request.args.get("stock", "TSLA")
    stock = yf.Ticker(ticker)
    data = stock.history(period="1d", interval="1m")  # intraday
    if data.empty:
        return jsonify({"error": "No data"}), 404
    latest = data.tail(1)
    price = latest["Close"].iloc[0]
    change = ((latest["Close"].iloc[0] - latest["Open"].iloc[0]) / latest["Open"].iloc[0]) * 100

    return jsonify({
        "ticker": ticker,
        "price": round(price, 2),
        "change": round(change, 2)
    })


@app.route("/price_history", methods=["GET"])
def price_history():
    # ... (no changes needed here)
    ticker = request.args.get("stock", "TSLA")
    stock = yf.Ticker(ticker)

    # Get last trading day intraday data (1-minute interval)
    hist = stock.history(period="1d", interval="5m")  # 5m keeps chart cleaner
    if hist.empty:
        return jsonify({"error": "No data"}), 404

    result = []
    for timestamp, row in hist.iterrows():
        result.append({
            "time": timestamp.isoformat(),
            "price": round(row["Close"], 2)
        })

    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
