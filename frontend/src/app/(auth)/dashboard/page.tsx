"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import { fetchPrice, fetchPriceHistory, fetchSentiment, fetchPrediction, type SentimentResult } from "../../../../utils/api";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

type StockPrice = {
    ticker: string;
    price: number;
    change: number;
};

type PricePoint = {
    time: string;
    price: number;
};

type ChartDataPoint = {
    name: string;
    [key: string]: string | number | undefined; // Allow any stock ticker as a key
};

export default function Dashboard() {
    const { pinned } = usePinnedStocks();

    const [prices, setPrices] = useState<Record<string, StockPrice>>({});
    const [histories, setHistories] = useState<Record<string, PricePoint[]>>({});
    const [sentiments, setSentiments] = useState<(SentimentResult & { ticker: string })[]>([]);
    const [predictions, setPredictions] = useState<Record<string, PricePoint[]>>({}); // State for predictions

    useEffect(() => {
        if (!pinned.length) return;

        const loadData = async () => {
            const priceResults: Record<string, StockPrice> = {};
            const historyResults: Record<string, PricePoint[]> = {};
            const predictionResults: Record<string, PricePoint[]> = {};
            let sentimentResults: (SentimentResult & { ticker: string })[] = [];

            for (const ticker of pinned) {
                const [p, h, s, pred] = await Promise.all([
                    fetchPrice(ticker),
                    fetchPriceHistory(ticker),
                    fetchSentiment(ticker),
                    fetchPrediction(ticker), // Fetch prediction for each pinned stock
                ]);

                priceResults[ticker] = p;
                historyResults[ticker] = h;
                predictionResults[ticker] = pred;
                sentimentResults = [...sentimentResults, ...s.map((item) => ({ ...item, ticker }))];
            }

            const unique = new Map(sentimentResults.map((s) => [`${s.ticker}-${s.time}-${s.title}`, s]));
            setPrices(priceResults);
            setHistories(historyResults);
            setPredictions(predictionResults);
            setSentiments(Array.from(unique.values()));
        };

        loadData();
    }, [pinned]);

    const chartData = (() => {
        if (!pinned.length || !Object.keys(histories).length) return [];

        const allPoints = new Map<string, ChartDataPoint>();

        // Add historical data
        pinned.forEach(ticker => {
            if (histories[ticker]) {
                histories[ticker].forEach(pt => {
                    const d = new Date(pt.time);
                    const name = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
                    if (!allPoints.has(name)) allPoints.set(name, { name });
                    allPoints.get(name)![ticker] = pt.price;
                });
            }
        });

        // Add prediction data, creating the bridge
        pinned.forEach(ticker => {
            const tickerHistory = histories[ticker];
            const tickerPrediction = predictions[ticker];
            if (tickerHistory && tickerHistory.length > 0 && tickerPrediction && tickerPrediction.length > 0) {
                // Bridge point
                const lastHistoryPoint = tickerHistory[tickerHistory.length - 1];
                const d = new Date(lastHistoryPoint.time);
                const name = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
                if (allPoints.has(name)) {
                    allPoints.get(name)![`${ticker}-pred`] = lastHistoryPoint.price;
                }

                // Future points
                tickerPrediction.forEach(pt => {
                    const d = new Date(pt.time);
                    const name = new Intl.DateTimeFormat("en-GB", { day: '2-digit', month: 'short' }).format(d);
                    if (!allPoints.has(name)) allPoints.set(name, { name });
                    allPoints.get(name)![`${ticker}-pred`] = pt.price;
                });
            }
        });

        return Array.from(allPoints.values());
    })();

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-700 to-sky-500 text-white p-6">
            <h1 className="text-3xl font-bold mb-6">📊 My Pinned Stocks</h1>

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Portfolio Overview & Predictions</h2>
                <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <XAxis dataKey="name" stroke="#bae6fd" />
                            <YAxis stroke="#bae6fd" />
                            <Tooltip />
                            {pinned.map((ticker, i) => (
                                <Line
                                    key={ticker}
                                    type="monotone"
                                    dataKey={ticker}
                                    strokeWidth={2}
                                    stroke={["#38bdf8", "#f472b6", "#a78bfa", "#facc15"][i % 4]}
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                            {pinned.map((ticker, i) => (
                                <Line
                                    key={`${ticker}-pred`}
                                    name={`${ticker} (Pred.)`}
                                    type="monotone"
                                    dataKey={`${ticker}-pred`}
                                    stroke="#4ade80"
                                    strokeWidth={2}
                                    strokeDasharray="3 3"
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Your Favorites</h2>
                <ul className="space-y-3">
                    {pinned.map((ticker) => {
                        const stock = prices[ticker];
                        return (
                            <li key={ticker}>
                                <Link
                                    href={`/stocks/${ticker}`}
                                    className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition"
                                >
                                    <span className="font-bold text-lg">{ticker}</span>
                                    {stock ? (
                                        <span>
                                            ${stock.price}{" "}
                                            <span className={`ml-2 font-bold ${ stock.change > 0 ? "text-green-400" : "text-red-400" }`}>
                                                {stock.change.toFixed(2)}%
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-sky-200">Loading...</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                <h2 className="text-xl font-semibold mb-3">News Sentiment</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {sentiments
                        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
                        .map((item, i) => {
                            const d = new Date(item.time);
                            const prettyTime = new Intl.DateTimeFormat("en-GB", {
                                timeZone: "Europe/London",
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "short",
                            }).format(d);

                            return (
                                <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="block p-3 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition">
                                    <div className="flex justify-between">
                                        <p className="font-medium text-white">[{item.ticker}] {item.title}</p>
                                        <span className="text-sm text-sky-200">{prettyTime}</span>
                                    </div>
                                    <p className={`text-sm mt-1 ${
                                        item.sentiment.label === "positive"
                                            ? "text-green-400"
                                            : item.sentiment.label === "negative"
                                                ? "text-red-400"
                                                : "text-gray-300"
                                    }`}>
                                        {item.sentiment.label} ({item.sentiment.score.toFixed(2)})
                                    </p>
                                </a>
                            );
                        })}
                </div>
            </section>
        </div>
    );
}
