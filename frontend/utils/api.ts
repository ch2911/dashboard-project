type SentimentResult = {
    title: string;
    time: string; // ISO timestamp from backend
    sentiment: {
        label: string;
        score: number;
    };
};

type StockPrice = {
    ticker: string;
    price: number;
    change: number;
};

type PricePoint = {
    time: string;
    price: number;
};

export async function fetchSentiment(stock: string = "TSLA"): Promise<SentimentResult[]> {
    const res = await fetch(`http://127.0.0.1:5000/sentiment?stock=${stock}`);
    return res.json();
}

export async function fetchPrice(stock: string = "TSLA"): Promise<StockPrice> {
    const res = await fetch(`http://127.0.0.1:5000/price?stock=${stock}`);
    return res.json();
}

export async function fetchPriceHistory(stock: string = "TSLA"): Promise<PricePoint[]> {
    const res = await fetch(`http://127.0.0.1:5000/price_history?stock=${stock}`);
    return res.json();
}



