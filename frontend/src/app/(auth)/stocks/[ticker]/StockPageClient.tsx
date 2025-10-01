"use client";

import { useEffect, useState } from "react";
import {
    fetchSentiment,
    fetchPrice,
    fetchPriceHistory,
    fetchPrediction,
    type SentimentResult,
} from "../../../../../utils/api";
import { usePinnedStocks } from "../../../../../hooks/usePinnedStocks";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";
import {underline} from "next/dist/lib/picocolors";


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
    price?: number;
    prediction?: number;
};


export default function StockPageClient({ ticker }: { ticker: string }) {
    const { pinned, pinStock, unpinStock } = usePinnedStocks();
    const isPinned = pinned.includes(ticker);

    const [price, setPrice] = useState<StockPrice | null>(null);
    const [history, setHistory] = useState<PricePoint[]>([]);
    const [sentiment, setSentiment] = useState<SentimentResult[]>([]);
    const [prediction, setPrediction] = useState<PricePoint[]>([]);

    useEffect(() => {
        if (!ticker) return;

        setLoading(true); // Set loading state
        Promise.all([
            fetchPrice(ticker),
            fetchPriceHistory(ticker),
            fetchSentiment(ticker),
            fetchPrediction(ticker), // 3. Fetch prediction data
        ]).then(([priceData, historyData, sentimentData, predictionData]) => {
            setPrice(priceData);
            setHistory(historyData);
            setSentiment(sentimentData);
            setPrediction(predictionData);
            setLoading(false); // Clear loading state
        });
    }, [ticker]);

    const [loading, setLoading] = useState(true);

    const combinedChartData = (() => {
        if (!history.length) return [];

        const historicalPoints: ChartDataPoint[] = history.map((pt) => {
            const d = new Date(pt.time);
            const timeLabel = new Intl.DateTimeFormat("en-GB", {
                hour: "2-digit", minute: "2-digit", timeZone: "Europe/London",
            }).format(d);
            return { name: timeLabel, price: pt.price};
        });

        if (!prediction.length) return historicalPoints;

        const lastHistoryPoint = historicalPoints[historicalPoints.length - 1];

        lastHistoryPoint.prediction = lastHistoryPoint.price;

        const predictionPoints = prediction.map((pt) => {
            const d = new Date(pt.time);
            const timeLabel = new Intl.DateTimeFormat("en-GB", {
                day: '2-digit', month: 'short'
            }).format(d);
            return { name: timeLabel, prediction: pt.price };
        });

        return [...historicalPoints, ...predictionPoints];
    })();


    if (loading) {
        return <div className="text-center p-10">Loading stock data...</div>
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">{ticker}</h1>
                {isPinned ? (
                    <button onClick={() => unpinStock(ticker)} className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg shadow-md">
                        Unpin
                    </button>
                ) : (
                    <button onClick={() => pinStock(ticker)} className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg shadow-md">
                        Pin
                    </button>
                )}
            </div>

            {/* Stock Info */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                {/* ... (This section remains the same) ... */}
            </section>

            {/* Price Chart */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Price Chart & Prediction</h2>
                <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        {/* 5. Update the chart with the new data and lines */}
                        <LineChart data={combinedChartData}>
                            <XAxis dataKey="name" stroke="#bae6fd" />
                            <YAxis stroke="#bae6fd" domain={['dataMin - 1', 'dataMax + 1']} />
                            <Tooltip />
                            <Legend />
                            <Line
                                name="Historical Price"
                                type="monotone"
                                dataKey="price"
                                stroke="#38bdf8"
                                strokeWidth={2}
                                dot={false}
                                connectNulls
                            />
                            <Line
                                name="Predicted price"
                                type="monotone"
                                dataKey="prediction"
                                stroke="#4ade80"
                                strokeWidth={2}
                                strokeDasharray="5 5"
                                dot={false}
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* News Sentiment */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                <h2 className="text-xl font-semibold mb-3">Live News Sentiment</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {sentiment.map((item, i) => {
                        const d = new Date(item.time);
                        const prettyTime = new Intl.DateTimeFormat("en-GB", {
                            timeZone: "Europe/London",
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                        }).format(d);

                        return (
                            <a
                                key={i}
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition"
                            >
                                <div className="flex justify-between">
                                    <p className="font-medium text-white">{item.title}</p>
                                    <span className="text-sm text-sky-200">{prettyTime}</span>
                                </div>
                                <p
                                    className={`text-sm mt-1 ${
                                        item.sentiment.label === "positive"
                                            ? "text-green-400"
                                            : item.sentiment.label === "negative"
                                                ? "text-red-400"
                                                : "text-gray-300"
                                    }`}
                                >
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