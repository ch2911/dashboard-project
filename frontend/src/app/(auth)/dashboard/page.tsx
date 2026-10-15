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
import MarketSessionNote from "../../../../components/MarketSessionNote";
import { describeSession, type MarketSession } from "../../../../utils/marketSession";
import { formatTimeLabel, showsForecast, type ChartRange } from "../../../../utils/chartRanges";
import ChartRangePicker from "../../../../components/ChartRangePicker";

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
    /** When the price was taken, to keep the points in order */
    at: number;
    [key: string]: string | number | undefined;
};

export default function Dashboard() {
    const { pinned, loading: pinnedLoading, error: pinnedError, isGuest } = usePinnedStocks();
    const colors = useSeriesColors(pinned);

    const [timeRange, setTimeRange] = useState<ChartRange>('daily');

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
            // The forecast is only shown on the views with one price per day
            if (showsForecast(timeRange)) {
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

        pinned.forEach(ticker => {
            if (histories[ticker]) {
                histories[ticker].forEach(pt => {
                    const name = formatTimeLabel(pt.time, timeRange);
                    if (!allPoints.has(name)) allPoints.set(name, { name, at: new Date(pt.time).getTime() });
                    allPoints.get(name)![ticker] = pt.price;
                });
            }
        });

        if (showsForecast(timeRange)) {
            pinned.forEach(ticker => {
                const tickerHistory = histories[ticker];
                const tickerPrediction = predictions[ticker];
                if (tickerHistory && tickerHistory.length > 0 && tickerPrediction && tickerPrediction.length > 0) {
                    // Start the forecast from the last real price so the lines join up
                    const lastHistoryPoint = tickerHistory[tickerHistory.length - 1];
                    const name = formatTimeLabel(lastHistoryPoint.time, timeRange);
                    if (allPoints.has(name)) {
                        allPoints.get(name)![`${ticker}-pred`] = lastHistoryPoint.price;
                    }

                    tickerPrediction.forEach(pt => {
                        const name = formatTimeLabel(pt.time, timeRange);
                        if (!allPoints.has(name)) allPoints.set(name, { name, at: new Date(pt.time).getTime() });
                        allPoints.get(name)![`${ticker}-pred`] = pt.price;
                    });
                }
            });
        }

        return Array.from(allPoints.values()).sort((a, b) => a.at - b.at);
    })();

    // Which market and trading day the intraday prices are from
    const sessions: MarketSession[] = timeRange === 'intraday'
        ? pinned.flatMap((ticker) => describeSession(ticker, histories[ticker] ?? []) ?? [])
        : [];

    return (
        <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-6">{isGuest ? "📊 Popular Stocks" : "📊 My Pinned Stocks"}</h1>
            {isGuest && (
                <p className="bg-white/10 rounded-xl p-3 mb-6 text-sky-100">
                    You&apos;re trying the dashboard without an account, so it shows a few popular stocks. Search for
                    any stock to see its prices, forecast and news.{" "}
                    <Link href="/login" className="text-sky-300 underline hover:text-white">Sign up</Link> to pin your own.
                </p>
            )}
            <SlowServerNotice active={stillLoading} />

            <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md mb-6">
                {/* Wrap the title and buttons in a flex container */}
                <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                    <h2 className="text-xl font-semibold">Portfolio Overview</h2>

                    <ChartRangePicker value={timeRange} onChange={setTimeRange} />
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
                {showsForecast(timeRange) && !chartLoading && pinned.length > 0 && (
                    <p className="text-sm text-sky-200 mt-2">
                        Dashed lines carry each stock&apos;s latest price 7 trading days forward. Open a stock to
                        see how far it&apos;s likely to move.
                    </p>
                )}
                {timeRange === 'intraday' && !chartLoading && <MarketSessionNote sessions={sessions} />}
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
                <h2 className="text-xl font-semibold mb-3">{isGuest ? "Popular Stocks" : "Your Favorites"}</h2>
                {pinnedError && (
                    <p className="text-red-300">Couldn&apos;t load your pinned stocks. Please refresh the page to try again.</p>
                )}
                {!pinnedLoading && !pinnedError && pinned.length === 0 && (
                    <p className="text-sky-200">You haven&apos;t pinned any stocks yet. Search for one above and press Pin.</p>
                )}
                <ul className="space-y-3">
                    {pinned.map((ticker) => {
                        const stock = prices[ticker];
                        return (
                            <li key={ticker}>
                                <Link
                                    href={stockPageHref(ticker)}
                                    className="flex justify-between items-center gap-3 p-3 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition"
                                >
                                    <span className="flex items-center gap-2 min-w-0">
                                        {/* Same colour as this stock's line on the chart */}
                                        <span className="shrink-0 inline-block w-3 h-3 rounded-full" style={{ backgroundColor: seriesColor(colors, ticker) }} aria-hidden="true" />
                                        <span className="min-w-0">
                                            <span className="block font-bold text-lg">{ticker}</span>
                                            {stock?.name && <span className="block text-sm text-sky-200 truncate">{stock.name}</span>}
                                        </span>
                                    </span>
                                    {stock ? (
                                        <span className="shrink-0">
                                            ${stock.price.toFixed(2)}{" "}
                                            <span className={`ml-2 font-bold ${ stock.change >= 0 ? "text-green-400" : "text-red-400" }`}>
                                                {stock.change >= 0 ? "+" : ""}{stock.change.toFixed(2)}%
                                            </span>
                                        </span>
                                    ) : (
                                        <span className="shrink-0 text-sky-200">{stock === null ? "Unavailable" : "Loading..."}</span>
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
                    <p className="text-sky-200">No recent headlines found for {isGuest ? "these" : "your pinned"} stocks.</p>
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
