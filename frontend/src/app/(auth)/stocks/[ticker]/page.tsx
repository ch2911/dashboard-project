// In frontend/src/app/(auth)/stocks/[ticker]/page.tsx

import fs from 'fs';
import path from 'path';
import StockPageClient from './StockPageClient';

export async function generateStaticParams() {
    const filePath = path.join(process.cwd(), '..', 'backend', 'stocks.json');
    const stocksFile = fs.readFileSync(filePath, 'utf8');
    const stocks = JSON.parse(stocksFile) as { symbol: string; name: string }[];
    const validStocks = stocks.filter(stock => stock && typeof stock.symbol === 'string');

    return validStocks.map((stock) => ({
        ticker: stock.symbol,
    }));
}

// Replace 'any' with the correct prop type
export default async function StockPage({ params }: { params: { ticker: string } }) {
    return <StockPageClient ticker={params.ticker} />;
}