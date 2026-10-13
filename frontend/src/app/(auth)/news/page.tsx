// In frontend/src/app/(auth)/news/page.tsx
"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../../../../utils/api";

// Define the type for our new data structure
type TrendingArticle = {
    title: string;
    time: string;
    url: string;
    sentiment: { label: string; score: number };
    affected_stocks: string[];
};

export default function NewsPage() {
    const [articles, setArticles] = useState<TrendingArticle[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadNews() {
            setLoading(true);
            const res = await fetch(`${API_URL}/trending_news`);
            const data = await res.json();
            setArticles(data);
            setLoading(false);
        }
        loadNews();
    }, []);

    if (loading) {
        return <p className="text-center text-sky-200">Loading trending news...</p>;
    }

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">📰 Trending Financial News</h1>
            <section className="space-y-4">
                {articles.map((item, i) => {
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