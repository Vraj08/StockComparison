import test from "node:test";
import assert from "node:assert/strict";
import { calculateDipBuyStrategy, calculateMonth } from "../lib/dca-core.mjs";
const rows = (values) => values.map((close, i) => ({ date: `2026-03-${String(i + 2).padStart(2, "0")}`, open: close, high: close, low: close, close, adjustedClose: close, volume: 1 }));
for (const days of [19, 20, 21, 22, 23]) test(`${days}-trading-day month preserves the first-day budget`, () => { const result = calculateMonth(rows(Array(days).fill(100))); assert.equal(result.tradingDays, days); assert.ok(Math.abs(result.dailyInvestment * days - 100) < 1e-10); assert.ok(Math.abs(result.dcaShares - 1) < 1e-10); });
test("rising prices favor the first-day share count", () => assert.ok(calculateMonth(rows([100, 110, 120])).dcaShares < 1));
test("falling prices produce more than one DCA share", () => assert.ok(calculateMonth(rows([100, 90, 80])).dcaShares > 1));
test("DCA cost is dollars divided by shares, not arithmetic price average", () => { const result = calculateMonth(rows([100, 50])); assert.equal(result.dcaShares, 1.5); assert.ok(Math.abs(result.dcaAverageCost - 66.6666666667) < 1e-8); assert.equal(result.averageMarketPrice, 75); });
test("invalid missing price is rejected rather than invented", () => assert.throws(() => calculateMonth(rows([100, 0]))));
test("volatile prices retain exact dollar-weighted cost basis", () => { const result = calculateMonth(rows([100, 72, 130, 83, 115])); assert.ok(Math.abs(result.dcaAverageCost - result.monthlyBudget / result.dcaShares) < 1e-12); });
test("short-history ETF month calculates only returned trading days", () => assert.equal(calculateMonth(rows([42, 43, 41])).tradingDays, 3));
test("split-adjusted input stays internally consistent", () => { const result = calculateMonth(rows([50, 51, 52, 49])); assert.ok(result.dcaShares > 0); assert.ok(Number.isFinite(result.dcaEndValue)); });
test("custom monthly budget is used for both timing methods", () => { const result = calculateMonth(rows([100, 110, 120]), "close", 500); assert.equal(result.monthlyBudget, 500); assert.equal(result.lumpShares, 5); assert.equal(result.dailyInvestment, 500 / 3); assert.ok(result.dcaShares < result.lumpShares); });
test("invalid custom budget falls back to one first-day share", () => { const result = calculateMonth(rows([80, 82]), "close", 0); assert.equal(result.monthlyBudget, 80); assert.equal(result.lumpShares, 1); });
test("weekly DCA invests the full monthly budget across one purchase per week", () => { const result = calculateMonth(rows(Array(20).fill(100)), "close", 500); assert.ok(result.weeklyPurchaseCount >= 3); assert.ok(Math.abs(result.weeklyInvestment * result.weeklyPurchaseCount - 500) < 1e-10); assert.ok(Math.abs(result.weeklyShares - 5) < 1e-10); });
test("custom dip percentage changes whether reserve cash is deployed", () => { const prices = rows([100, 94, 96]); const groups = [{ month: "2026-03", prices }]; assert.equal(calculateDipBuyStrategy(groups, "close", 100, 5).dipMonthCount, 1); assert.equal(calculateDipBuyStrategy(groups, "close", 100, 10).dipMonthCount, 0); });

const datedRows = (dates) => dates.map((date, i) => ({ date, open: 100 + i * 10, close: 100 + i * 20, adjustedClose: 50 + i * 10 }));
test("monthly purchase on the fifth uses its price and preserves equal budgets", () => {
  const prices = datedRows(["2026-03-02", "2026-03-05", "2026-03-06"]);
  const result = calculateMonth(prices, "close", 600, 5);
  assert.equal(result.purchaseDate, "2026-03-05");
  assert.equal(result.purchasePrice, 120);
  assert.equal(result.lumpShares, 5);
  assert.equal(result.lumpEndValue, 700);
  assert.equal(result.lumpGain, 100);
  assert.equal(result.monthlyBudget, 600);
  assert.equal(result.dcaShares, calculateMonth(prices, "close", 600).dcaShares);
  assert.equal(result.weeklyShares, calculateMonth(prices, "close", 600).weeklyShares);
});
test("non-trading purchase dates advance to the next available date", () => {
  assert.equal(calculateMonth(datedRows(["2026-09-04", "2026-09-08", "2026-09-09"]), "close", 100, 5).purchaseDate, "2026-09-08");
});
test("day 31 falls back to the last available February trading day", () => {
  assert.equal(calculateMonth(datedRows(["2026-02-02", "2026-02-27"]), "close", 100, 31).purchaseDate, "2026-02-27");
  assert.equal(calculateMonth(datedRows(["2024-02-01", "2024-02-29"]), "close", 100, 31).purchaseDate, "2024-02-29");
});
test("partial months stay in the research range and input is sorted", () => {
  const prices = datedRows(["2026-03-20", "2026-03-12"]);
  assert.equal(calculateMonth(prices, "close", 100, 5).purchaseDate, "2026-03-12");
  assert.equal(calculateMonth(prices, "close", 100, 25).purchaseDate, "2026-03-20");
});
test("selected monthly day respects price field and retains the default budget", () => {
  const result = calculateMonth(datedRows(["2026-03-02", "2026-03-05"]), "adjustedClose", undefined, 5);
  assert.equal(result.monthlyBudget, 50);
  assert.equal(result.purchasePrice, 60);
  assert.equal(result.lumpShares, 50 / 60);
});
test("invalid monthly purchase days are rejected", () => {
  for (const day of [0, 32, 5.5, NaN]) assert.throws(() => calculateMonth(rows([100]), "close", 100, day), /Purchase day/);
});
