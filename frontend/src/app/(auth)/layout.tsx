"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchStocks, type StockSuggestion } from "../../../utils/api";
import { supabase} from "../../../lib/supabaseClient";


export default function AuthLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setSuggestions([]);
            return;
        }
        let cancelled = false;
        // Wait until typing pauses, so every keystroke doesn't send a request (Alpha Vantage
        // allows 25 a day), and ignore replies to searches that have since changed
        const timer = setTimeout(() => {
            searchStocks(trimmed).then((results) => {
                if (!cancelled) setSuggestions(results);
            });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-sky-900 via-blue-700 to-sky-500 text-white p-6">
            {/* Header */}
            <header className="p-6 border-b border-sky-300/30 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-6">
                    <Link href="/dashboard">
                        <h1 className="text-2xl font-extrabold tracking-wide cursor-pointer">📈 Stock Dashboard</h1>
                    </Link>

                    <Link href="/news" className="text-sky-200 hover:text-white transition">
                        News
                    </Link>
                </div>

                {/* Search bar */}
                <div className="relative max-w-md w-full">
                    <input
                        type="text"
                        placeholder="Search stocks..."
                        className="p-2 rounded text-sky-200 w-full"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {suggestions.length > 0 && (
                        <ul className="absolute z-50 top-full left-0 w-full bg-white text-black rounded mt-2 shadow-lg">
                            {suggestions.map((s) => (
                                <li
                                    key={s.symbol}
                                    className="p-2 hover:bg-gray-200 cursor-pointer"
                                    onClick={() => {
                                        setQuery("");
                                        setSuggestions([]);
                                        router.push(`/stocks/${s.symbol}`);
                                    }}
                                >
                                    {s.symbol} — {s.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <button
                    onClick={async () => {
                        await supabase.auth.signOut();
                        router.push("/login");
                    }}
                    className="bg-red-600 px-3 py-1 rounded text-white hover:bg-red-700"
                >
                    Logout
                </button>
            </header>

            <main className="mt-6">{children}</main>
        </div>
    );
}
