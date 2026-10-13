import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Tests for the helpers that call the Flask API. fetch is replaced with a mock,
// so no server is needed.

const fetchMock = vi.fn();
const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status });
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

describe("request helpers", () => {
    it("fetchPrice requests the price for the ticker", async () => {
        process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";
        const { fetchPrice } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ ticker: "AAPL", price: 101.5, change: 0.4 }));

        const price = await fetchPrice("AAPL");

        expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/price?stock=AAPL");
        expect(price).toEqual({ ticker: "AAPL", price: 101.5, change: 0.4 });
    });

    it("fetchPriceHistory passes the chosen range", async () => {
        const { fetchPriceHistory } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse([]));

        await fetchPriceHistory("TSLA", "intraday");

        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:5000/price_history?stock=TSLA&range=intraday");
    });

    it("fetchSentiment returns the scored headlines", async () => {
        const { fetchSentiment } = await loadApi();
        const headlines = [
            { title: "Profits soar", time: "2026-10-01T09:00:00Z", url: "https://example.com", sentiment: { label: "positive", score: 0.6 } },
        ];
        fetchMock.mockResolvedValue(jsonResponse(headlines));

        expect(await fetchSentiment("NVDA")).toEqual(headlines);
        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:5000/sentiment?stock=NVDA");
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

        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:5000/search_stock?q=S%26P%20500");
        expect(results).toEqual([{ symbol: "SPY", name: "SPDR S&P 500 ETF" }]);
    });

    it("searchStocks returns no results when the API errors", async () => {
        const { searchStocks } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse([], 500));

        expect(await searchStocks("apple")).toEqual([]);
    });

    it("fetchPrediction returns no forecast when the API errors", async () => {
        const { fetchPrediction } = await loadApi();
        fetchMock.mockResolvedValue(jsonResponse({ error: "failed" }, 500));

        expect(await fetchPrediction("AAPL")).toEqual([]);
    });
});
