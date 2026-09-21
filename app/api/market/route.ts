import { marketDataProvider } from "@/lib/market-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
  const start = searchParams.get("start") || "";
  const end = searchParams.get("end") || "";
  if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return Response.json({ error: "Enter a valid U.S. stock or ETF ticker." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return Response.json({ error: "Choose a valid start and end date." }, { status: 400 });
  try {
    const cache = (globalThis as typeof globalThis & { caches?: { default?: Cache } }).caches?.default;
    const cacheKey = new Request(request.url, { method: "GET" });
    const hit = cache ? await cache.match(cacheKey) : undefined;
    if (hit) return hit;
    const result = await marketDataProvider.getHistoricalPrices(ticker, start, end);
    const response = Response.json(result, { headers: { "Cache-Control": "public, max-age=900, s-maxage=21600", "X-Data-Provider": result.provider } });
    if (cache) await cache.put(cacheKey, response.clone());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical data could not be loaded.";
    return Response.json({ error: message }, { status: /rate limit/i.test(message) ? 429 : 502 });
  }
}
