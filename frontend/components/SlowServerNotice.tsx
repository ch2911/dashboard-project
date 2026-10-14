"use client";

import { useEffect, useState } from "react";

// The API runs on Render's free plan, which sleeps when nobody has used it for a while and
// takes up to a minute to wake. If loading takes more than a few seconds, say why.
export default function SlowServerNotice({ active }: { active: boolean }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!active) {
            setShow(false);
            return;
        }
        const timer = setTimeout(() => setShow(true), 5000);
        return () => clearTimeout(timer);
    }, [active]);

    if (!show) return null;
    return (
        <p className="text-sm text-sky-200 bg-white/10 rounded-lg px-3 py-2 mb-4">
            Waking up the server. It sleeps when nobody has used it for a while, so the first load can take up to a minute.
        </p>
    );
}
