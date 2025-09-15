"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/useAuth";

export function usePinnedStocks() {
    const { user } = useAuth();
    const [pinned, setPinned] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    // Load favorites for the logged-in user
    useEffect(() => {
        if (!user) {
            setPinned([]); // no user → no favorites
            setLoading(false);
            return;
        }

        const fetchFavorites = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from("favorites")
                .select("symbol")
                .eq("user_id", user.id); // ✅ filter by logged-in user

            if (error) {
                console.error("Error fetching favorites:", error);
                setPinned([]);
            } else {
                setPinned(data.map((row) => row.symbol));
            }
            setLoading(false);
        };

        fetchFavorites();
    }, [user]);

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

    return { pinned, loading, pinStock, unpinStock };
}
