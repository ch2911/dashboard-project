"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchStocks, type StockSuggestion } from "../../../utils/api";
import { stockPageHref } from "../../../utils/stockLinks";
import { supabase} from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/useAuth";


export default function AuthLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { user, loading } = useAuth();
    // Visitors trying the site without an account
    const isGuest = !loading && !user;
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
        <div className="min-h-screen app-bg text-white px-4 py-4 sm:px-6 sm:py-6">
            {/* Everything sits in one centred column, so wide windows don't stretch the page edge to edge */}
            <div className="max-w-6xl mx-auto">
                {/* Header. On phones: title and Logout, then the links, then search. From md up: one row. */}
                <header className="py-4 md:p-6 border-b border-sky-300/30 shadow-lg flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Link href="/dashboard" className="order-1">
                        <h1 className="text-xl sm:text-2xl font-extrabold tracking-wide cursor-pointer">📈 Stock Dashboard</h1>
                    </Link>

                    <nav className="order-3 md:order-2 w-full md:w-auto flex gap-6">
                        <Link href="/news" className="text-sky-200 hover:text-white transition">
                            News
                        </Link>

                        {/* Settings are all about the account, so only signed-in users get them */}
                        {!isGuest && (
                            <Link href="/settings" className="text-sky-200 hover:text-white transition">
                                Settings
                            </Link>
                        )}
                    </nav>

                    {/* Search bar */}
                    <div className="relative order-4 md:order-3 w-full md:w-auto md:flex-1 md:max-w-md md:ml-auto">
                        <input
                            type="text"
                            placeholder="Search stocks..."
                            className="p-2 rounded bg-white text-sky-200 w-full"
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
                                            router.push(stockPageHref(s.symbol));
                                        }}
                                    >
                                        {s.symbol} — {s.name}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {isGuest ? (
                        <Link
                            href="/login"
                            className="order-2 md:order-4 ml-auto md:ml-0 bg-sky-500 px-3 py-1 rounded text-white hover:bg-sky-400"
                        >
                            Sign up
                        </Link>
                    ) : (
                        <button
                            onClick={async () => {
                                await supabase.auth.signOut();
                                router.push("/login");
                            }}
                            className="order-2 md:order-4 ml-auto md:ml-0 bg-red-600 px-3 py-1 rounded text-white hover:bg-red-700"
                        >
                            Logout
                        </button>
                    )}
                </header>

                <main className="mt-6">{children}</main>
            </div>
        </div>
    );
}
