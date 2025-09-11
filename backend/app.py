from flask import Flask, jsonify, request
from flask_cors import CORS
from services.news_fetcher import fetch_news
from services.sentiment import analyze_sentiment
import yfinance as yf

app = Flask(__name__)
CORS(app)

@app.route("/sentiment", methods=["GET"])
def get_sentiment():
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


@app.route("/price", methods=["GET"])
def get_price():
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
