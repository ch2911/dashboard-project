"use client";

import { useEffect, useState } from "react";
import {
    fetchSentiment,
    fetchPrice,
    fetchPriceHistory,
    fetchPrediction,
    type PricePoint,
    type SentimentResult,
    type StockPrice,
} from "../../../../../utils/api";
import { usePinnedStocks } from "../../../../../hooks/usePinnedStocks";
import SlowServerNotice from "../../../../../components/SlowServerNotice";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
} from "recharts";

type ChartDataPoint = {
    name: string;
    price?: number;
    prediction?: number;
};

const sectionClass = "bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6";

export default function StockPageClient({ ticker }: { ticker: string }) {
    const { pinned, pinStock, unpinStock } = usePinnedStocks();
    const isPinned = pinned.includes(ticker);

    const [timeRange, setTimeRange] = useState<'daily' | 'intraday'>('daily');

    // Each value is undefined while loading. Once loaded, null or [] means it couldn't be fetched.
    const [price, setPrice] = useState<StockPrice | null | undefined>(undefined);
    const [sentiment, setSentiment] = useState<SentimentResult[] | undefined>(undefined);
    const [history, setHistory] = useState<PricePoint[] | undefined>(undefined);
    const [prediction, setPrediction] = useState<PricePoint[] | undefined>(undefined);

    // Price and headlines don't depend on the chart range. Every request updates its own
    // section as soon as it finishes, so a slow or failed one doesn't hold up the others.
    useEffect(() => {
        let cancelled = false;
        setPrice(undefined);
        setSentiment(undefined);
        fetchPrice(ticker).then((p) => { if (!cancelled) setPrice(p); });
        fetchSentiment(ticker).then((s) => { if (!cancelled) setSentiment(s); });
        return () => { cancelled = true; };
    }, [ticker]);

    useEffect(() => {
        let cancelled = false;
        setHistory(undefined);
        setPrediction(undefined);
        fetchPriceHistory(ticker, timeRange).then((h) => { if (!cancelled) setHistory(h); });
        // The forecast is only shown on the 3-month view
        if (timeRange === 'daily') {
            fetchPrediction(ticker).then((p) => { if (!cancelled) setPrediction(p); });
        } else {
            setPrediction([]);
        }
        return () => { cancelled = true; };
    }, [ticker, timeRange]);

    const combinedChartData = (() => {
        if (!history?.length) return [];

        const historicalPoints: ChartDataPoint[] = history.map((pt) => {
            const d = new Date(pt.time);
            const formatOptions: Intl.DateTimeFormatOptions =
                timeRange === 'daily'
                    ? { day: '2-digit', month: 'short' }
                    : { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" };
            const timeLabel = new Intl.DateTimeFormat("en-GB", formatOptions).format(d);
            return { name: timeLabel, price: pt.price };
        });

        if (!prediction?.length) return historicalPoints;

        // Start the forecast line from the last real price so the two lines join up
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

    const stillLoading = price === undefined || sentiment === undefined || history === undefined;

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

            <SlowServerNotice active={stillLoading} />

            {/* Stock Info */}
            <section className={sectionClass}>
                <h2 className="text-xl font-semibold mb-3">Stock Overview</h2>
                {price === undefined && <p className="text-sky-200">Loading price...</p>}
                {price === null && <p className="text-sky-200">The price isn&apos;t available right now.</p>}
                {price && (
                    <div>
                        <p className="text-sky-200">Company: {ticker}</p>
                        <p>
                            Price:{" "}
                            <span className="font-bold text-white">${price.price.toFixed(2)}</span>{" "}
                            <span className={`ml-2 font-bold ${price.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {price.change >= 0 ? "+" : ""}{price.change.toFixed(2)}% today
                            </span>
                        </p>
                    </div>
                )}
            </section>

            {/* Price Chart */}
            <section className={sectionClass}>
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xl font-semibold">Price Chart</h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTimeRange('daily')}
                            className={`px-3 py-1 text-sm rounded-md ${timeRange === 'daily' ? 'bg-sky-500' : 'bg-white/10 hover:bg-white/20'}`}
                        >
                            Daily (3mo)
                        </button>
                        <button
                            onClick={() => setTimeRange('intraday')}
                            className={`px-3 py-1 text-sm rounded-md ${timeRange === 'intraday' ? 'bg-sky-500' : 'bg-white/10 hover:bg-white/20'}`}
                        >
                            Intraday (1d)
                        </button>
                    </div>
                </div>

                {history === undefined && <p className="text-sky-200">Loading chart...</p>}
                {history?.length === 0 && (
                    <p className="text-sky-200">
                        {timeRange === 'intraday'
                            ? "No prices for today yet. The market may not have opened."
                            : "The price history isn't available right now."}
                    </p>
                )}
                {!!history?.length && (
                    <>
                        <div className="w-full h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={combinedChartData}>
                                    <XAxis dataKey="name" stroke="#bae6fd" />
                                    <YAxis stroke="#bae6fd" domain={['dataMin - 1', 'dataMax + 1']} />
                                    <Tooltip />
                                    <Legend />
                                    <Line name="Historical Price" type="monotone" dataKey="price" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls />
                                    {/* The prediction line only renders when it has data */}
                                    <Line name="Predicted Price" type="monotone" dataKey="prediction" stroke="#4ade80" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        {timeRange === 'daily' && prediction === undefined && (
                            <p className="text-sm text-sky-200 mt-2">Loading the 7-day forecast...</p>
                        )}
                        {timeRange === 'daily' && prediction?.length === 0 && (
                            <p className="text-sm text-sky-200 mt-2">The 7-day forecast isn&apos;t available right now.</p>
                        )}
                    </>
                )}
            </section>

            {/* News Sentiment */}
            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                <h2 className="text-xl font-semibold mb-3">Live News Sentiment</h2>
                {sentiment === undefined && <p className="text-sky-200">Loading headlines...</p>}
                {sentiment?.length === 0 && <p className="text-sky-200">No recent headlines found.</p>}
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {sentiment?.map((item, i) => {
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
