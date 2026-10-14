"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/useAuth";
import { MAX_THRESHOLD_PERCENT, MIN_THRESHOLD_PERCENT, parseThreshold, settingsFromRow } from "../utils/alertSettings";

// A self-contained section for the settings page: whether to get emails when a pinned stock
// moves a lot in a day, and how big a move (as a % change from the previous close) counts.
export default function PriceAlertSettings() {
    const { user } = useAuth();
    const [enabled, setEnabled] = useState(true);
    const [threshold, setThreshold] = useState("");
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            const { data, error } = await supabase
                .from("alert_settings")
                .select("enabled, threshold_percent")
                .eq("user_id", user.id)
                .maybeSingle();
            if (error) {
                setMessage({ text: "Couldn't load your alert settings.", error: true });
            }
            const settings = settingsFromRow(data);
            setEnabled(settings.enabled);
            setThreshold(String(settings.thresholdPercent));
            setLoading(false);
        };
        load();
    }, [user]);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!user) return;
        const parsed = parseThreshold(threshold);
        if ("error" in parsed) {
            setMessage({ text: parsed.error, error: true });
            return;
        }
        const { error } = await supabase.from("alert_settings").upsert({
            user_id: user.id,
            enabled,
            threshold_percent: parsed.value,
            updated_at: new Date().toISOString(),
        });
        setMessage(error
            ? { text: "Couldn't save your alert settings. Please try again.", error: true }
            : { text: "Saved.", error: false });
    };

    return (
        <section className="p-4 rounded-xl bg-white/5 border border-sky-300/20">
            <h2 className="text-xl font-semibold mb-1">Price alert emails</h2>
            <p className="text-sm text-sky-200 mb-4">
                Get an email when one of your pinned stocks moves a lot in a day. You&apos;ll hear about each stock at most once a day.
            </p>
            {loading ? (
                <p className="text-sm text-sky-200">Loading...</p>
            ) : (
                <form onSubmit={save} className="space-y-3">
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                        Email me about big moves
                    </label>
                    <label className="flex flex-wrap items-center gap-2">
                        Alert when a stock moves at least
                        <input
                            type="number"
                            inputMode="decimal"
                            step="0.5"
                            min={MIN_THRESHOLD_PERCENT}
                            max={MAX_THRESHOLD_PERCENT}
                            value={threshold}
                            disabled={!enabled}
                            onChange={(e) => setThreshold(e.target.value)}
                            className="w-20 px-2 py-1 rounded bg-white/10 border border-sky-300/30 disabled:opacity-50"
                        />
                        % in a day
                    </label>
                    <button type="submit" className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 transition">
                        Save
                    </button>
                    {message && (
                        <p className={`text-sm ${message.error ? "text-red-300" : "text-green-300"}`}>{message.text}</p>
                    )}
                </form>
            )}
        </section>
    );
}
