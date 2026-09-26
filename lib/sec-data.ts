import { normalizeCashFlows, type CompanyFacts, type Financials } from "./financials";

// Define the shape of a Company object as returned by the SEC tickers JSON.
// It includes a Central Index Key (cik_str), the stock ticker, and the full company name (title).
type Company = { cik_str: number; ticker: string; title: string };

/**
 * Helper function to fetch JSON data from the SEC API.
 * The SEC requires a User-Agent header; otherwise, they may block the request.
 * It also handles basic timeouts and caching (using Next.js 'next' options).
 * 
 * @param url The SEC endpoint URL to fetch data from.
 * @returns A promise that resolves to the typed JSON response.
 */
async function secJson<T>(url: string): Promise<T> {
  // Execute a fetch request to the given SEC URL
  const response = await fetch(url, {
    headers: { 
      // User-Agent must be set for SEC EDGAR API compliance. Uses env var or fallback.
      "User-Agent": process.env.SEC_USER_AGENT || "PortfolioLab/1.0 personal financial research", 
      // Expecting a JSON response from the API
      Accept: "application/json" 
    },
    // Set a timeout of 20 seconds using AbortSignal to avoid hanging requests
    signal: AbortSignal.timeout(20000), 
    // Revalidate the cache every 21600 seconds (6 hours)
    next: { revalidate: 21600 },
  });

  // Check if the response is not OK (e.g., 403 Forbidden or 429 Too Many Requests)
  if (!response.ok) {
    // Throw a specific error message if we hit rate limits or are forbidden
    if (response.status === 429 || response.status === 403) {
      throw new Error("SEC data is temporarily limiting requests. Please try again later.");
    }
    // Generic error for other types of failures
    throw new Error("SEC filings are temporarily unavailable. Please try again.");
  }
  
  // Parse and return the JSON payload, casting it to the generic type T
  return response.json() as Promise<T>;
}

/**
 * Search for companies by their ticker or name.
 * 
 * @param query The search term provided by the user.
 * @returns An array of up to 12 matching companies, sorted by relevance.
 */
export async function searchCompanies(query: string) {
  // Fetch the full dictionary of all company tickers from SEC
  // The response is an object where keys are indices and values are Company objects
  const rawCompaniesData = await secJson<Record<string, Company>>("https://www.sec.gov/files/company_tickers.json");
  // Convert the object values into an array of Company objects
  const companies = Object.values(rawCompaniesData);
  
  // Normalize the query string to uppercase for case-insensitive matching
  const normalized = query.toUpperCase();
  
  // Filter and sort the list of companies
  return companies
    // Keep companies where the ticker includes the query, or the title includes the query
    .filter(c => c.ticker.includes(normalized) || c.title.toUpperCase().includes(normalized))
    // Sort matches to prioritize exact matches and prefix matches
    .sort((a, b) => {
      // 1. Exact ticker match gets highest priority
      const exactMatchDiff = Number(b.ticker === normalized) - Number(a.ticker === normalized);
      if (exactMatchDiff !== 0) return exactMatchDiff;
      
      // 2. Ticker prefix match gets second priority
      const prefixMatchDiff = Number(b.ticker.startsWith(normalized)) - Number(a.ticker.startsWith(normalized));
      if (prefixMatchDiff !== 0) return prefixMatchDiff;
      
      // 3. Fall back to alphabetical sorting by company title
      return a.title.localeCompare(b.title);
    })
    // Limit the results to the top 12 matches to prevent large payloads
    .slice(0, 12);
}

/**
 * Retrieve the normalized financials for a given stock ticker.
 * 
 * @param ticker The stock ticker symbol to retrieve financials for.
 * @returns A Financials object containing normalized cash flow periods, or null if not found.
 */
export async function getFinancials(ticker: string): Promise<Financials | null> {
  // Search for the company by its ticker, then find the exact match from the results
  const searchResults = await searchCompanies(ticker);
  const company = searchResults.find(c => c.ticker === ticker);
  
  // If no company matches the exact ticker, return null
  if (!company) return null;
  
  // Construct the SEC CompanyFacts API URL using the padded CIK (must be 10 digits, padded with leading zeroes)
  const source = `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(company.cik_str).padStart(10, "0")}.json`;
  
  // Fetch the XBRL company facts payload from the SEC API
  const payload = await secJson<CompanyFacts>(source);
  
  // Return the assembled Financials object
  return { 
    ticker, // The requested ticker
    name: payload.entityName || company.title, // Company name from payload or search fallback
    cik: company.cik_str, // Central Index Key
    currency: "USD", // SEC filings are predominantly in USD
    periods: normalizeCashFlows(payload), // Extract and normalize cash flow periods from the raw XBRL facts
    source // The source URL used to fetch the data
  };
}
