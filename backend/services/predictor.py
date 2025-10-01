import yfinance as yf
from statsmodels.tsa.arima.model import ARIMA
import pandas as pd

def predict_stock_price(ticker):
    try:
        # Fetch a longer history for a more stable model
        stock_data = yf.Ticker(ticker).history(period="3mo", interval="1d")
        if stock_data.empty:
            return []

        # We will predict the 'Close' price
        model = ARIMA(stock_data['Close'], order=(5,1,0))
        model_fit = model.fit()

        # Predict the next 7 days
        predictions = model_fit.forecast(steps=7)

        # Format the predictions for the frontend
        last_date = stock_data.index[-1]
        future_dates = pd.to_datetime([last_date + pd.DateOffset(days=i) for i in range(1, 8)])

        return [
            {"time": date.isoformat(), "price": round(price, 2)}
            for date, price in zip(future_dates, predictions)
        ]
    except Exception as e:
        print(f"Prediction failed for {ticker}: {e}")
        return []