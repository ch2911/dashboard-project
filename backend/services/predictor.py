import yfinance as yf
from statsmodels.tsa.arima.model import ARIMA
import pandas as pd

def predict_stock_price(ticker):
    try:
        # 1. FETCH MORE DATA: Changed from "3mo" to "6mo" for better long-term context.
        stock_data = yf.Ticker(ticker).history(period="6mo", interval="1d")
        if stock_data.empty:
            return []

        # 2. TWEAK THE MODEL: Changed order from (5,1,0) to (10,1,0).
        # This makes the model look at the last 10 days (instead of 5) to predict the next point,
        # making it more sensitive to the most recent trend.
        model = ARIMA(stock_data['Close'], order=(10,1,0))
        model_fit = model.fit()

        # Predict the next 7 days
        predictions = model_fit.forecast(steps=7)

        # Create future dates for the predictions
        last_date = stock_data.index[-1]
        future_dates = pd.to_datetime([last_date + pd.DateOffset(days=i) for i in range(1, 8)])

        return [
            {"time": date.isoformat(), "price": round(price, 2)}
            for date, price in zip(future_dates, predictions)
        ]
    except Exception as e:
        print(f"Prediction failed for {ticker}: {e}")
        return []