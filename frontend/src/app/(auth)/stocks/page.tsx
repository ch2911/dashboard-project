"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import StockPageClient from "./StockPageClient";
import { parseTicker } from "../../../../utils/stockLinks";

// One page for every stock, e.g. /stocks/?ticker=AAPL, so any ticker the search finds can be opened
function StockPageFromAddress() {
    const ticker = parseTicker(useSearchParams().get("ticker"));

    if (!ticker) {
        return <p className="text-center text-sky-200 p-10">Search for a stock above to see its prices, forecast and news.</p>;
    }
    // The key starts the page afresh when moving from one stock to another
    return <StockPageClient key={ticker} ticker={ticker} />;
}

export default function StockPage() {
    // A static page has to wrap useSearchParams in Suspense, because the address is only known in the browser
    return (
        <Suspense fallback={<p className="text-center text-sky-200 p-10">Loading...</p>}>
            <StockPageFromAddress />
        </Suspense>
    );
}
