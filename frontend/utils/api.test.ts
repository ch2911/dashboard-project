import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the helpers that call the Flask API. fetch is replaced with a mock,
// so no server is needed.

const fetchMock = vi.fn();
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
}

function htmlResponse(status: number) {
    return new Response("<!doctype html><title>Internal Server Error</title>", { status });
}

// The URL of the nth fetch call
function requestedUrl(call = 0) {
    return fetchMock.mock.calls[call][0];
}

// api.ts reads NEXT_PUBLIC_API_URL when it is first imported, so import a fresh copy each time
async function loadApi() {
    vi.resetModules();
    return import("./api");
}

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    delete process.env.NEXT_PUBLIC_API_URL;
});

afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
});

describe("API_URL", () => {
    it("defaults to the local Flask server", async () => {
        const { API_URL } = await loadApi();
        expect(API_URL).toBe("http://127.0.0.1:5000");
    });

    it("uses NEXT_PUBLIC_API_URL without a trailing slash", async () => {
        process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/";
        const { API_URL } = await loadApi();
        expect(API_URL).toBe("https://api.example.com");
    });

    it("falls back to the local server when the variable is empty", async () => {
        process.env.NEXT_PUBLIC_API_URL = "";
        const { API_URL } = await loadApi();
        expect(API_URL).toBe("http://127.0.0.1:5000");
    });
});

describe("successful requests", () => {
    it("fetchPrice requests the price for the ticker", async () => {
        process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
        const { fetchPrice } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ ticker: "AAPL", price: 101.5, change: 0.4 }));

        const price = await fetchPrice("AAPL");

        expect(requestedUrl()).toBe("https://api.example.com/price?stock=AAPL");
        expect(price).toEqual({ ticker: "AAPL", price: 101.5, change: 0.4 });
    });

    it("gives every request a timeout so a hung server can't stall the page forever", async () => {
        const { fetchPrice } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ ticker: "AAPL", price: 1, change: 0 }));

        await fetchPrice("AAPL");

        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    it("fetchPriceHistory passes the chosen range", async () => {
        const { fetchPriceHistory } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse([{ time: "2026-10-13T00:00:00Z", price: 1 }]));

        const history = await fetchPriceHistory("TSLA", "intraday");

        expect(requestedUrl()).toBe("http://127.0.0.1:5000/price_history?stock=TSLA&range=intraday");
        expect(history).toHaveLength(1);
    });

    it("encodes tickers with special characters", async () => {
        const { fetchPrice } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ ticker: "RR.L", price: 1, change: 0 }));

        await fetchPrice("BRK.B&x");

        expect(requestedUrl()).toBe("http://127.0.0.1:5000/price?stock=BRK.B%26x");
    });

    it("fetchSentiment returns the scored headlines", async () => {
        const { fetchSentiment } = await loadApi();
        const headlines = [
            { title: "Profits soar", time: "2026-10-01T09:00:00Z", url: "https://example.com", sentiment: { label: "positive", score: 0.6 } },
        ];
        fetchMock.mockResolvedValue(jsonResponse(headlines));

        expect(await fetchSentiment("NVDA")).toEqual(headlines);
        expect(requestedUrl()).toBe("http://127.0.0.1:5000/sentiment?stock=NVDA");
    });

    it("searchStocks skips the request for an empty query", async () => {
        const { searchStocks } = await loadApi();

        expect(await searchStocks("")).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("searchStocks encodes the query", async () => {
        const { searchStocks } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse([{ symbol: "SPY", name: "SPDR S&P 500 ETF" }]));

        const results = await searchStocks("S&P 500");

        expect(requestedUrl()).toBe("http://127.0.0.1:5000/search_stock?q=S%26P%20500");
        expect(results).toEqual([{ symbol: "SPY", name: "SPDR S&P 500 ETF" }]);
    });

    it("fetchTrendingNews returns the headlines", async () => {
        const { fetchTrendingNews } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse([]));

        expect(await fetchTrendingNews()).toEqual([]);
        expect(requestedUrl()).toBe("http://127.0.0.1:5000/trending_news");
    });
});

describe("failed requests return a fallback instead of throwing", () => {
    // Each case: what went wrong, and how fetch behaves
    const failures: [string, () => void][] = [
        ["a JSON error response", () => fetchMock.mockResolvedValue(jsonResponse({ error: "failed" }, 500))],
        ["an HTML error page", () => fetchMock.mockResolvedValue(htmlResponse(502))],
        ["a network error (e.g. CORS)", () => fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))],
        ["a timeout", () => fetchMock.mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"))],
        ["a response that isn't JSON", () => fetchMock.mockResolvedValue(new Response("not json", { status: 200 }))],
    ];

    it.each(failures)("fetchPrice gives null after %s", async (_, fail) => {
        const { fetchPrice } = await loadApi();
        fail();
        expect(await fetchPrice("AAPL")).toBeNull();
    });

    it.each(failures)("list helpers give an empty list after %s", async (_, fail) => {
        const api = await loadApi();
        fail();
        expect(await api.fetchPriceHistory("AAPL")).toEqual([]);
        expect(await api.fetchPrediction("AAPL")).toEqual([]);
        expect(await api.fetchSentiment("AAPL")).toEqual([]);
        expect(await api.searchStocks("apple")).toEqual([]);
    });

    it.each(failures)("fetchTrendingNews gives null after %s", async (_, fail) => {
        const { fetchTrendingNews } = await loadApi();
        fail();
        expect(await fetchTrendingNews()).toBeNull();
    });

    it("list helpers reject a response that isn't a list", async () => {
        const { fetchPrediction } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ unexpected: "shape" }));
        expect(await fetchPrediction("AAPL")).toEqual([]);
    });

    it("fetchPrice rejects a response without a price", async () => {
        const { fetchPrice } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ error: "No data" }));
        expect(await fetchPrice("AAPL")).toBeNull();
    });
});
