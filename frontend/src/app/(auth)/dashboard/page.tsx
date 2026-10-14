"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePinnedStocks } from "../../../../hooks/usePinnedStocks";
import {
    fetchPrice,
    fetchPriceHistory,
    fetchSentiment,
    fetchPrediction,
    type PricePoint,
    type SentimentResult,
    type StockPrice,
} from "../../../../utils/api";
import SlowServerNotice from "../../../../components/SlowServerNotice";
import { stockPageHref } from "../../../../utils/stockLinks";
import { seriesColor } from "../../../../utils/chartColors";
import { formatPriceTick } from "../../../../utils/chartFormat";
import { useSeriesColors } from "../../../../hooks/useSeriesColors";
import PortfolioTooltip, { type TooltipRow } from "../../../../components/PortfolioTooltip";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

type ChartDataPoint = {
    name: string;
    [key: string]: string | number | undefined;
};

export default function Dashboard() {
    const { pinned, loading: pinnedLoading } = usePinnedStocks();
    const colors = useSeriesColors(pinned);

    const [timeRange, setTimeRange] = useState<'daily' | 'intraday'>('daily');

    // For each pinned ticker: missing while loading. Once loaded, null or [] means it couldn't be fetched.
    const [prices, setPrices] = useState<Record<string, StockPrice | null>>({});
    const [histories, setHistories] = useState<Record<string, PricePoint[]>>({});
    const [predictions, setPredictions] = useState<Record<string, PricePoint[]>>({});
    const [sentiments, setSentiments] = useState<(SentimentResult & { ticker: string })[]>([]);
    const [sentimentsPending, setSentimentsPending] = useState(0);

    // Prices and headlines don't depend on the chart range, so they only reload when the pinned
    // stocks change. Each stock loads on its own and appears as soon as its data arrives, so a
    // slow or failed request for one stock doesn't hold up the rest.
    useEffect(() => {
        let cancelled = false;
        setPrices({});
        setSentiments([]);
        setSentimentsPending(pinned.length);

        pinned.forEach((ticker) => {
            fetchPrice(ticker).then((price) => {
                if (!cancelled) setPrices((prev) => ({ ...prev, [ticker]: price }));
            });
            fetchSentiment(ticker).then((items) => {
                if (cancelled) return;
                setSentiments((prev) => {
                    const merged = [...prev, ...items.map((item) => ({ ...item, ticker }))];
                    const unique = new Map(merged.map((s) => [`${s.ticker}-${s.time}-${s.title}`, s]));
                    return Array.from(unique.values());
                });
                setSentimentsPending((n) => n - 1);
            });
        });

        return () => { cancelled = true; };
    }, [pinned]);

    // The chart reloads when the pinned stocks or the range change
    useEffect(() => {
        let cancelled = false;
        setHistories({});
        setPredictions({});

        pinned.forEach((ticker) => {
            fetchPriceHistory(ticker, timeRange).then((history) => {
                if (!cancelled) setHistories((prev) => ({ ...prev, [ticker]: history }));
            });
            // The forecast is only shown on the 3-month view
            if (timeRange === 'daily') {
                fetchPrediction(ticker).then((prediction) => {
                    if (!cancelled) setPredictions((prev) => ({ ...prev, [ticker]: prediction }));
                });
            }
        });

        return () => { cancelled = true; };
    }, [pinned, timeRange]);

    const chartLoading = pinned.some((ticker) => !(ticker in histories));
    const chartMissing = pinned.filter((ticker) => histories[ticker]?.length === 0);
    const stillLoading = chartLoading || pinned.some((ticker) => !(ticker in prices)) || sentimentsPending > 0;

    const chartData = (() => {
        if (!pinned.length || !Object.keys(histories).length) return [];

        const allPoints = new Map<string, ChartDataPoint>();

        const formatOptions: Intl.DateTimeFormatOptions =
            timeRange === 'daily'
                ? { day: '2-digit', month: 'short' }
                : { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" };

        pinned.forEach(ticker => {
            if (histories[ticker]) {
                histories[ticker].forEach(pt => {
                    const d = new Date(pt.time);
                    const name = new Intl.DateTimeFormat("en-GB", formatOptions).format(d);
                    if (!allPoints.has(name)) allPoints.set(name, { name });
                    allPoints.get(name)![ticker] = pt.price;
                });
            }
        });

        if (timeRange === 'daily') {
            pinned.forEach(ticker => {
                const tickerHistory = histories[ticker];
                const tickerPrediction = predictions[ticker];
                if (tickerHistory && tickerHistory.length > 0 && tickerPrediction && tickerPrediction.length > 0) {
                    const lastHistoryPoint = tickerHistory[tickerHistory.length - 1];
                    const d = new Date(lastHistoryPoint.time);
                    const name = new Intl.DateTimeFormat("en-GB", formatOptions).format(d);
                    if (allPoints.has(name)) {
                        allPoints.get(name)![`${ticker}-pred`] = lastHistoryPoint.price;
                    }

                    tickerPrediction.forEach(pt => {
                        const d = new Date(pt.time);
                        const name = new Intl.DateTimeFormat("en-GB", { day: '2-digit', month: 'short' }).format(d);
                        if (!allPoints.has(name)) allPoints.set(name, { name });
                        allPoints.get(name)![`${ticker}-pred`] = pt.price;
                    });
                }
            });
        }

        return Array.from(allPoints.values()).sort((a, b) => {
            // This sort may need adjustment if intraday times span midnight, but is good for now.
            const dateA = new Date(a.name.split(' ').reverse().join(' ') + ' ' + new Date().getFullYear());
            const dateB = new Date(b.name.split(' ').reverse().join(' ') + ' ' + new Date().getFullYear());
            return dateA.getTime() - dateB.getTime();
        });
    })();

    return (
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-6">📊 My Pinned Stocks</h1>
            <SlowServerNotice active={stillLoading} />

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                {/* Wrap the title and buttons in a flex container */}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <h2 className="text-xl font-semibold">Portfolio Overview</h2>

                    {/* --- ADD THIS DIV WITH THE BUTTONS --- */}
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

                <div className="w-full h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <XAxis dataKey="name" stroke="#bae6fd" />
                            <YAxis stroke="#bae6fd" domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={formatPriceTick} />
                            <Tooltip
                                content={({ active, payload, label }) => (
                                    <PortfolioTooltip
                                        active={active}
                                        payload={payload as unknown as TooltipRow[]}
                                        label={label as string | number | undefined}
                                    />
                                )}
                            />
                            <Legend formatter={(value) => <span className="text-sky-100">{value}</span>} />
                            {pinned.map((ticker) => (
                                <Line
                                    key={ticker}
                                    name={ticker}
                                    type="monotone"
                                    dataKey={ticker}
                                    strokeWidth={2}
                                    stroke={seriesColor(colors, ticker)}
                                    dot={false}
                                    connectNulls
                                />
                            ))}
                            {/* Each forecast is a dashed line in its stock's colour. It's left out of the legend,
                                which already names the stock. */}
                            {pinned.map((ticker) => (
                                <Line
                                    key={`${ticker}-pred`}
                                    name={`${ticker} forecast`}
                                    type="monotone"
                                    dataKey={`${ticker}-pred`}
                                    stroke={seriesColor(colors, ticker)}
                                    strokeWidth={2}
                                    strokeDasharray="4 4"
                                    dot={false}
                                    connectNulls
                                    legendType="none"
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                {timeRange === 'daily' && !chartLoading && pinned.length > 0 && (
                    <p className="text-sm text-sky-200 mt-2">Dashed lines show each stock&apos;s 7-day forecast.</p>
                )}
                {chartLoading && <p className="text-sm text-sky-200 mt-2">Loading chart...</p>}
                {chartMissing.length > 0 && (
                    <p className="text-sm text-sky-200 mt-2">
                        {timeRange === 'intraday'
                            ? `No prices for today yet for ${chartMissing.join(", ")}. The market may not have opened.`
                            : `Price history isn't available right now for ${chartMissing.join(", ")}.`}
                    </p>
                )}
            </section>

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-3">Your Favorites</h2>
                {!pinnedLoading && pinned.length === 0 && (
                    <p className="text-sky-200">You haven&apos;t pinned any stocks yet. Search for one above and press Pin.</p>
                )}
                <ul className="space-y-3">
                    {pinned.map((ticker) => {
                        const stock = prices[ticker];
                        return (
                            <li key={ticker}>
                                <Link
                                    href={stockPageHref(ticker)}
                                    className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition"
                                >
                                    <span className="flex items-center gap-2 font-bold text-lg">
                                        {/* Same colour as this stock's line on the chart */}
                                        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: seriesColor(colors, ticker) }} aria-hidden="true" />
                                        {ticker}
                                    </span>
                                    {stock ? (
                                        <span>
                                            ${stock.price.toFixed(2)}{" "}
                                            <span className={`ml-2 font-bold ${ stock.change >= 0 ? "text-green-400" : "text-red-400" }`}>
                                                {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="text-sky-200">{stock === null ? "Unavailable" : "Loading..."}</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </section>

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
                <h2 className="text-xl font-semibold mb-3">News Sentiment</h2>
                {sentiments.length === 0 && sentimentsPending > 0 && <p className="text-sky-200">Loading headlines...</p>}
                {sentiments.length === 0 && sentimentsPending === 0 && pinned.length > 0 && (
                    <p className="text-sky-200">No recent headlines found for your pinned stocks.</p>
                )}
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {[...sentiments]
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
                                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-4">
                                        <p className="font-medium text-white">[{item.ticker}] {item.title}</p>
                                        <span className="text-sm text-sky-200 sm:whitespace-nowrap">{prettyTime}</span>
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
