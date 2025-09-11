"use client";
import { useEffect, useState } from "react";
import { fetchSentiment, fetchPrice, fetchPriceHistory } from "../../utils/api";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

type SentimentResult = {
    title: string;
    time: string; // ISO timestamp from backend
    sentiment: {
        label: string;
        score: number;
    };
};

type StockPrice = {
    ticker: string;
    price: number;
    change: number;
};

type PricePoint = {
    time: string;
    price: number;
};

export default function Dashboard() {
    const [data, setData] = useState<SentimentResult[]>([]);
    const [price, setPrice] = useState<StockPrice | null>(null);
    const [history, setHistory] = useState<PricePoint[]>([]);

    useEffect(() => {
        fetchSentiment("TSLA").then(setData);
        fetchPrice("TSLA").then(setPrice);
        fetchPriceHistory("TSLA").then(setHistory);
    }, []);

    function parseToDate(time: unknown): Date {
        if (!time) return new Date();
        // number (ms or seconds)
        if (typeof time === "number") return new Date(time);
        if (typeof time === "string") {
            // pure digits? treat as unix (seconds or ms)
            if (/^\d+$/.test(time)) {
                const n = Number(time);
                // heuristic: > 1e12 -> ms, else seconds
                return n > 1e12 ? new Date(n) : new Date(n * 1000);
            }
            // try direct ISO parse
            const d = new Date(time);
            if (!isNaN(d.getTime())) return d;
            // replace space with T and try again (some formats)
            const t2 = time.replace(" ", "T");
            const d2 = new Date(t2);
            if (!isNaN(d2.getTime())) return d2;
            // last resort
            return new Date();
        }
        // fallback
        return new Date();
    }

    // Format history for chart
    const chartData = history.map((pt) => {
        const d = new Date(pt.time);
        const timeLabel = new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/London",
        }).format(d);
        return {
            timeLabel,
            price: pt.price,
        };
    });

    return (
        <div className="min-h-screen bg-gradient-to-br from-sky-900 via-sky-700 to-sky-500 text-white flex flex-col">
            {/* Header */}
            <header className="p-6 border-b border-sky-300/30 shadow-lg">
                <h1 className="text-3xl font-extrabold tracking-wide">📈 Stock Dashboard</h1>
                <p className="text-sky-200 mt-1">Real-time stock price analysis</p>
            </header>

            {/* Main Content */}
            <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 p-6">

                {/* Left Column (Stock Info) */}
                <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                    <h2 className="text-xl font-semibold mb-3">Stock Overview</h2>
                    {price ? (
                        <div className="space-y-2">
                            <p className="text-sky-200">Company: Tesla (TSLA)</p>
                            <p className="text-sky-200">
                                Price: <span className="font-bold text-white">${price.price}</span>
                            </p>
                            <p className={`font-bold ${price.change > 0 ? "text-green-400" : "text-red-400"}`}>
                                {price.change}% today
                            </p>
                        </div>
                    ) : (
                        <p className="text-sky-200">Loading price...</p>
                    )}
                </section>

                {/* Middle Column (Price Chart) */}
                <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md md:col-span-2">
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

                {/* Bottom Section (Live Sentiment Feed) */}
                <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md md:col-span-3">
                    <h2 className="text-xl font-semibold mb-3">Live News Sentiment</h2>
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {data.map((item, i) => {
                            const d = parseToDate(item.time);
                            const prettyTime = new Intl.DateTimeFormat("en-GB", {
                                timeZone: "Europe/London",
                                hour: "2-digit",
                                minute: "2-digit",
                                day: "2-digit",
                                month: "short",
                            }).format(d);
                            return (
                                <div key={i} className="p-3 rounded-xl bg-white/5 border border-sky-300/20">
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
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>
        </div>
    );
}



