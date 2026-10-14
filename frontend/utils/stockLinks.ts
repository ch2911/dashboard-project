// Every stock is shown on one page that reads the ticker from the address: /stocks/?ticker=AAPL.
// A separate page per ticker only works for stocks known when the site is built, so a stock found
// through the search fallback (e.g. ASML) used to show "page not found" on GitHub Pages.

// Yahoo Finance tickers: letters and digits, plus "." (RR.L), "-" (BRK-B), "=" (GBPUSD=X) and "^" (^GSPC)
const TICKER_PATTERN = /^[A-Z0-9^][A-Z0-9.\-=^]{0,14}$/;

/** The link to a stock's page. */
export function stockPageHref(ticker: string): string {
    return `/stocks/?ticker=${encodeURIComponent(ticker)}`;
}

/** A ticker from the address bar in upper case, or null if it doesn't look like a ticker. */
export function parseTicker(raw: string | null | undefined): string | null {
    const ticker = (raw ?? "").trim().toUpperCase();
    return TICKER_PATTERN.test(ticker) ? ticker : null;
}

/**
 * Stock pages used to live at /stocks/AAPL/. For an old link like that, return the address of the
 * new page (keeping any base path such as /dashboard-project); for anything else, return null.
 */
export function newAddressForOldStockLink(pathname: string): string | null {
    const match = pathname.match(/^(.*)\/stocks\/([^/]+)\/?$/);
    if (!match) return null;
    let raw: string;
    try {
        raw = decodeURIComponent(match[2]);
    } catch {
        return null;
    }
    const ticker = parseTicker(raw);
    return ticker ? `${match[1]}${stockPageHref(ticker)}` : null;
}
