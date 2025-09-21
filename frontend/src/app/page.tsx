"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/useAuth";

export default function RootPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            if (user) {
                router.replace("/dashboard"); // User is logged in, go to dashboard
            } else {
                router.replace("/login"); // No user, go to login
            }
        }
    }, [user, loading, router]);

    // Display a simple loading indicator while we check the auth status
    return (
        <div className="min-h-screen flex items-center justify-center bg-sky-900 text-white">
            <p>Loading...</p>
        </div>
    );
}