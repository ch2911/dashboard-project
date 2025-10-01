"use client";

import { useEffect, useState } from "react";
import {
    fetchSentiment,
    fetchPrice,
    fetchPriceHistory,
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


// Accept ticker as a prop
export default function StockPageClient({ ticker }: { ticker: string }) {
    const { pinned, pinStock, unpinStock } = usePinnedStocks();
    const isPinned = pinned.includes(ticker);

    const [price, setPrice] = useState<StockPrice | null>(null);
    const [history, setHistory] = useState<PricePoint[]>([]);
    const [sentiment, setSentiment] = useState<SentimentResult[]>([]);

    useEffect(() => {
        if (!ticker) return;

        fetchPrice(ticker).then(setPrice);
        fetchPriceHistory(ticker).then(setHistory);
        fetchSentiment(ticker).then(setSentiment);
    }, [ticker]);

    const chartData = history.map((pt) => {
        const d = new Date(pt.time);
        const timeLabel = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/London",
        }).format(d);

        return { timeLabel, price: pt.price };
    });

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-700 to-sky-500 text-white p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">{ticker}</h1>
                {isPinned ? (
                    <button
                        onClick={() => unpinStock(ticker)}
                        className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg shadow-md"
                    >
                        Unpin
                    </button>
                ) : (
                    <button
                        onClick={() => pinStock(ticker)}
                        className="bg-green-500 hover:bg-green-600 px-4 py-2 rounded-lg shadow-md"
                    >
                        Pin
                    </button>
                )}
            </div>

            {/* Stock Info */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Stock Overview</h2>
                {price ? (
                    <div>
                        <p className="text-sky-200">Company: {ticker}</p>
                        <p>
                            Price:{" "}
                            <span className="font-bold text-white">${price.price}</span>{" "}
                            <span
                                className={`ml-2 font-bold ${
                                    price.change > 0 ? "text-green-400" : "text-red-400"
                                }`}
                            >
                {price.change}% today
              </span>
                        </p>
                    </div>
                ) : (
                    <p className="text-sky-200">Loading price...</p>
                )}
            </section>

            {/* Price Chart */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Price Over Time</h2>
                <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <XAxis dataKey="timeLabel" stroke="#bae6fd" />
                            <YAxis stroke="#bae6fd" domain={["dataMin", "dataMax"]} />
                            <Tooltip />
                            <Line
                                type="monotone"
                                dataKey="price"
                                stroke="#38bdf8"
                                strokeWidth={2}
                                dot={false}
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