// Calls to the Flask API. Every helper returns a safe fallback (null or an empty list)
// instead of throwing, so one failed request can't leave a page stuck on "Loading...".

// Backend URL: set NEXT_PUBLIC_API_URL when deploying; defaults to the local Flask server
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

// Render's free plan can take about a minute to wake up, so give each request up to 90 seconds
export const REQUEST_TIMEOUT_MS = 90_000;

export type StockPrice = {
    ticker: string;
    /** The company's full name, or null when the server doesn't know it */
    name?: string | null;
    price: number;
    change: number;
};

export type PricePoint = {
    time: string;
    price: number;
};

// A forecast day: the middle price, plus the likely range (8 outcomes in 10) when the API sends one
export type ForecastPoint = PricePoint & {
    low?: number;
    high?: number;
};

export type SentimentResult = {
    title: string;
    time: string;
    url: string;
    sentiment: {
        label: string;
        score: number;
    };
};

export type TrendingArticle = SentimentResult & {
    affected_stocks: string[];
};

export type StockSuggestion = {
    symbol: string;
    name: string;
};

/** The parsed JSON response, or null if the request failed for any reason. */
export async function getJson<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!res.ok) return null;
        return (await res.json()) as T;
    } catch {
        // Network error, timeout, or a response that isn't JSON (e.g. an HTML error page)
        return null;
    }
}

/** Like getJson for endpoints that return a list: null unless the response really is a list. */
async function getList<T>(path: string): Promise<T[] | null> {
    const data = await getJson<unknown>(path);
    return Array.isArray(data) ? (data as T[]) : null;
}

/** Latest price and today's change, or null if it couldn't be loaded. */
export async function fetchPrice(stock: string = "TSLA"): Promise<StockPrice | null> {
    const data = await getJson<StockPrice>(`/price?stock=${encodeURIComponent(stock)}`);
    return data && typeof data.price === "number" ? data : null;
}

export async function fetchPriceHistory(stock: string = "TSLA", range: "daily" | "intraday" = "daily"): Promise<PricePoint[]> {
    return (await getList<PricePoint>(`/price_history?stock=${encodeURIComponent(stock)}&range=${range}`)) ?? [];
}

export async function fetchSentiment(stock: string = "TSLA"): Promise<SentimentResult[]> {
    return (await getList<SentimentResult>(`/sentiment?stock=${encodeURIComponent(stock)}`)) ?? [];
}

export async function fetchPrediction(stock: string = "TSLA"): Promise<ForecastPoint[]> {
    return (await getList<ForecastPoint>(`/predict?stock=${encodeURIComponent(stock)}`)) ?? [];
}

export async function searchStocks(query: string): Promise<StockSuggestion[]> {
    if (!query) return [];
    return (await getList<StockSuggestion>(`/search_stock?q=${encodeURIComponent(query)}`)) ?? [];
}

/** Trending headlines, or null if they couldn't be loaded (so the page can say so). */
export async function fetchTrendingNews(): Promise<TrendingArticle[] | null> {
    return getList<TrendingArticle>("/trending_news");
}

/**
 * Permanently delete the signed-in user's profile (their pinned stocks and their login).
 * Returns null on success, or a message to show if it failed.
 */
export async function deleteAccount(accessToken: string): Promise<string | null> {
    try {
        const res = await fetch(`${API_URL}/account`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return null;
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return body?.error ?? "Your profile couldn't be deleted. Please try again.";
    } catch {
        return "Couldn't reach the server. Please try again.";
    }
}
