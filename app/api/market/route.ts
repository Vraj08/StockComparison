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
    const result = await marketDataProvider.getHistoricalPrices(ticker, start, end);
    // The Sites Worker runtime does not expose Cloudflare's default Cache API.
    // Cache through standard response directives so data loading never depends
    // on an optional runtime capability.
    return Response.json(result, { headers: { "Cache-Control": "public, max-age=900, s-maxage=21600", "X-Data-Provider": result.provider } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical data could not be loaded.";
    return Response.json({ error: message }, { status: /rate limit/i.test(message) ? 429 : 502 });
  }
}
