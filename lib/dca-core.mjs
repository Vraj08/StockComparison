/** Resolve the price for a row, falling back to 'close' if the requested field is null/zero.
 *  This is important for 'adjustedClose' which can be null on older data rows. */
function resolvePrice(row, priceField) {
  const p = Number(row[priceField]);
  if (p > 0) return p;
  const fallback = Number(row["close"]);
  if (fallback > 0) return fallback;
  throw new Error(`Invalid purchase price on ${row.date}.`);
}

export function calculateMonth(prices, priceField = "close", monthlyBudgetOverride) {
  if (!Array.isArray(prices) || prices.length === 0) throw new Error("A month requires at least one trading day.");
  const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  const firstPrice = resolvePrice(ordered[0], priceField);
  const customBudget = Number(monthlyBudgetOverride);
  const monthlyBudget = customBudget > 0 ? customBudget : firstPrice;
  const dailyInvestment = monthlyBudget / ordered.length;
  let cumulativeInvestment = 0, cumulativeShares = 0;
  const daily = ordered.map((row) => {
    const priceUsed = resolvePrice(row, priceField);
    const sharesPurchased = dailyInvestment / priceUsed;
    cumulativeInvestment += dailyInvestment;
    cumulativeShares += sharesPurchased;
    return { ...row, priceUsed, dailyInvestment, sharesPurchased, cumulativeInvestment, cumulativeShares, runningAverageCost: cumulativeInvestment / cumulativeShares };
  });
  const weeklyPurchaseDays = [];
  const seenWeeks = new Set();
  for (const row of ordered) {
    const date = new Date(`${row.date}T00:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    const weekKey = date.toISOString().slice(0, 10);
    if (!seenWeeks.has(weekKey)) { seenWeeks.add(weekKey); weeklyPurchaseDays.push(row); }
  }
  const weeklyInvestment = monthlyBudget / weeklyPurchaseDays.length;
  let weeklyCumulativeInvestment = 0, weeklyCumulativeShares = 0;
  const weekly = weeklyPurchaseDays.map((row) => {
    const priceUsed = resolvePrice(row, priceField);
    const sharesPurchased = weeklyInvestment / priceUsed;
    weeklyCumulativeInvestment += weeklyInvestment;
    weeklyCumulativeShares += sharesPurchased;
    return { ...row, priceUsed, weeklyInvestment, sharesPurchased, cumulativeInvestment: weeklyCumulativeInvestment, cumulativeShares: weeklyCumulativeShares, runningAverageCost: weeklyCumulativeInvestment / weeklyCumulativeShares };
  });
  const lastPrice = resolvePrice(ordered.at(-1), priceField);
  const dcaAverageCost = monthlyBudget / cumulativeShares;
  const dcaEndValue = cumulativeShares * lastPrice;
  const lumpShares = monthlyBudget / firstPrice;
  const lumpEndValue = lumpShares * lastPrice;
  const weeklyAverageCost = monthlyBudget / weeklyCumulativeShares;
  const weeklyEndValue = weeklyCumulativeShares * lastPrice;
  return { firstDate: ordered[0].date, lastDate: ordered.at(-1).date, firstPrice, lastPrice, tradingDays: ordered.length, monthlyBudget, dailyInvestment, dcaShares: cumulativeShares, lumpShares, dcaAverageCost, differenceShares: cumulativeShares - lumpShares, dcaEndValue, lumpEndValue, dcaGain: dcaEndValue - monthlyBudget, lumpGain: lumpEndValue - monthlyBudget, weeklyInvestment, weeklyPurchaseCount: weeklyPurchaseDays.length, weeklyShares: weeklyCumulativeShares, weeklyAverageCost, weeklyDifferenceShares: weeklyCumulativeShares - lumpShares, weeklyEndValue, weeklyGain: weeklyEndValue - monthlyBudget, averageMarketPrice: ordered.reduce((sum, row) => sum + resolvePrice(row, priceField), 0) / ordered.length, daily, weekly };
}

/**
 * Dip-Wait 50/50 Strategy (processes all months together because the reserve rolls across months).
 *
 * Rules:
 *  - Every month: 50% of monthlyBudget is invested on the first trading day.
 *  - The other 50% accumulates in a cash reserve (held in HYSA or cash equivalent).
 *  - When a month's price drops ≥5% from that month's first-day price (at any point during the month),
 *    the ENTIRE accumulated reserve is deployed at that dip price.
 *  - After deploying, the reserve resets to 0 and starts accumulating again.
 *
 * @param {Array<{month: string, prices: import('./market-data').MarketPrice[]}>} monthGroups
 * @param {string} priceField
 * @param {number} monthlyBudget
 * @returns {DipBuyStrategyResult}
 */
export function calculateDipBuyStrategy(monthGroups, priceField = "close", monthlyBudget = 100, dipPercentage = 5) {
  let reserve = 0;
  let totalInvested = 0;
  let totalShares = 0;
  const monthResults = [];

  for (const { month, prices } of monthGroups) {
    const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date));
    const firstPrice = resolvePrice(ordered[0], priceField);
    const lastPrice = resolvePrice(ordered.at(-1), priceField);
    const halfBudget = monthlyBudget * 0.5;
    const safeDipPercentage = Math.min(95, Math.max(0.1, Number(dipPercentage) || 5));
    const dipThreshold = firstPrice * (1 - safeDipPercentage / 100);

    // Always invest 50% on first day
    const firstDayShares = halfBudget / firstPrice;
    totalInvested += halfBudget;
    totalShares += firstDayShares;

    // Accumulate the other 50% into reserve (waiting for a dip)
    reserve += halfBudget;

    // Look for the first day in this month where price drops ≥5%
    let dipDate = null;
    let dipPrice = null;
    let dipShares = 0;
    let dipAmountDeployed = 0;

    for (let i = 1; i < ordered.length; i++) {
      const dayPrice = resolvePrice(ordered[i], priceField);
      if (dayPrice <= dipThreshold) {
        dipDate = ordered[i].date;
        dipPrice = dayPrice;
        dipAmountDeployed = reserve;
        dipShares = reserve / dayPrice;
        // ✅ FIX: the deployed reserve is real money entering the market — count it
        totalInvested += dipAmountDeployed;
        totalShares += dipShares;
        reserve = 0;
        break;
      }
    }

    const endValue = totalShares * lastPrice;

    monthResults.push({
      month,
      firstDate: ordered[0].date,
      lastDate: ordered.at(-1).date,
      firstPrice,
      lastPrice,
      halfBudgetInvested: halfBudget,
      reserveAdded: halfBudget,
      reserveAfterMonth: reserve,
      dipOccurred: dipDate !== null,
      dipDate,
      dipPrice,
      dipAmountDeployed,
      dipShares,
      firstDayShares,
      totalInvestedSoFar: totalInvested,
      totalSharesSoFar: totalShares,
      endValueSoFar: endValue,
    });
  }

  const lastMonth = monthResults.at(-1);
  // totalInvested = all day-1 buys + all dip deployments (actual cash into market)
  // totalReserveUndeployed = cash still waiting, never put into market
  // totalCashCommitted = totalInvested + reserve = full budget set aside across all months
  return {
    monthResults,
    totalInvested,
    totalReserveUndeployed: reserve,
    totalCashCommitted: totalInvested + reserve,
    totalShares,
    endValue: lastMonth ? totalShares * lastMonth.lastPrice : 0,
    dipMonthCount: monthResults.filter((m) => m.dipOccurred).length,
  };
}
