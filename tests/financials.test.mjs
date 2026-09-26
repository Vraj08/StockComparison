import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCashFlows } from "../lib/financials.ts";

const fact = (val, overrides = {}) => ({ start: "2022-10-01", end: "2023-09-30", val, form: "10-K", filed: "2023-11-01", accn: "original", ...overrides });
const payload = (entries) => ({ entityName: "Test", facts: { "us-gaap": Object.fromEntries(Object.entries(entries).map(([key, values]) => [key, { units: { USD: values } }])) } });
test("uses actual annual dates, excludes quarters, and keeps latest restatement consistent", () => {
  const result = normalizeCashFlows(payload({
    NetCashProvidedByUsedInOperatingActivities: [fact(100), fact(120, { filed: "2024-11-01", accn: "restated" }), fact(40, { start: "2023-07-01", filed: "2025-01-01" })],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact(20), fact(30, { filed: "2024-11-01", accn: "restated" })],
    PaymentsOfDividends: [fact(10)],
  }));
  assert.equal(result.length, 1);
  assert.equal(result[0].end, "2023-09-30");
  assert.equal(result[0].values.operating, 120);
  assert.equal(result[0].values.capex, -30);
  assert.equal(result[0].values.free, 90);
  assert.equal(result[0].values.dividends, null);
});
test("preserves genuine zeros and never calculates FCF from missing capex", () => {
  const result = normalizeCashFlows(payload({ NetCashProvidedByUsedInOperatingActivities: [fact(0)] }));
  assert.equal(result[0].values.operating, 0);
  assert.equal(result[0].values.free, null);
  assert.deepEqual(normalizeCashFlows({ entityName: "Foreign", facts: {} }), []);
});
test("matches start dates as well as end dates and handles 53-week fiscal years", () => {
  const result = normalizeCashFlows(payload({
    NetCashProvidedByUsedInOperatingActivities: [fact(-50, { start: "2022-09-25" })],
    PaymentsToAcquirePropertyPlantAndEquipment: [fact(10), fact(0, { start: "2022-09-25" })],
  }));
  assert.equal(result[0].values.free, -50);
});
