import { marketDataProvider, type MarketPrice } from "@/lib/market-data";

export const dynamic = "force-dynamic";

type PositionInput = { ticker: string; quantity: number; netInvested?: number; firstInvestmentDate?: string | null };
type NewsItem = { title?: string; link?: string; publisher?: string; providerPublishTime?: number };
type SearchQuote = { symbol?: string; sector?: string; industry?: string; quoteType?: string; longname?: string; shortname?: string };
type ScenarioKey = "worst" | "bear" | "base" | "bull" | "best";
type ScenarioCurve = Record<ScenarioKey | "average" | "realistic", number> & {
  source: "holding history and current growth";
  samples: number;
  math: { allocationWeightedRate: number; riskAdjustment: number; planningRate: number };
  compoundedTotals: Record<ScenarioKey | "average" | "realistic", number>;
};

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
};
const returnPrice = (row: MarketPrice) => row.adjustedClose && row.adjustedClose > 0 ? row.adjustedClose : row.close;
const annualVolatility = (prices: MarketPrice[]) => {
  const returns = prices.slice(1).map((row, i) => Math.log(returnPrice(row) / returnPrice(prices[i]))).filter(Number.isFinite);
  if (returns.length < 2) return 0;
  const average = mean(returns);
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
};
const rollingYearReturns = (prices: MarketPrice[]) => {
  if (prices.length < 252) return [];
  return prices.slice(252).map((row, i) => returnPrice(row) / returnPrice(prices[i]) - 1).filter(Number.isFinite);
};
const maxDrawdown = (prices: MarketPrice[]) => {
  let peak = 0, worst = 0;
  prices.forEach((row) => { const price = returnPrice(row); peak = Math.max(peak, price); if (peak) worst = Math.min(worst, price / peak - 1); });
  return worst;
};

const PERIODS = [1, 2, 3, 5, 10, 15, 20, 30] as const;
const periodReturns = (prices: MarketPrice[]) => {
  const latest = prices.at(-1);
  if (!latest) return {} as Record<string, { total: number; annualized: number; startDate: string }>;
  const latestTime = new Date(`${latest.date}T00:00:00Z`).getTime();
  return Object.fromEntries(PERIODS.flatMap((years) => {
    const target = latestTime - years * 365.2425 * 86400000;
    const start = prices.find((row) => new Date(`${row.date}T00:00:00Z`).getTime() >= target);
    if (!start || new Date(`${start.date}T00:00:00Z`).getTime() - target > 45 * 86400000) return [];
    const total = returnPrice(latest) / returnPrice(start) - 1;
    return [[String(years), { total, annualized: Math.pow(Math.max(.01, 1 + total), 1 / years) - 1, startDate: start.date }]];
  }));
};
const sentiment = (title: string) => {
  const value = title.toLowerCase();
  const positive = ["beats", "surges", "rallies", "growth", "upgrade", "record", "strong", "rises", "gain", "outperform", "profit"];
  const negative = ["misses", "falls", "drops", "warning", "downgrade", "weak", "lawsuit", "cuts", "slump", "risk", "loss"];
  const score = positive.filter((term) => value.includes(term)).length - negative.filter((term) => value.includes(term)).length;
  return score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
};

async function getTickerContext(ticker: string) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=5&newsCount=6&enableFuzzyQuery=false&enableResearchReports=false`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 PortfolioLab/1.0", Accept: "application/json" } });
    if (!response.ok) return { news: [], sector: "Unclassified", industry: "", profileName: "" };
    const payload = await response.json() as { news?: NewsItem[]; quotes?: SearchQuote[] };
    const quote = (payload.quotes || []).find((item) => item.symbol?.toUpperCase() === ticker.toUpperCase());
    const sector = quote?.sector || (quote?.quoteType === "ETF" || quote?.quoteType === "MUTUALFUND" ? "Funds & ETFs" : "Unclassified");
    const news = (payload.news || []).map((item) => ({ ticker, title: item.title || "Untitled market story", url: item.link || "", publisher: item.publisher || "Market source", publishedAt: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : null, sentiment: sentiment(item.title || "") }));
    return { news, sector, industry: quote?.industry || "", profileName: quote?.longname || quote?.shortname || "" };
  } catch { return { news: [], sector: "Unclassified", industry: "", profileName: "" }; }
}

function rollingCagrs(prices: MarketPrice[], years: number) {
  const window = Math.max(200, Math.round(years * 252));
  if (prices.length <= window) return [];
  const samples: number[] = [];
  for (let end = window; end < prices.length; end += 21) {
    const total = returnPrice(prices[end]) / returnPrice(prices[end - window]);
    if (total > 0 && Number.isFinite(total)) samples.push(Math.pow(total, 1 / years) - 1);
  }
  return samples;
}

function makeScenarioCurve(items: Array<{ weight: number; forecastByHorizon: Record<string, ReturnType<typeof holdingForecast>> }>, years: number, allocationWeightedRate: number, riskAdjustment: number, planningRate: number): ScenarioCurve {
  const forecast = (item: typeof items[number]) => item.forecastByHorizon[String(years)];
  const weighted = (key: ScenarioKey | "average") => items.reduce((sum, item) => sum + item.weight * forecast(item).outcomes[key], 0);
  const samples = items.reduce((sum, item) => sum + forecast(item).samples, 0);
  const rates = {
    worst: weighted("worst"), bear: weighted("bear"), base: weighted("base"), bull: weighted("bull"), best: weighted("best"),
    average: weighted("average"), realistic: planningRate,
  };
  const compoundedTotals = Object.fromEntries(
    Object.entries(rates).map(([key, rate]) => [key, Math.pow(1 + Math.max(-0.99, rate), years) - 1])
  ) as Record<ScenarioKey | "average" | "realistic", number>;
  return {
    ...rates,
    source: "holding history and current growth", samples,
    math: { allocationWeightedRate, riskAdjustment, planningRate },
    compoundedTotals,
  };
}

function holdingForecast(prices: MarketPrice[], oneYearReturn: number, volatility: number, years: number) {
  const first = prices[0], latest = prices.at(-1)!;
  const elapsedYears = Math.max(1, (new Date(`${latest.date}T00:00:00Z`).getTime() - new Date(`${first.date}T00:00:00Z`).getTime()) / (365.2425 * 86400000));
  const rawHistoricalCagr = Math.pow(returnPrice(latest) / returnPrice(first), 1 / elapsedYears) - 1;
  const maxAllowableGrowth = clamp(0.10 + 0.60 / Math.sqrt(years), 0.10, 0.50);
  const longTermGrowth = clamp(rawHistoricalCagr, -.25, maxAllowableGrowth);
  const history = rollingCagrs(prices, years);
  const annualHistory = rollingYearReturns(prices);
  const annualMedian = annualHistory.length ? percentile(annualHistory, .5) : longTermGrowth;
  const historyValue = (p: number) => history.length >= 4
    ? percentile(history, p)
    : longTermGrowth + (percentile(annualHistory.length ? annualHistory : [longTermGrowth], p) - longTermGrowth) / Math.sqrt(Math.max(1, years));
  const historicalGrowth = clamp(historyValue(.5), -.35, maxAllowableGrowth);
  const recentGrowth = clamp(oneYearReturn, -.75, 1.25);
  const recentWeight = clamp(.30 / Math.sqrt(years), .05, .30);
  const longTermWeight = .30;
  const historicalWeight = 1 - recentWeight - longTermWeight;
  const beforeRisk = recentWeight * recentGrowth + historicalWeight * historicalGrowth + longTermWeight * longTermGrowth;
  const riskDeduction = clamp(.20 * volatility ** 2 / Math.sqrt(years), 0, .08);
  const blendedOutcome = (p: number) => clamp(recentWeight * recentGrowth + historicalWeight * clamp(historyValue(p), -.75, 1.25) + longTermWeight * longTermGrowth, -.75, 1.25);
  const outcomes = {
    worst: blendedOutcome(.05), bear: blendedOutcome(.25), base: blendedOutcome(.50), bull: blendedOutcome(.75), best: blendedOutcome(.95),
    average: clamp(recentWeight * recentGrowth + historicalWeight * (history.length >= 4 ? mean(history) : annualMedian) + longTermWeight * longTermGrowth, -.75, 1.25),
  };
  const annualRate = clamp(beforeRisk - riskDeduction, -.30, maxAllowableGrowth);
  const compoundedTotal = Math.pow(1 + Math.max(-.99, annualRate), years) - 1;
  const historicalCompoundedTotal = Math.pow(1 + Math.max(-.99, rawHistoricalCagr), years) - 1;
  return {
    annualRate, historicalGrowth, recentGrowth, longTermGrowth,
    historicalCagr: rawHistoricalCagr,
    compoundedTotal,
    historicalCompoundedTotal,
    recentWeight, historicalWeight, longTermWeight, riskDeduction,
    outcomes,
    source: history.length >= 4 ? `${years}-year periods from this holding` : `this holding’s yearly returns adjusted for ${years} years`,
    samples: history.length,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { positions?: PositionInput[] };
    const positions = (body.positions || []).filter((item) => /^[A-Z0-9.-]{1,12}$/.test(item.ticker) && Number.isFinite(item.quantity) && item.quantity > 0).slice(0, 40);
    if (!positions.length) return Response.json({ error: "No positive stock or ETF positions were found in the file." }, { status: 400 });

    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date(); startDate.setFullYear(startDate.getFullYear() - 31); startDate.setDate(startDate.getDate() - 45);
    const start = startDate.toISOString().slice(0, 10);
    const results = [];
    for (let index = 0; index < positions.length; index += 5) {
      const batch = positions.slice(index, index + 5);
      const resolved = await Promise.all(batch.map(async (position) => {
        try {
          const [data, context] = await Promise.all([marketDataProvider.getHistoricalPrices(position.ticker, start, end), getTickerContext(position.ticker)]);
          const latest = data.prices.at(-1)!;
          const oneYearStartTarget = Date.now() - 365.2425 * 86400000;
          const yearStart = data.prices.find((row) => new Date(`${row.date}T00:00:00Z`).getTime() >= oneYearStartTarget) || data.prices[0];
          const rolling = rollingYearReturns(data.prices);
          const oneYearReturn = returnPrice(latest) / returnPrice(yearStart) - 1;
          const volatility = annualVolatility(data.prices);
          const forecastByHorizon = Object.fromEntries(Array.from({ length: 50 }, (_, horizonIndex) => {
            const horizon = horizonIndex + 1;
            return [String(horizon), holdingForecast(data.prices, oneYearReturn, volatility, horizon)];
          }));
          const nextYearBase = forecastByHorizon["1"].annualRate;
          const histPeriods = periodReturns(data.prices);
          const elapsedYears = Math.max(1, (new Date(`${latest.date}T00:00:00Z`).getTime() - new Date(`${data.prices[0].date}T00:00:00Z`).getTime()) / (365.2425 * 86400000));
          const historicalCagr = Math.pow(returnPrice(latest) / returnPrice(data.prices[0]), 1 / elapsedYears) - 1;
          return {
            ticker: data.ticker, name: context.profileName || data.name, quantity: position.quantity, netInvested: Number(position.netInvested || 0), firstInvestmentDate: position.firstInvestmentDate || null, latestPrice: latest.close, priceDate: latest.date,
            marketValue: position.quantity * latest.close, oneYearReturn, volatility, maxDrawdown: maxDrawdown(data.prices), periodReturns: histPeriods,
            historicalCagr, fiveYearReturn: histPeriods["5"]?.total ?? null, tenYearReturn: histPeriods["10"]?.total ?? null,
            nextYear: { low: clamp(percentile(rolling, .25), -.8, 1.5), base: nextYearBase, high: clamp(percentile(rolling, .75), -.8, 1.5) }, forecastByHorizon,
            sector: context.sector, industry: context.industry, news: context.news, prices: data.prices, oneYearReturns: rolling,
          };
        } catch (error) { return { ticker: position.ticker, quantity: position.quantity, error: error instanceof Error ? error.message : "Data unavailable" }; }
      }));
      results.push(...resolved);
    }

    const valued = results.filter((item): item is Exclude<typeof item, { error: string }> => !("error" in item) && Number.isFinite(item.marketValue));
    const totalValue = valued.reduce((sum, item) => sum + item.marketValue, 0);
    if (!valued.length || !totalValue) return Response.json({ error: "Market data was unavailable for every holding in this file." }, { status: 422 });
    const withWeights = valued.map((item) => ({ ...item, weight: item.marketValue / totalValue })).sort((a, b) => b.marketValue - a.marketValue);
    const withEntryReturns = withWeights.map((item) => {
      if (!item.firstInvestmentDate) return { ...item, returnSinceFirstBuy: null, annualizedSinceFirstBuy: null };
      const firstPrice = item.prices.find((row) => row.date >= item.firstInvestmentDate!);
      const lastPrice = item.prices.at(-1);
      if (!firstPrice || !lastPrice) return { ...item, returnSinceFirstBuy: null, annualizedSinceFirstBuy: null };
      const elapsedYears = Math.max(1 / 365.2425, (new Date(`${lastPrice.date}T00:00:00Z`).getTime() - new Date(`${item.firstInvestmentDate}T00:00:00Z`).getTime()) / (365.2425 * 86400000));
      const total = returnPrice(lastPrice) / returnPrice(firstPrice) - 1;
      return { ...item, returnSinceFirstBuy: total, annualizedSinceFirstBuy: elapsedYears >= .5 ? Math.pow(Math.max(.01, 1 + total), 1 / elapsedYears) - 1 : null };
    });
    const portfolioVolatility = withWeights.reduce((sum, item) => sum + item.weight * item.volatility, 0);
    const largestWeight = withWeights[0]?.weight || 0;
    const concentrationIndex = withWeights.reduce((sum, item) => sum + item.weight ** 2, 0);
    const baseRiskAdjustment = clamp(.5 * portfolioVolatility ** 2 + Math.max(0, largestWeight - .25) * .08, 0, .10);
    const scenarioCurves = Object.fromEntries(Array.from({ length: 50 }, (_, index) => {
      const horizon = index + 1;
      const allocationWeightedRate = withEntryReturns.reduce((sum, item) => sum + item.weight * item.forecastByHorizon[String(horizon)].annualRate, 0);
      const riskAdjustment = baseRiskAdjustment / Math.sqrt(horizon);
      const planningRate = clamp(allocationWeightedRate - riskAdjustment, -.15, .35);
      return [String(horizon), makeScenarioCurve(withEntryReturns, horizon, allocationWeightedRate, riskAdjustment, planningRate)];
    }));

    const historicalReturns = PERIODS.map((years) => {
      const available = withEntryReturns.filter((item) => item.periodReturns[String(years)]);
      const coveredWeight = available.reduce((sum, item) => sum + item.weight, 0);
      if (!available.length || coveredWeight < .35) return { years, available: false, totalReturn: null, annualizedReturn: null, coverage: coveredWeight, hypotheticalValue: null };
      const totalReturn = available.reduce((sum, item) => sum + (item.weight / coveredWeight) * item.periodReturns[String(years)].total, 0);
      const annualizedReturn = Math.pow(Math.max(.01, 1 + totalReturn), 1 / years) - 1;
      return { years, available: true, totalReturn, annualizedReturn, coverage: coveredWeight, hypotheticalValue: totalValue * (1 + totalReturn) };
    });

    const sectors = Object.entries(withEntryReturns.reduce<Record<string, typeof withEntryReturns>>((map, item) => {
      (map[item.sector] ||= []).push(item); return map;
    }, {})).map(([sector, holdings]) => {
      const weight = holdings.reduce((sum, item) => sum + item.weight, 0);
      return { sector, weight, holdings: holdings.map((item) => ({ ticker: item.ticker, name: item.name, marketValue: item.marketValue, portfolioWeight: item.weight, sectorWeight: weight ? item.weight / weight : 0 })) };
    }).sort((a, b) => b.weight - a.weight);
    const knownSectorWeight = sectors.filter((item) => item.sector !== "Unclassified").reduce((sum, item) => sum + item.weight, 0);
    const effectiveHoldings = concentrationIndex ? 1 / concentrationIndex : 0;
    const sectorHhi = sectors.reduce((sum, item) => sum + item.weight ** 2, 0);
    const riskMath = { volatility: (portfolioVolatility / .5) * 45, largestHolding: largestWeight * 35, concentration: concentrationIndex * 55 };
    const riskScore = Math.round(clamp(riskMath.volatility + riskMath.largestHolding + riskMath.concentration, 0, 100));
    const diversificationMath = { concentrationSpread: (1 - concentrationIndex) * 52, effectiveHoldings: Math.min(1, effectiveHoldings / 10) * 28, sectorSpread: (1 - sectorHhi) * 20 };
    const diversificationScore = Math.round(clamp(diversificationMath.concentrationSpread + diversificationMath.effectiveHoldings + diversificationMath.sectorSpread, 0, 100));
    const curve1 = scenarioCurves["1"];
    const downsideMath = { floor: .05, bearDownside: Math.max(0, -curve1.bear), volatilityAndConcentration: portfolioVolatility * .72 + largestWeight * .08, cap: .65 };
    const realisticDownside = clamp(Math.max(downsideMath.floor, downsideMath.bearDownside, downsideMath.volatilityAndConcentration), .05, downsideMath.cap);
    const recommended = riskScore >= 65 || largestWeight >= .3 ? "dailyDca" : riskScore <= 35 && diversificationScore >= 65 ? "alwaysIn" : "blend";
    const strategy = {
      recommended,
      fit: recommended === "dailyDca" ? "Daily DCA may fit best" : recommended === "alwaysIn" ? "Always-In may fit best" : "A 50/50 blend may fit best",
      explanation: recommended === "dailyDca"
        ? `A ${riskScore}/100 risk score and ${Math.round(largestWeight * 100)}% largest position make entry timing more important. Smaller scheduled purchases reduce single-day timing risk.`
        : recommended === "alwaysIn"
          ? `A ${riskScore}/100 risk score and ${diversificationScore}/100 diversification score make the portfolio less dependent on one holding. Investing sooner maximizes time in the market, though losses are still possible.`
          : `The portfolio sits between the two extremes at ${riskScore}/100 risk. Investing half now and phasing in half keeps meaningful market exposure while retaining cash for volatility.`,
    };
    const news = withWeights.flatMap((item) => item.news).filter((item, index, all) => item.url && all.findIndex((other) => other.url === item.url) === index).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 14);
    const newsByHolding = withEntryReturns.map((item) => ({
      ticker: item.ticker, name: item.name, sector: item.sector, weight: item.weight,
      stories: item.news.filter((story, index, all) => story.url && all.findIndex((other) => other.url === story.url) === index).sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt))).slice(0, 4),
    })).filter((group) => group.stories.length);
    const moodScore = news.reduce((sum, item) => sum + (item.sentiment === "positive" ? 1 : item.sentiment === "negative" ? -1 : 0), 0);

    const datedPositions = withEntryReturns.filter((item) => item.returnSinceFirstBuy != null);
    const annualizedPositions = withEntryReturns.filter((item) => item.annualizedSinceFirstBuy != null);
    const dateCoverage = datedPositions.reduce((sum, item) => sum + item.weight, 0);
    const annualizedCoverage = annualizedPositions.reduce((sum, item) => sum + item.weight, 0);
    const firstInvestmentDate = datedPositions.map((item) => item.firstInvestmentDate!).sort()[0] || null;
    const timeline = {
      firstInvestmentDate,
      dateCoverage,
      weightedReturnSinceFirstBuy: dateCoverage ? datedPositions.reduce((sum, item) => sum + (item.weight / dateCoverage) * item.returnSinceFirstBuy!, 0) : null,
      weightedAnnualizedSinceFirstBuy: annualizedCoverage ? annualizedPositions.reduce((sum, item) => sum + (item.weight / annualizedCoverage) * item.annualizedSinceFirstBuy!, 0) : null,
      annualizedCoverage,
    };
    const investedPositions = withEntryReturns.filter((item) => item.netInvested > 0);
    const netInvested = investedPositions.reduce((sum, item) => sum + item.netInvested, 0);
    const investedValue = investedPositions.reduce((sum, item) => sum + item.marketValue, 0);
    const investedCoverage = investedPositions.reduce((sum, item) => sum + item.weight, 0);
    Object.assign(timeline, {
      netInvested: netInvested || null,
      investedValue: netInvested ? investedValue : null,
      investedCoverage,
      currentGain: netInvested ? investedValue - netInvested : null,
      currentReturnOnCashInvested: netInvested ? investedValue / netInvested - 1 : null,
    });
    const privatePositionKeys = new Set(["prices", "oneYearReturns", "news"]);
    const publicPositions = withEntryReturns.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => !privatePositionKeys.has(key))));
    return Response.json({
      asOf: end, totalValue, positions: publicPositions, unavailable: results.filter((item) => "error" in item), scenarioCurves, historicalReturns,
      portfolioVolatility, largestWeight, concentrationIndex, sectors, timeline,
      risk: { score: riskScore, label: riskScore >= 70 ? "High" : riskScore >= 45 ? "Moderate" : "Lower", realisticDownside, largestHistoricalHoldingDrawdown: Math.abs(withEntryReturns.reduce((sum, item) => sum + item.weight * item.maxDrawdown, 0)), math: { ...riskMath, downside: downsideMath } },
      diversification: { score: diversificationScore, label: diversificationScore >= 75 ? "Broad" : diversificationScore >= 50 ? "Moderate" : "Concentrated", effectiveHoldings, knownSectorWeight, sectorCount: sectors.filter((item) => item.sector !== "Unclassified").length, math: diversificationMath },
      news, newsByHolding, marketMood: moodScore >= 2 ? "More positive headlines" : moodScore <= -2 ? "More cautious headlines" : "Mixed headlines", strategy,
      methodology: "Every displayed rate starts with each holding’s own adjusted-price history and current one-year return. The site estimates that holding for the selected horizon, multiplies it by its current share of the uploaded portfolio, and adds the contributions. When a holding does not have a full 40- or 50-year record, its own observed yearly range is narrowed for the longer horizon; no generic market-return assumption is substituted. Forecasts are data-based estimates, not promises.",
    }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "The portfolio could not be analyzed." }, { status: 500 });
  }
}
