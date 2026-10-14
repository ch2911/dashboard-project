"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { searchStocks } from "../utils/api";
import { stockPageHref } from "../utils/stockLinks";
import { useRouter } from "next/navigation";
import { useAuth} from "../lib/useAuth";

type Suggestion = {
    symbol: string;
    name: string;
};

export default function Header() {
    const [query, setQuery] = useState("");
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const router = useRouter();
    const { user } = useAuth();

    useEffect(() => {
        if (query.length > 1) {
            searchStocks(query).then(setSuggestions);
        } else {
            setSuggestions([]);
        }
    }, [query]);

    return (
        <header className="p-6 border-b border-sky-300/30 shadow-lg relative z-50">
            <Link href="/" className="text-3xl font-extrabold tracking-wide cursor-pointer">
                📈 Stock Dashboard
            </Link>
            <p className="text-black mt-1">Real-time stock price analysis</p>

            {/* Search bar */}
            <div className="mt-4 relative max-w-md">
                <input
                    type="text"
                    placeholder="Search stocks..."
                    className="p-2 rounded text-black w-full"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                {suggestions.length > 0 && (
                    <ul className="absolute z-50 top-full left-0 w-full bg-white text-black rounded mt-2 shadow-lg">
                        {suggestions.map((s, i) => (
                            <li
                                key={i}
                                className="p-2 hover:bg-gray-200 cursor-pointer"
                                onClick={() => {
                                    setQuery("");
                                    setSuggestions([]);
                                    console.log(s.symbol);
                                    router.push(stockPageHref(s.symbol)); // go to stock page
                                }}
                            >
                                {s.symbol} — {s.name}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Login info */}
            <div className="mt-2 text-sm text-sky-200">
                {user ? `Logged in as ${user.id}` : "Not logged in"}
            </div>
        </header>
    );
}
