/** Fixed annual assumptions; withdrawals at the start of each month, then growth. */
export function calculateWithdrawalPlan({ balance, monthlySpending, inflation, annualReturn, currentAge, startAge, endAge }) {
  if (![balance, monthlySpending, inflation, annualReturn, currentAge, startAge, endAge].every(Number.isFinite) || balance < 0 || monthlySpending < 0 || inflation < 0 || inflation > 1 || annualReturn <= -1 || annualReturn > 1 || ![currentAge, startAge, endAge].every(Number.isInteger) || currentAge < 0 || startAge < currentAge || endAge <= startAge || endAge > 120) throw new RangeError("Invalid withdrawal assumptions.");
  const monthlyGrowth = (1 + annualReturn) ** (1 / 12);
  const firstMonthly = monthlySpending * (1 + inflation) ** (startAge - currentAge);
  let remaining = balance, requiredBalance = 0, totalPlanned = 0, totalWithdrawn = 0, totalShortfall = 0;
  let depletionMonth = balance === 0 && firstMonthly > 0 ? 0 : null;
  const rows = [];
  for (let year = 0; year < endAge - startAge; year++) {
    const monthly = firstMonthly * (1 + inflation) ** year;
    const openingBalance = remaining;
    let withdrawn = 0, growth = 0, shortfall = 0;
    for (let month = 0; month < 12; month++) {
      const elapsed = year * 12 + month;
      requiredBalance += monthly / monthlyGrowth ** elapsed;
      const paid = Math.min(remaining, monthly);
      remaining -= paid;
      withdrawn += paid;
      shortfall += monthly - paid;
      if (depletionMonth === null && remaining <= 1e-7 && monthly > 0) depletionMonth = elapsed;
      const gain = remaining * (monthlyGrowth - 1);
      remaining += gain;
      growth += gain;
    }
    totalPlanned += monthly * 12;
    totalWithdrawn += withdrawn;
    totalShortfall += shortfall;
    rows.push({ age: startAge + year, year: year + 1, monthly, annual: monthly * 12, openingBalance, withdrawn, growth, shortfall, closingBalance: remaining });
  }
  return { rows, firstMonthly, nextMonthly: firstMonthly * (1 + inflation), requiredBalance, additionalNeeded: Math.max(0, requiredBalance - balance), endingBalance: remaining, totalPlanned, totalWithdrawn, totalShortfall, depletionMonth };
}
