export type MarketPrice = {
  date: string; open: number; high: number; low: number; close: number;
  adjustedClose: number | null; volume: number;
};

export type MarketDataResult = {
  ticker: string; name: string; exchange: string; currency: string;
  prices: MarketPrice[]; provider: string; methodology: string;
};

export interface MarketDataProvider {
  getHistoricalPrices(ticker: string, start: string, end: string): Promise<MarketDataResult>;
}

type YahooChart = { chart?: { result?: Array<{ meta?: { symbol?: string; longName?: string; shortName?: string; exchangeName?: string; currency?: string }; timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }>; adjclose?: Array<{ adjclose?: Array<number | null> }> } }>; error?: { description?: string } | null } };

export class YahooFinanceProvider implements MarketDataProvider {
  async getHistoricalPrices(ticker: string, start: string, end: string): Promise<MarketDataResult> {
    const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    const period2 = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000) + 86400;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits&includeAdjustedClose=true`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 DCAResearchLab/1.0", Accept: "application/json" } });
    if (!response.ok) throw new Error(response.status === 429 ? "Market data rate limit reached. Please try again shortly." : `Market data request failed (${response.status}).`);
    const payload = (await response.json()) as YahooChart;
    if (payload.chart?.error) throw new Error(payload.chart.error.description || "Ticker data is unavailable.");
    const result = payload.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result?.timestamp?.length || !quote) throw new Error("No historical data was returned for this ticker and date range.");
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
    const byDate = new Map<string, MarketPrice>();
    result.timestamp.forEach((timestamp, index) => {
      const open = quote.open?.[index], high = quote.high?.[index], low = quote.low?.[index], close = quote.close?.[index];
      if ([open, high, low, close].some((value) => value == null || !Number.isFinite(value))) return;
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      byDate.set(date, { date, open: open as number, high: high as number, low: low as number, close: close as number, adjustedClose: Number.isFinite(adjusted[index]) ? adjusted[index] as number : null, volume: Number.isFinite(quote.volume?.[index]) ? quote.volume?.[index] as number : 0 });
    });
    const prices = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (!prices.length) throw new Error("The provider returned no complete trading-day records for this period.");
    const meta = result.meta || {};
    return { ticker: (meta.symbol || ticker).toUpperCase(), name: meta.longName || meta.shortName || ticker.toUpperCase(), exchange: meta.exchangeName || "U.S. market", currency: meta.currency || "USD", prices, provider: "Yahoo Finance", methodology: "Daily OHLC prices are split-consistent as supplied by Yahoo Finance. Dividends are ignored in this MVP; adjusted close is retained in exports but is not mixed into purchase calculations." };
  }
}

export const marketDataProvider: MarketDataProvider = new YahooFinanceProvider();
