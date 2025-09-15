"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export function useAuth() {
    const [user, setUser] = useState<any>(null);
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

        // Listen for login/logout
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
