/**
 * Represents a single daily price record for an asset.
 */
export type MarketPrice = {
  date: string;          // ISO date string (YYYY-MM-DD).
  open: number;          // Opening price for the day.
  high: number;          // Highest price reached during the day.
  low: number;           // Lowest price reached during the day.
  close: number;         // Closing price for the day.
  adjustedClose: number | null; // Close price adjusted for splits and dividends (if available).
  volume: number;        // Number of shares traded.
};

/**
 * Encapsulates the historical price data and metadata returned by a data provider.
 */
export type MarketDataResult = {
  ticker: string;        // Asset ticker symbol (e.g., 'AAPL').
  name: string;          // Full name of the asset.
  exchange: string;      // The exchange where the asset is traded.
  currency: string;      // Currency of the pricing data (e.g., 'USD').
  prices: MarketPrice[]; // Array of daily price records.
  provider: string;      // The source of the market data.
  methodology: string;   // Explanation of how the data is prepared or adjusted.
};

/**
 * Interface defining a common contract for market data fetchers.
 */
export interface MarketDataProvider {
  /**
   * Fetches historical prices for a given ticker between two dates.
   *
   * @param ticker The symbol of the asset.
   * @param start The start date (YYYY-MM-DD).
   * @param end The end date (YYYY-MM-DD).
   * @returns A promise resolving to a populated MarketDataResult.
   */
  getHistoricalPrices(ticker: string, start: string, end: string): Promise<MarketDataResult>;
}

/**
 * Type definitions representing the complex nested JSON structure returned by the Yahoo Finance API.
 */
type YahooChart = { 
  chart?: { 
    result?: Array<{ 
      meta?: { 
        symbol?: string; 
        longName?: string; 
        shortName?: string; 
        exchangeName?: string; 
        currency?: string 
      }; 
      timestamp?: number[]; 
      indicators?: { 
        quote?: Array<{ 
          open?: Array<number | null>; 
          high?: Array<number | null>; 
          low?: Array<number | null>; 
          close?: Array<number | null>; 
          volume?: Array<number | null> 
        }>; 
        adjclose?: Array<{ 
          adjclose?: Array<number | null> 
        }> 
      } 
    }>; 
    error?: { 
      description?: string 
    } | null 
  } 
};

/**
 * Implementation of MarketDataProvider that sources data from Yahoo Finance.
 */
export class YahooFinanceProvider implements MarketDataProvider {
  /**
   * Fetches and normalizes historical price data from Yahoo Finance.
   *
   * @param ticker The stock ticker symbol.
   * @param start The start date in ISO format (YYYY-MM-DD).
   * @param end The end date in ISO format (YYYY-MM-DD).
   * @returns Resolves to a unified MarketDataResult object.
   */
  async getHistoricalPrices(ticker: string, start: string, end: string): Promise<MarketDataResult> {
    // Convert the start date string to a Unix timestamp in seconds (start of the day in UTC).
    const period1 = Math.floor(new Date(`${start}T00:00:00Z`).getTime() / 1000);
    // Convert the end date string to a Unix timestamp in seconds (end of the day in UTC).
    const period2 = Math.floor(new Date(`${end}T23:59:59Z`).getTime() / 1000) + 86400;
    
    // Construct the Yahoo Finance API URL with periods and intervals.
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplits&includeAdjustedClose=true`;
    
    // Execute the fetch request with custom headers to prevent blockage.
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 PortfolioLab/1.0", Accept: "application/json" } });
    
    // Check if the response indicates failure, specifically handling rate limits.
    if (!response.ok) throw new Error(response.status === 429 ? "Market data rate limit reached. Please try again shortly." : `Market data request failed (${response.status}).`);
    
    // Parse the JSON payload based on the expected Yahoo structure.
    const payload = (await response.json()) as YahooChart;
    
    // If the API explicitly returned an error block, throw it.
    if (payload.chart?.error) throw new Error(payload.chart.error.description || "Ticker data is unavailable.");
    
    // Safely extract the primary result object from the payload.
    const result = payload.chart?.result?.[0];
    
    // Safely extract the quote indicators, which contain arrays of OHLCV data.
    const quote = result?.indicators?.quote?.[0];
    
    // Validate that we received necessary timestamp and quote arrays.
    if (!result?.timestamp?.length || !quote) throw new Error("No historical data was returned for this ticker and date range.");
    
    // Extract the adjusted close array if present; otherwise default to an empty array.
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];
    
    // Map to hold unique daily prices, keyed by date string to prevent duplicates.
    const byDate = new Map<string, MarketPrice>();
    
    // Iterate over each timestamp returned by the API.
    result.timestamp.forEach((timestamp, index) => {
      // Extract the corresponding price and volume points for this specific index.
      const open = quote.open?.[index], high = quote.high?.[index], low = quote.low?.[index], close = quote.close?.[index];
      
      // If any essential OHLC value is missing or invalid, skip this day's entry.
      if ([open, high, low, close].some((value) => value == null || !Number.isFinite(value))) return;
      
      // Convert the Unix timestamp (seconds) into an ISO date string (YYYY-MM-DD).
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
      
      // Construct and store the MarketPrice object in the map.
      byDate.set(date, { 
        date, 
        open: open as number, 
        high: high as number, 
        low: low as number, 
        close: close as number, 
        adjustedClose: Number.isFinite(adjusted[index]) ? adjusted[index] as number : null, 
        volume: Number.isFinite(quote.volume?.[index]) ? quote.volume?.[index] as number : 0 
      });
    });
    
    // Convert the map values into an array and ensure they are sorted chronologically.
    const prices = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    
    // Ensure we actually accumulated valid data points.
    if (!prices.length) throw new Error("The provider returned no complete trading-day records for this period.");
    
    // Extract metadata from the result to populate top-level fields.
    const meta = result.meta || {};
    
    // Build and return the final standardized MarketDataResult.
    return { 
      ticker: (meta.symbol || ticker).toUpperCase(), 
      name: meta.longName || meta.shortName || ticker.toUpperCase(), 
      exchange: meta.exchangeName || "U.S. market", 
      currency: meta.currency || "USD", 
      prices, 
      provider: "Yahoo Finance", 
      methodology: "Daily OHLC prices are split-consistent as supplied by Yahoo Finance. Dividends are ignored in this MVP; adjusted close is retained in exports but is not mixed into purchase calculations." 
    };
  }
}

/**
 * Singleton instance of the default market data provider.
 */
export const marketDataProvider: MarketDataProvider = new YahooFinanceProvider();
