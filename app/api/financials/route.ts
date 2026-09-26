import { getFinancials, searchCompanies } from "@/lib/sec-data";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim();
  const ticker = params.get("ticker")?.trim().toUpperCase();
  if (query !== undefined && (!query || query.length > 80)) return Response.json({ error: "Enter a company name or ticker (up to 80 characters)." }, { status: 400 });
  if (query === undefined && (!ticker || !/^[A-Z0-9.-]{1,12}$/.test(ticker))) return Response.json({ error: "Enter a valid company ticker." }, { status: 400 });
  try {
    if (query !== undefined) return Response.json({ companies: await searchCompanies(query) });
    const data = await getFinancials(ticker!);
    if (!data) return Response.json({ error: "Company not found. Search for a U.S. company name or ticker. ETFs do not have company cash flow statements." }, { status: 404 });
    return Response.json(data);
  } catch {
    return Response.json({ error: "SEC financial data is temporarily unavailable or limiting requests. Please try again shortly." }, { status: 502 });
  }
}
