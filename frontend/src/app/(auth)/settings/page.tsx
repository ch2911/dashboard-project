"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuthRedirect } from "../../../../lib/useAuthRedirect";
import { deleteAccount } from "../../../../utils/api";
import PriceAlertSettings from "../../../../components/PriceAlertSettings";
import { ACCENTS, MODES, DEFAULT_THEME, loadTheme, saveTheme, type ThemeSettings } from "../../../../utils/theme";

// Each part of the page is its own section. Price alert emails link here (/settings/).
export default function SettingsPage() {
    return (
        <div className="max-w-2xl space-y-6">
            <h1 className="text-3xl font-bold">⚙️ Settings</h1>
            <AppearanceSection />
            <PriceAlertSettings />
            <AccountSection />
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-white/10 backdrop-blur-md rounded-2xl p-4 shadow-md">
            <h2 className="text-xl font-semibold mb-3">{title}</h2>
            {children}
        </section>
    );
}

function AppearanceSection() {
    const [theme, setTheme] = useState<ThemeSettings>(DEFAULT_THEME);

    // Read the saved choice after the first render, as localStorage only exists in the browser
    useEffect(() => setTheme(loadTheme()), []);

    const update = (change: Partial<ThemeSettings>) => {
        const next = { ...theme, ...change };
        setTheme(next);
        saveTheme(next);
    };

    return (
        <Section title="Appearance">
            <p className="text-sm text-sky-200 mb-2">Mode</p>
            <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label="Mode">
                {MODES.map((mode) => (
                    <button
                        key={mode.value}
                        role="radio"
                        aria-checked={theme.mode === mode.value}
                        onClick={() => update({ mode: mode.value })}
                        className={`px-3 py-1 text-sm rounded-md ${
                            theme.mode === mode.value ? "bg-sky-500" : "bg-white/10 hover:bg-white/20"
                        }`}
                    >
                        {mode.label}
                    </button>
                ))}
            </div>

            <p className="text-sm text-sky-200 mb-2">Colour</p>
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Colour">
                {ACCENTS.map((accent) => (
                    <button
                        key={accent.value}
                        role="radio"
                        aria-checked={theme.accent === accent.value}
                        onClick={() => update({ accent: accent.value })}
                        className={`flex items-center gap-2 px-3 py-1 text-sm rounded-md border ${
                            theme.accent === accent.value
                                ? "border-white bg-white/20"
                                : "border-transparent bg-white/10 hover:bg-white/20"
                        }`}
                    >
                        <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: accent.swatch }} aria-hidden="true" />
                        {accent.label}
                    </button>
                ))}
            </div>
            <p className="text-xs text-sky-200 mt-3">Saved on this device.</p>
        </Section>
    );
}

// What the user has to type to confirm, so the button can't be pressed by accident
const CONFIRM_WORD = "DELETE";

function AccountSection() {
    const { user } = useAuthRedirect();
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [typed, setTyped] = useState("");
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cancel = () => {
        setConfirming(false);
        setTyped("");
        setError(null);
    };

    const handleDelete = async () => {
        setDeleting(true);
        setError(null);
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const problem = token ? await deleteAccount(token) : "Please sign in again.";
        if (problem) {
            setError(problem);
            setDeleting(false);
            return;
        }
        // The login no longer exists; clear it from this browser too
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <Section title="Account">
            {user?.email && <p className="text-sky-200 mb-3">Signed in as {user.email}</p>}

            {!confirming ? (
                <button onClick={() => setConfirming(true)} className="bg-red-600 px-3 py-1 rounded text-white hover:bg-red-700">
                    Delete profile
                </button>
            ) : (
                <div className="p-3 rounded-xl border border-red-400/60 bg-red-500/10 space-y-3">
                    <p>
                        This permanently deletes your login and your pinned stocks. It can&apos;t be undone.
                    </p>
                    <label className="block text-sm text-sky-200">
                        Type <strong className="text-white">{CONFIRM_WORD}</strong> to confirm
                        <input
                            type="text"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            className="mt-1 p-2 rounded bg-white text-black w-full"
                            autoComplete="off"
                            disabled={deleting}
                        />
                    </label>
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <div className="flex gap-2">
                        <button
                            onClick={handleDelete}
                            disabled={typed !== CONFIRM_WORD || deleting}
                            className="bg-red-600 px-3 py-1 rounded text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {deleting ? "Deleting..." : "Delete my profile"}
                        </button>
                        <button onClick={cancel} disabled={deleting} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </Section>
    );
}
