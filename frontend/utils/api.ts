export type SentimentResult = {
    title: string;
    time: string;
    url: string;
    sentiment: {
        label: string;
        score: number;
    };
};

export async function fetchSentiment(stock: string = "TSLA"): Promise<SentimentResult[]> {
    const res = await fetch(`http://127.0.0.1:5000/sentiment?stock=${stock}`);
    return res.json();
}

export async function fetchPrice(stock: string = "TSLA") {
    const res = await fetch(
        `http://127.0.0.1:5000/price?stock=${stock}`
    );
    return res.json();
}

export async function fetchPriceHistory(stock: string = "TSLA", range: 'daily' | 'intraday' = 'daily') {
    const res = await fetch(
        `http://127.0.0.1:5000/price_history?stock=${stock}&range=${range}`
    );
    return res.json();
}

export async function searchStocks(query: string): Promise<{symbol: string; name: string}[]> {
    if (!query) return [];
    const res = await fetch(`http://127.0.0.1:5000/search_stock?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    return res.json();
}

export async function fetchPrediction(stock: string = "TSLA") {
    const res = await fetch(`http://127.0.0.1:5000/predict?stock=${stock}`);
    if (!res.ok) return [];
    return res.json();
}

