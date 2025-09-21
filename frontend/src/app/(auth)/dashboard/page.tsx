"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import { fetchPrice, fetchPriceHistory, fetchSentiment } from "../../../../utils/api";

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

type SentimentResult = {
    title: string;
    time: string;
    sentiment: {
        label: string;
        score: number;
    };
    ticker?: string;
};

export default function Dashboard() {
    const { pinned } = usePinnedStocks();

    const [prices, setPrices] = useState<Record<string, StockPrice>>({});
    const [histories, setHistories] = useState<Record<string, PricePoint[]>>({});
    const [sentiments, setSentiments] = useState<SentimentResult[]>([]);

    // Fetch data for all pinned stocks
    useEffect(() => {
        if (!pinned.length) return;

        const loadData = async () => {
            const priceResults: Record<string, StockPrice> = {};
            const historyResults: Record<string, PricePoint[]> = {};
            let sentimentResults: SentimentResult[] = [];

            for (const ticker of pinned) {
                const [p, h, s] = await Promise.all([
                    fetchPrice(ticker),
                    fetchPriceHistory(ticker),
                    fetchSentiment(ticker),
                ]);

                priceResults[ticker] = p;
                historyResults[ticker] = h;
                sentimentResults = [
                    ...sentimentResults,
                    ...s.map((item) => ({ ...item, ticker })),
                ];
            }

            // ✅ Remove duplicates by title + time + ticker
            const unique = new Map(
                sentimentResults.map((s) => [
                    `${s.ticker}-${s.time}-${s.title}`,
                    s,
                ])
            );

            setPrices(priceResults);
            setHistories(historyResults);
            setSentiments(Array.from(unique.values()));
        };

        loadData();
    }, [pinned]);


    // Build combined chart data (align on timestamps)
    const chartData = (() => {
        if (!pinned.length) return [];
        const first = histories[pinned[0]];
        if (!first) return [];

        return first.map((pt, idx) => {
            const row: Record<string, string | number | null> = {
                time: pt.time,
            };

            pinned.forEach((ticker) => {
                row[ticker] = histories[ticker]?.[idx]?.price ?? null;
            });

            return row;
        });
    })();

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-700 to-sky-500 text-white p-6">
            <h1 className="text-3xl font-bold mb-6">📊 My Pinned Stocks</h1>

            {/* Overview Chart */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Portfolio Overview</h2>
                <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <XAxis dataKey="time" stroke="#bae6fd" />
                            <YAxis stroke="#bae6fd" />
                            <Tooltip />
                            {pinned.map((ticker, i) => (
                                <Line
                                    key={ticker}
                                    type="monotone"
                                    dataKey={ticker}
                                    strokeWidth={2}
                                    stroke={
                                        ["#38bdf8", "#f472b6", "#4ade80", "#facc15"][i % 4] // cycle colors
                                    }
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            {/* Stock List */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Your Favorites</h2>
                <ul className="space-y-3">
                    {pinned.map((ticker) => {
                        const stock = prices[ticker];
                        return (
                            <li
                                key={ticker}
                                className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-sky-300/20"
                            >
                                <Link
                                    href={`/stocks/${ticker}`}
                                    className="font-bold text-lg hover:underline"
                                >
                                    {ticker}
                                </Link>
                                {stock ? (
                                    <span>
                    ${stock.price}{" "}
                                        <span
                                            className={`ml-2 font-bold ${
                                                stock.change > 0 ? "text-green-400" : "text-red-400"
                                            }`}
                                        >
                      {stock.change}%
                    </span>
                  </span>
                                ) : (
                                    <span className="text-sky-200">Loading...</span>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </section>

            {/* Combined News Sentiment */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                <h2 className="text-xl font-semibold mb-3">News Sentiment</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {sentiments
                        .sort(
                            (a, b) =>
                                new Date(b.time).getTime() - new Date(a.time).getTime()
                        )
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
                                <div
                                    key={i}
                                    className="p-3 rounded-xl bg-white/5 border border-sky-300/20"
                                >
                                    <div className="flex justify-between">
                                        <p className="font-medium text-white">
                                            [{item.ticker}] {item.title}
                                        </p>
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
                                        {item.sentiment.label} (
                                        {item.sentiment.score.toFixed(2)})
                                    </p>
                                </div>
                            );
                        })}
                </div>
            </section>
        </div>
    );
}
