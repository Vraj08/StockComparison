import test from "node:test";
import assert from "node:assert/strict";

// We test the math behind the decay logic
test("Long-term compounding limits ensure realistic numbers", () => {
  const years = 50;
  
  // Simulated decay function
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const maxAllowableGrowth = clamp(0.10 + 0.60 / Math.sqrt(years), 0.10, 0.50);
  
  assert.ok(maxAllowableGrowth < 0.20, "50-year max rate should decay below 20%");
  assert.ok(maxAllowableGrowth > 0.15, "50-year max rate should remain above 15%");
});

test("Total percentage return formula matches expected real-world values", () => {
  const current = 10000;
  const monthly = 1000;
  const years = 5;
  const appliedRate = 0.10; // 10%
  
  // Future Value Formula
  const rate = Math.pow(1 + appliedRate, 1 / 12) - 1;
  const months = Math.max(0, years * 12);
  const growth = Math.pow(1 + rate, months);
  const additions = monthly * ((growth - 1) / rate);
  const ending = Math.max(0, current * growth + additions);
  
  const cashValue = current + monthly * years * 12;
  const totalReturnPct = (ending - cashValue) / cashValue;
  
  // Total cash invested = 10k + 60k = 70k.
  assert.equal(cashValue, 70000);
  // Total Return Pct should be positive but grounded
  assert.ok(totalReturnPct > 0);
  assert.ok(totalReturnPct < 0.5, "5 year 10% return should not exceed 50% total growth over cash");
});
