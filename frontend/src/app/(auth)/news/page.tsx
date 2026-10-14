"use client";

import { useEffect, useState } from "react";
import { fetchTrendingNews, type TrendingArticle } from "../../../../utils/api";
import SlowServerNotice from "../../../../components/SlowServerNotice";

export default function NewsPage() {
    // undefined while loading, null if the news couldn't be loaded
    const [articles, setArticles] = useState<TrendingArticle[] | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        fetchTrendingNews().then((data) => {
            if (!cancelled) setArticles(data);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">📰 Trending Financial News</h1>
            <SlowServerNotice active={articles === undefined} />

            {articles === undefined && <p className="text-center text-sky-200">Loading trending news...</p>}
            {articles === null && (
                <p className="text-center text-sky-200">Couldn&apos;t load the news right now. Please try again in a minute.</p>
            )}
            {articles?.length === 0 && <p className="text-center text-sky-200">No trending news found right now.</p>}

            <section className="space-y-4">
                {articles?.map((item, i) => {
                    const d = new Date(item.time);
                    const prettyTime = new Intl.DateTimeFormat("en-GB", {
                        timeZone: "Europe/London", hour: "2-digit", minute: "2-digit",
                    }).format(d);

                    return (
                        <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                           className="block p-4 rounded-xl bg-white/5 border border-sky-300/20 hover:bg-white/10 transition">

                            <div className="flex justify-between items-start">
                                <p className="font-medium text-white text-lg">{item.title}</p>
                                <span className="text-sm text-sky-200 flex-shrink-0 ml-4">{prettyTime}</span>
                            </div>

                            <p className={`text-sm mt-1 ${
                                item.sentiment.label === 'positive' ? 'text-green-400'
                                    : item.sentiment.label === 'negative' ? 'text-red-400'
                                        : 'text-gray-300'}`}>
                                {item.sentiment.label} ({item.sentiment.score.toFixed(2)})
                            </p>

                            {item.affected_stocks.length > 0 && (
                                <div className="mt-3">
                                    <span className="text-xs font-bold text-sky-200">POSSIBLY AFFECTED: </span>
                                    {item.affected_stocks.map(stock => (
                                        <span key={stock} className="inline-block bg-sky-700/50 text-sky-200 text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">
                                            {stock}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </a>
                    );
                })}
            </section>
        </div>
    );
}
