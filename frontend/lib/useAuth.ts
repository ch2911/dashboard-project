"use client";

import { useEffect, useState } from "react";
// 1. Import the 'User' type from supabase
import { supabase } from "./supabaseClient";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
    // 2. Use the 'User' type here instead of 'any'
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const getSession = async () => {
            const {
                data: { session },
            } = await supabase.auth.getSession();

            setUser(session?.user ?? null);
            setLoading(false);
        };

        getSession();

        const { data: subscription } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => {
            subscription.subscription.unsubscribe();
        };
    }, []);

    return { user, loading };
}