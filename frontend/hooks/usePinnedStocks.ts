"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/useAuth";

/** What visitors without an account see on the dashboard. A few, as each one costs several API requests. */
export const GUEST_STOCKS = ["AAPL", "MSFT", "NVDA", "TSLA"];

export function usePinnedStocks() {
    const { user, loading: authLoading } = useAuth();
    const [pinned, setPinned] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    // True when the pinned stocks couldn't be loaded, so the page doesn't mistake it for "none pinned"
    const [error, setError] = useState(false);

    const isGuest = !authLoading && !user;

    // Load favorites for the logged-in user
    useEffect(() => {
        // Wait to find out who's signed in, so a signed-in user doesn't briefly get the guest stocks
        if (authLoading) return;

        setError(false);
        if (!user) {
            setPinned(GUEST_STOCKS); // no account → show some popular stocks instead
            setLoading(false);
            return;
        }

        const fetchFavorites = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from("favorites")
                    .select("symbol")
                    .eq("user_id", user.id); // ✅ filter by logged-in user
                if (error) throw error;
                setPinned(data.map((row) => row.symbol));
            } catch (err) {
                console.error("Error fetching favorites:", err);
                setPinned([]);
                setError(true);
            }
            setLoading(false);
        };

        fetchFavorites();
    }, [user, authLoading]);

    // Add a stock to favorites
    const pinStock = async (symbol: string) => {
        if (!user) return;

        const { error } = await supabase
            .from("favorites")
            .insert([{ user_id: user.id, symbol }]);

        if (error) {
            console.error("Error pinning stock:", error);
        } else {
            setPinned((prev) => [...new Set([...prev, symbol])]); // prevent duplicates
        }
    };

    // Remove a stock from favorites
    const unpinStock = async (symbol: string) => {
        if (!user) return;

        const { error } = await supabase
            .from("favorites")
            .delete()
            .eq("user_id", user.id)
            .eq("symbol", symbol);

        if (error) {
            console.error("Error unpinning stock:", error);
        } else {
            setPinned((prev) => prev.filter((s) => s !== symbol));
        }
    };

    return { pinned, loading, error, isGuest, pinStock, unpinStock };
}
