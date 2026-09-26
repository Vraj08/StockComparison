/**
 * Resolve the price for a given data row based on the requested price field.
 * This function handles cases where the requested field might be zero or null,
 * falling back to the 'close' price if necessary.
 * This is particularly important for 'adjustedClose' which can be null on older data rows.
 *
 * @param {Object} row - A single day's trading data row containing prices.
 * @param {string} priceField - The name of the price property to extract (e.g., 'close', 'open', 'adjustedClose').
 * @returns {number} The resolved price as a positive number.
 * @throws {Error} If neither the requested price nor the fallback 'close' price is valid.
 */
function resolvePrice(row, priceField) {
  // Attempt to parse the requested price field as a Number.
  const p = Number(row[priceField]);
  // If the value is greater than zero, it's valid, return it.
  if (p > 0) return p;
  
  // If the requested price is invalid (e.g., null, zero, NaN), fallback to the 'close' price.
  const fallback = Number(row["close"]);
  // If the fallback 'close' price is valid, return it.
  if (fallback > 0) return fallback;
  
  // If neither price is valid, throw an error indicating a data integrity issue.
  throw new Error(`Invalid purchase price on ${row.date}.`);
}

/**
 * Calculates Dollar Cost Averaging (DCA), Lump Sum, and Weekly purchase strategies for a single month.
 *
 * @param {Array<Object>} prices - An array of daily trading data objects for the month.
 * @param {string} [priceField="close"] - The field in the price objects to use for calculations.
 * @param {number|string} monthlyBudgetOverride - The total budget to invest for the month.
 * @param {number} [purchaseDay=1] - The preferred day of the month to execute the lump sum or initial purchase.
 * @returns {Object} An object containing detailed metrics and daily/weekly breakdown for the month.
 * @throws {Error} If prices array is empty or if purchaseDay is invalid.
 */
export function calculateMonth(prices, priceField = "close", monthlyBudgetOverride, purchaseDay = 1) {
  // Validate that we have at least one trading day of data.
  if (!Array.isArray(prices) || prices.length === 0) throw new Error("A month requires at least one trading day.");
  // Validate the purchase day parameter.
  if (!Number.isInteger(purchaseDay) || purchaseDay < 1 || purchaseDay > 31) throw new Error("Purchase day must be a whole number from 1 to 31.");
  
  // Clone and sort the prices chronologically by date to ensure proper ordering.
  const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  
  // Get the price on the first trading day of the provided data.
  const firstPrice = resolvePrice(ordered[0], priceField);
  
  // Find the row that matches or immediately follows the requested purchase day in the month.
  // Keep purchases inside the available month, including truncated research ranges.
  const purchaseRow = ordered.find(row => Number(row.date.slice(8, 10)) >= purchaseDay) ?? ordered.at(-1);
  // Resolve the price for the targeted lump sum purchase day.
  const purchasePrice = resolvePrice(purchaseRow, priceField);
  
  // Parse the budget override provided by the user.
  const customBudget = Number(monthlyBudgetOverride);
  // If the budget is missing or invalid, fallback to the cost of exactly one share at firstPrice.
  const monthlyBudget = customBudget > 0 ? customBudget : firstPrice;
  
  // Calculate how much money is invested each day under daily DCA.
  const dailyInvestment = monthlyBudget / ordered.length;
  
  // Initialize accumulators for the daily DCA strategy.
  let cumulativeInvestment = 0;
  let cumulativeShares = 0;
  
  // Process the daily DCA strategy, iterating over every trading day.
  const daily = ordered.map((row) => {
    // Resolve the trading price for this specific day.
    const priceUsed = resolvePrice(row, priceField);
    // Calculate how many shares we can buy with today's daily investment.
    const sharesPurchased = dailyInvestment / priceUsed;
    
    // Accumulate total money invested so far.
    cumulativeInvestment += dailyInvestment;
    // Accumulate total shares owned so far.
    cumulativeShares += sharesPurchased;
    
    // Return a detailed record for this day's transaction.
    return { 
      ...row, 
      priceUsed, 
      dailyInvestment, 
      sharesPurchased, 
      cumulativeInvestment, 
      cumulativeShares, 
      runningAverageCost: cumulativeInvestment / cumulativeShares 
    };
  });
  
  // Setup data structures to identify the first trading day of each week.
  const weeklyPurchaseDays = [];
  const seenWeeks = new Set();
  
  // Iterate over ordered days to group by week.
  for (const row of ordered) {
    // Parse the current row's date (assuming UTC to avoid timezone shifts).
    const date = new Date(`${row.date}T00:00:00Z`);
    // Find the day of the week, mapping Sunday (0) to 7 for ISO compliance.
    const day = date.getUTCDay() || 7;
    
    // Adjust the date back to the start of its ISO week (Monday).
    date.setUTCDate(date.getUTCDate() - day + 1);
    // Create a unique key for the week based on its Monday start date.
    const weekKey = date.toISOString().slice(0, 10);
    
    // If we haven't seen this week yet, add the current row as the weekly purchase day.
    if (!seenWeeks.has(weekKey)) { 
      seenWeeks.add(weekKey); 
      weeklyPurchaseDays.push(row); 
    }
  }
  
  // Calculate how much to invest on each weekly purchase day.
  const weeklyInvestment = monthlyBudget / weeklyPurchaseDays.length;
  
  // Initialize accumulators for the weekly strategy.
  let weeklyCumulativeInvestment = 0;
  let weeklyCumulativeShares = 0;
  
  // Process the weekly strategy, iterating over the selected weekly purchase days.
  const weekly = weeklyPurchaseDays.map((row) => {
    // Resolve the trading price for this specific week's purchase day.
    const priceUsed = resolvePrice(row, priceField);
    // Calculate how many shares we can buy with this week's investment.
    const sharesPurchased = weeklyInvestment / priceUsed;
    
    // Accumulate total money invested so far under weekly DCA.
    weeklyCumulativeInvestment += weeklyInvestment;
    // Accumulate total shares owned so far under weekly DCA.
    weeklyCumulativeShares += sharesPurchased;
    
    // Return a detailed record for this week's transaction.
    return { 
      ...row, 
      priceUsed, 
      weeklyInvestment, 
      sharesPurchased, 
      cumulativeInvestment: weeklyCumulativeInvestment, 
      cumulativeShares: weeklyCumulativeShares, 
      runningAverageCost: weeklyCumulativeInvestment / weeklyCumulativeShares 
    };
  });
  
  // Retrieve the price on the very last trading day of the month for end value calculations.
  const lastPrice = resolvePrice(ordered.at(-1), priceField);
  
  // Calculate average cost per share for daily DCA.
  const dcaAverageCost = monthlyBudget / cumulativeShares;
  // Calculate final portfolio value for daily DCA.
  const dcaEndValue = cumulativeShares * lastPrice;
  
  // Calculate total shares acquired under the lump sum (single purchase) strategy.
  const lumpShares = monthlyBudget / purchasePrice;
  // Calculate final portfolio value for lump sum strategy.
  const lumpEndValue = lumpShares * lastPrice;
  
  // Calculate average cost per share for weekly DCA.
  const weeklyAverageCost = monthlyBudget / weeklyCumulativeShares;
  // Calculate final portfolio value for weekly DCA.
  const weeklyEndValue = weeklyCumulativeShares * lastPrice;
  
  // Return an aggregate object with all computed metrics and the daily/weekly history.
  return { 
    purchaseDay, 
    purchaseDate: purchaseRow.date, 
    purchasePrice, 
    firstDate: ordered[0].date, 
    lastDate: ordered.at(-1).date, 
    firstPrice, 
    lastPrice, 
    tradingDays: ordered.length, 
    monthlyBudget, 
    dailyInvestment, 
    
    // Daily DCA metrics
    dcaShares: cumulativeShares, 
    lumpShares, 
    dcaAverageCost, 
    differenceShares: cumulativeShares - lumpShares, 
    dcaEndValue, 
    lumpEndValue, 
    dcaGain: dcaEndValue - monthlyBudget, 
    lumpGain: lumpEndValue - monthlyBudget, 
    
    // Weekly metrics
    weeklyInvestment, 
    weeklyPurchaseCount: weeklyPurchaseDays.length, 
    weeklyShares: weeklyCumulativeShares, 
    weeklyAverageCost, 
    weeklyDifferenceShares: weeklyCumulativeShares - lumpShares, 
    weeklyEndValue, 
    weeklyGain: weeklyEndValue - monthlyBudget, 
    
    // General metrics
    averageMarketPrice: ordered.reduce((sum, row) => sum + resolvePrice(row, priceField), 0) / ordered.length, 
    
    // Full arrays
    daily, 
    weekly 
  };
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
 * @param {Array<{month: string, prices: import('./market-data').MarketPrice[]}>} monthGroups - Grouped historical prices by month.
 * @param {string} priceField - The price field to track.
 * @param {number} monthlyBudget - Total budget per month.
 * @param {number} dipPercentage - Percentage drop required to trigger reserve deployment.
 * @returns {DipBuyStrategyResult} Strategy results including total shares and final values.
 */
export function calculateDipBuyStrategy(monthGroups, priceField = "close", monthlyBudget = 100, dipPercentage = 5) {
  // Track accumulated cash reserve from undeployed halves of previous budgets.
  let reserve = 0;
  // Track total real money that has been actually converted to shares.
  let totalInvested = 0;
  // Track the total number of shares owned in the portfolio.
  let totalShares = 0;
  // Store the results for each month processed.
  const monthResults = [];

  // Iterate over each provided month group chronologically.
  for (const { month, prices } of monthGroups) {
    // Sort the month's prices chronologically.
    const ordered = [...prices].sort((a, b) => a.date.localeCompare(b.date));
    
    // Identify the price on the first trading day of the month.
    const firstPrice = resolvePrice(ordered[0], priceField);
    // Identify the price on the last trading day of the month for end-of-month valuation.
    const lastPrice = resolvePrice(ordered.at(-1), priceField);
    
    // Calculate the 50% split of the monthly budget.
    const halfBudget = monthlyBudget * 0.5;
    
    // Ensure the dip percentage is within safe bounds (between 0.1% and 95%).
    const safeDipPercentage = Math.min(95, Math.max(0.1, Number(dipPercentage) || 5));
    // Calculate the absolute price threshold that triggers a dip buy this month.
    const dipThreshold = firstPrice * (1 - safeDipPercentage / 100);

    // ACTION: Always invest 50% on the first trading day of the month.
    const firstDayShares = halfBudget / firstPrice;
    
    // Update total invested with the day 1 purchase.
    totalInvested += halfBudget;
    // Add newly purchased shares to the total share count.
    totalShares += firstDayShares;

    // Accumulate the remaining 50% into the cash reserve, waiting for a dip.
    reserve += halfBudget;

    // Track whether a dip occurred and its details during this month.
    let dipDate = null;
    let dipPrice = null;
    let dipShares = 0;
    let dipAmountDeployed = 0;

    // Scan through the remaining days of the month to check for a dip.
    for (let i = 1; i < ordered.length; i++) {
      // Resolve the price for the current day.
      const dayPrice = resolvePrice(ordered[i], priceField);
      
      // If the current price falls to or below the dip threshold:
      if (dayPrice <= dipThreshold) {
        // Record the date and price of the dip.
        dipDate = ordered[i].date;
        dipPrice = dayPrice;
        
        // Capture the amount of money deployed (the entire reserve).
        dipAmountDeployed = reserve;
        // Calculate how many shares this reserve can buy at the dip price.
        dipShares = reserve / dayPrice;
        
        // Count the deployed reserve as real money entering the market.
        totalInvested += dipAmountDeployed;
        // Add the newly purchased dip shares to the total share count.
        totalShares += dipShares;
        
        // Reset the reserve to 0 since all cash has been deployed.
        reserve = 0;
        
        // Stop scanning this month, as the reserve has been fully deployed.
        break;
      }
    }

    // Calculate the portfolio's end value for the current month.
    const endValue = totalShares * lastPrice;

    // Save the detailed breakdown for this month.
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

  // Get a reference to the last month processed for final aggregations.
  const lastMonth = monthResults.at(-1);
  
  // Return the aggregated totals across all months processed.
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
