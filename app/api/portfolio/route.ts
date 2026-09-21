import { marketDataProvider, type MarketPrice } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type PositionInput = { ticker: string; quantity: number; netInvested?: number };
type NewsItem = { title?: string; link?: string; publisher?: string; providerPublishTime?: number; relatedTickers?: string[] };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};
const annualVolatility = (prices: MarketPrice[]) => {
  const returns = prices.slice(1).map((row, i) => Math.log(row.close / prices[i].close)).filter(Number.isFinite);
  if (returns.length < 2) return 0;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
};
const rollingYearReturns = (prices: MarketPrice[]) => {
  if (prices.length < 40) return [];
  const window = Math.min(252, Math.max(20, Math.floor(prices.length / 3)));
  return prices.slice(window).map((row, i) => row.close / prices[i].close - 1).filter(Number.isFinite);
};
const sentiment = (title: string) => {
  const value = title.toLowerCase();
  const positive = ["beats", "surges", "rallies", "growth", "upgrade", "record", "strong", "rises", "gain", "outperform", "profit"];
  const negative = ["misses", "falls", "drops", "warning", "downgrade", "weak", "lawsuit", "cuts", "slump", "risk", "loss"];
  const score = positive.filter((term) => value.includes(term)).length - negative.filter((term) => value.includes(term)).length;
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
};

async function getNews(ticker: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=4&enableFuzzyQuery=false&enableResearchReports=false`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 DCAResearchLab/1.0", Accept: "application/json" } });
    if (!response.ok) return [];
    const payload = await response.json() as { news?: NewsItem[] };
    return (payload.news || []).map((item) => ({ ticker, title: item.title || "Untitled market story", url: item.link || "", publisher: item.publisher || "Market source", publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : null, sentiment: sentiment(item.title || "") }));
  } catch { return []; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { positions?: PositionInput[] };
    const positions = (body.positions || []).filter((item) => /^[A-Z0-9.-]{1,12}$/.test(item.ticker) && Number.isFinite(item.quantity) && item.quantity > 0).slice(0, 40);
    if (!positions.length) return Response.json({ error: "No positive stock or ETF positions were found in the file." }, { status: 400 });
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date(); startDate.setFullYear(startDate.getFullYear() - 5);
    const start = startDate.toISOString().slice(0, 10);
    const results = [];
    for (let index = 0; index < positions.length; index += 5) {
      const batch = positions.slice(index, index + 5);
      const resolved = await Promise.all(batch.map(async (position) => {
        try {
          const data = await marketDataProvider.getHistoricalPrices(position.ticker, start, end);
          const latest = data.prices.at(-1)!;
          const yearStart = data.prices.find((row) => row.date >= new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)) || data.prices[0];
          const rolling = rollingYearReturns(data.prices);
          const fullReturn = latest.close / data.prices[0].close - 1;
          const fallback = fullReturn / Math.max(1, data.prices.length / 252);
          const rate = (p: number) => clamp(rolling.length ? percentile(rolling, p) : fallback, -0.8, 1.5);
          return { ticker: data.ticker, name: data.name, quantity: position.quantity, netInvested: Number(position.netInvested || 0), latestPrice: latest.close, priceDate: latest.date, marketValue: position.quantity * latest.close, oneYearReturn: latest.close / yearStart.close - 1, volatility: annualVolatility(data.prices), scenarios: { worst: rate(.05), bear: rate(.25), base: rate(.5), bull: rate(.75), best: rate(.95) } };
        } catch (error) { return { ticker: position.ticker, quantity: position.quantity, error: error instanceof Error ? error.message : "Data unavailable" }; }
      }));
      results.push(...resolved);
    }
    const valued = results.filter((item): item is Exclude<typeof item, { error: string }> => !("error" in item) && Number.isFinite(item.marketValue));
    const totalValue = valued.reduce((sum, item) => sum + item.marketValue, 0);
    const withWeights = valued.map((item) => ({ ...item, weight: totalValue ? item.marketValue / totalValue : 0 })).sort((a, b) => b.marketValue - a.marketValue);
    const scenarioKeys = ["worst", "bear", "base", "bull", "best"] as const;
    const scenarios = Object.fromEntries(scenarioKeys.map((key) => [key, withWeights.reduce((sum, item) => sum + item.weight * item.scenarios[key], 0)]));
    const volatility = withWeights.reduce((sum, item) => sum + item.weight * item.volatility, 0);
    const largestWeight = withWeights[0]?.weight || 0;
    const hhi = withWeights.reduce((sum, item) => sum + item.weight ** 2, 0);
    const newsGroups = await Promise.all(withWeights.slice(0, 7).map((item) => getNews(item.ticker)));
    const news = newsGroups.flat().filter((item, index, all) => item.url && all.findIndex((other) => other.url === item.url) === index).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 14);
    const moodScore = news.reduce((sum, item) => sum + (item.sentiment === "positive" ? 1 : item.sentiment === "negative" ? -1 : 0), 0);
    const dcaFit = volatility >= .28 || largestWeight >= .25 || hhi >= .16;
    return Response.json({ asOf: end, totalValue, positions: withWeights, unavailable: results.filter((item) => "error" in item), scenarios, portfolioVolatility: volatility, largestWeight, concentrationIndex: hhi, news, marketMood: moodScore >= 2 ? "More positive headlines" : moodScore <= -2 ? "More cautious headlines" : "Mixed headlines", strategy: { fit: dcaFit ? "DCA may fit this portfolio better" : "A blended approach may fit this portfolio", explanation: dcaFit ? "This portfolio has meaningful price swings or concentration. Spreading new money over time can reduce the risk of choosing one unlucky entry day, but it may lag if prices rise steadily." : "The portfolio is reasonably spread out based on this file. Historically, investing sooner gives money more time in the market, while DCA can make the path easier to tolerate." }, methodology: "Scenario rates are weighted historical percentiles of rolling returns from available daily prices. They are examples, not forecasts. News tone uses simple headline keywords and can miss context." }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The portfolio could not be analyzed." }, { status: 500 });
  }
}
