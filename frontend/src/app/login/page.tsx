"use client";

import { useState } from "react";
import { supabase} from "../../../lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setLoading(false);

        if (error) {
            setError(error.message);
        } else {
            router.push("/dashboard"); // redirect to home
        }
    };

    const handleSignup = async () => {
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        setLoading(false);

        if (error) {
            setError(error.message);
        } else {
            alert("Check your email for confirmation link!");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center app-bg text-white p-4">
            <div className="bg-white/10 backdrop-blur-md p-6 sm:p-8 rounded-2xl shadow-lg w-full max-w-sm">
                <h1 className="text-2xl font-bold mb-4 text-center">🔑 Login</h1>
                <form onSubmit={handleLogin} className="space-y-4">
                    <input
                        type="email"
                        placeholder="Email"
                        className="w-full p-2 rounded bg-white text-black"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        className="w-full p-2 rounded bg-white text-black"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p className="text-red-400 text-sm">{error}</p>}

                    <button
                        type="submit"
                        className="w-full py-2 rounded bg-sky-500 hover:bg-sky-400 text-white font-bold"
                        disabled={loading}
                    >
                        {loading ? "Loading..." : "Login"}
                    </button>
                </form>

                <p className="text-center mt-4 text-sky-200">
                    Don’t have an account?{" "}
                    <button
                        className="text-sky-400 underline"
                        onClick={handleSignup}
                        disabled={loading}
                    >
                        Sign up
                    </button>
                </p>
            </div>
        </div>
    );
}
