import test from "node:test";
import assert from "node:assert/strict";
import { calculateWithdrawalPlan } from "../lib/withdrawal-plan.mjs";
const base = { balance: 10000000, monthlySpending: 10000, inflation: .04, annualReturn: 0, currentAge: 24, startAge: 55, endAge: 75 };
const close = (a, b) => assert.ok(Math.abs(a - b) < Math.max(.00001, Math.abs(b) * 1e-10), `${a} != ${b}`);
test("Inflates today's spending before retirement and again each withdrawal year", () => {
  const p = calculateWithdrawalPlan(base);
  close(p.firstMonthly, 10000 * 1.04 ** 31);
  close(p.rows[1].monthly, p.firstMonthly * 1.04);
  assert.equal(p.rows.length, 20);
  assert.equal(p.rows.at(-1).age, 74);
  close(p.requiredBalance, p.firstMonthly * 12 * (1.04 ** 20 - 1) / .04);
});
test("Exhaustion pays only available money and records subsequent shortfalls", () => {
  const p = calculateWithdrawalPlan({ ...base, balance: 25000, monthlySpending: 10000, currentAge: 55, endAge: 56 });
  assert.equal(p.depletionMonth, 2);
  assert.equal(p.totalWithdrawn, 25000);
  assert.equal(p.totalShortfall, 95000);
  assert.equal(p.endingBalance, 0);
});
test("Required capital funds the period with monthly returns and start-of-month payments", () => {
  for (const annualReturn of [0, .05, -.1]) {
    const inputs = { ...base, annualReturn };
    const required = calculateWithdrawalPlan(inputs).requiredBalance;
    const p = calculateWithdrawalPlan({ ...inputs, balance: required });
    close(p.endingBalance, 0);
    close(p.totalShortfall, 0);
    for (const row of p.rows) close(row.openingBalance + row.growth - row.withdrawn, row.closingBalance);
  }
});
test("Zero spending and exact final withdrawal behave correctly", () => {
  const zero = calculateWithdrawalPlan({ ...base, balance: 0, monthlySpending: 0 });
  assert.equal(zero.depletionMonth, null);
  assert.equal(zero.requiredBalance, 0);
  const exact = calculateWithdrawalPlan({ ...base, balance: 120000, currentAge: 55, endAge: 56 });
  assert.equal(exact.depletionMonth, 11);
  assert.equal(exact.totalShortfall, 0);
});
test("Rejects reversed ages, fractional ages, and invalid amounts", () => {
  for (const change of [{ startAge: 23 }, { endAge: 55 }, { currentAge: 24.5 }, { balance: -1 }, { monthlySpending: NaN }, { annualReturn: -1 }]) assert.throws(() => calculateWithdrawalPlan({ ...base, ...change }), RangeError);
});
