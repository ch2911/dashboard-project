"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { newAddressForOldStockLink } from "../../utils/stockLinks";

// GitHub Pages shows this page for any address that doesn't exist. Stock pages used to live at
// /stocks/AAPL/, so old links like that are sent on to the stock page instead.
export default function NotFound() {
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const newAddress = newAddressForOldStockLink(window.location.pathname);
        if (newAddress) {
            window.location.replace(newAddress);
        } else {
            setChecked(true);
        }
    }, []);

    if (!checked) {
        return <p className="text-center p-10">Loading...</p>;
    }
    return (
        <div className="text-center p-10">
            <h1 className="text-2xl font-bold mb-4">Page not found</h1>
            <Link href="/dashboard" className="underline text-sky-200 hover:text-white">
                Go to your dashboard
            </Link>
        </div>
    );
}
