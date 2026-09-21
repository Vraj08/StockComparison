export function calculateMonth(prices, priceField = "close") {
  if (!Array.isArray(prices) || prices.length === 0) throw new Error("A month requires at least one trading day.");
  const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const firstPrice = Number(ordered[0][priceField]);
  const monthlyBudget = firstPrice;
  const dailyInvestment = monthlyBudget / ordered.length;
  let cumulativeInvestment = 0, cumulativeShares = 0;
  const daily = ordered.map((row) => {
    const priceUsed = Number(row[priceField]);
    if (!(priceUsed > 0)) throw new Error(`Invalid purchase price on ${row.date}.`);
    const sharesPurchased = dailyInvestment / priceUsed;
    cumulativeInvestment += dailyInvestment;
    cumulativeShares += sharesPurchased;
    return { ...row, priceUsed, dailyInvestment, sharesPurchased, cumulativeInvestment, cumulativeShares, runningAverageCost: cumulativeInvestment / cumulativeShares };
  });
  const lastPrice = Number(ordered.at(-1)[priceField]);
  const dcaAverageCost = monthlyBudget / cumulativeShares;
  const dcaEndValue = cumulativeShares * lastPrice;
  return { firstDate: ordered[0].date, lastDate: ordered.at(-1).date, firstPrice, lastPrice, tradingDays: ordered.length, monthlyBudget, dailyInvestment, dcaShares: cumulativeShares, dcaAverageCost, differenceShares: cumulativeShares - 1, dcaEndValue, lumpEndValue: lastPrice, dcaGain: dcaEndValue - monthlyBudget, lumpGain: lastPrice - monthlyBudget, averageMarketPrice: ordered.reduce((sum, row) => sum + Number(row[priceField]), 0) / ordered.length, daily };
}
