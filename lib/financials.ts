/**
 * Represents a single fact parsed from an SEC XBRL filing.
 */
export type SecFact = { 
  start?: string; // Optional start date of the period the fact covers.
  end: string;    // End date of the period the fact covers.
  val: number;    // The numeric value of the fact.
  form: string;   // The SEC form type (e.g., '10-K', '10-Q').
  filed: string;  // The date the form was filed with the SEC.
  accn: string;   // The SEC accession number identifying the specific filing document.
};

/**
 * Represents the structured payload of all company facts returned by the SEC API.
 */
export type CompanyFacts = { 
  entityName: string; // The official name of the company.
  facts?: Record<string, Record<string, { units?: Record<string, SecFact[]> }>>; // Nested dictionary containing facts categorized by taxonomy (like us-gaap) and units.
};

/**
 * Defines a normalized schema for cash flow metrics we want to extract.
 * Each entry specifies the key, user-readable label, category, and standard SEC US-GAAP tags.
 */
export const cashFlowRows = [
  { key: "income", label: "Net income", group: "Operating activities", tags: ["NetIncomeLoss", "ProfitLoss"] },
  { key: "depreciation", label: "Depreciation & amortization", group: "Operating activities", tags: ["DepreciationDepletionAndAmortization", "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"] },
  { key: "compensation", label: "Stock-based compensation", group: "Operating activities", tags: ["ShareBasedCompensation"] },
  { key: "operating", label: "Cash from Operating Activities", group: "Operating activities", tags: ["NetCashProvidedByUsedInOperatingActivities"], total: true },
  { key: "capex", label: "Capital expenditure", group: "Investing activities", tags: ["PaymentsToAcquirePropertyPlantAndEquipment"], outflow: true },
  { key: "acquisitions", label: "Business acquisitions, net", group: "Investing activities", tags: ["PaymentsToAcquireBusinessesNetOfCashAcquired"], outflow: true },
  { key: "investing", label: "Cash from Investing Activities", group: "Investing activities", tags: ["NetCashProvidedByUsedInInvestingActivities"], total: true },
  { key: "dividends", label: "Dividends paid", group: "Financing activities", tags: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"], outflow: true },
  { key: "buybacks", label: "Share repurchases", group: "Financing activities", tags: ["PaymentsForRepurchaseOfCommonStock"], outflow: true },
  { key: "financing", label: "Cash from Financing Activities", group: "Financing activities", tags: ["NetCashProvidedByUsedInFinancingActivities"], total: true },
  { key: "change", label: "Change in cash (including FX)", group: "Cash summary", tags: ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect", "CashAndCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect", "CashAndCashEquivalentsPeriodIncreaseDecrease"], total: true },
  { key: "free", label: "Free cash flow (calculated)", group: "Cash summary", tags: [], total: true },
] as const;

/**
 * Represents a single normalized annual reporting period for the company.
 */
export type AnnualPeriod = { 
  start: string;     // The start date of the annual period.
  end: string;       // The end date of the annual period.
  filed: string;     // The date the report covering this period was filed.
  accession: string; // The SEC accession number of the filing.
  values: Record<string, number | null>; // A dictionary mapping normalized row keys to their numeric values.
};

/**
 * Represents the top-level financial model containing normalized periods and metadata.
 */
export type Financials = { 
  ticker: string;          // The company's stock ticker.
  name: string;            // The company's name.
  cik: number;             // The Central Index Key (CIK) identifying the company with the SEC.
  currency: string;        // The currency used for the reported facts (e.g., 'USD').
  periods: AnnualPeriod[]; // The array of normalized annual financial periods.
  source: string;          // Descriptive string identifying the source of data.
};

/**
 * Determines whether a given SEC fact represents a full annual reporting period (approx. 365 days)
 * and comes from an annual filing type (10-K).
 *
 * @param {SecFact} fact - The raw fact extracted from SEC data.
 * @returns {boolean} True if the fact is an annual metric, false otherwise.
 */
function annual(fact: SecFact) {
  // Calculate the difference in days between the start and end dates.
  const days = (Date.parse(fact.end) - Date.parse(fact.start || "")) / 86400000;
  // Check if form is 10-K, duration is roughly a year, and value is a valid number.
  return ["10-K", "10-K/A"].includes(fact.form) && days >= 330 && days <= 380 && Number.isFinite(fact.val);
}

/**
 * Normalizes complex SEC XBRL company facts into a simple, sequential array of annual cash flow periods.
 * Use actual period dates, not `fy`: comparative facts carry the filing's fiscal year.
 * Select a single accession per period so restated and original line items are not mixed.
 *
 * @param {CompanyFacts} payload - The raw company facts data returned by the SEC API.
 * @returns {AnnualPeriod[]} An array of normalized annual cash flow statements, ordered most recent first.
 */
export function normalizeCashFlows(payload: CompanyFacts): AnnualPeriod[] {
  // Extract US-GAAP taxonomy facts, defaulting to empty object if none exist.
  const facts = payload.facts?.["us-gaap"] || {};
  
  // Use the fundamental 'Operating Activities' fact to identify valid annual periods.
  const anchors = (facts.NetCashProvidedByUsedInOperatingActivities?.units?.USD || []).filter(annual);
  
  // Map to store a single, authoritative anchor fact per period end-date.
  const periods = new Map<string, SecFact>();
  
  // Iterate over all valid anchors to select the most recent/authoritative filing for each period end-date.
  for (const fact of anchors) {
    const previous = periods.get(fact.end);
    // Overwrite if this is the first fact for the period, or if it was filed more recently, or if it has a newer accession number.
    if (!previous || fact.filed > previous.filed || (fact.filed === previous.filed && fact.accn > previous.accn)) periods.set(fact.end, fact);
  }
  
  // Convert the map values to an array, sort descending by period end date, and map to our AnnualPeriod schema.
  return [...periods.values()].sort((a, b) => b.end.localeCompare(a.end)).map((anchor) => {
    // Initialize a dictionary to hold the matched values for each normalized row.
    const values: Record<string, number | null> = {};
    
    // Iterate over our defined normalized schema rows.
    for (const row of cashFlowRows) {
      // Find the specific fact matching our required tags, period bounds, and accession number.
      const match = row.tags.flatMap(tag => facts[tag]?.units?.USD || []).find(fact => annual(fact) && fact.start === anchor.start && fact.end === anchor.end && fact.accn === anchor.accn);
      // If a match is found, assign the value, optionally negating it if defined as an outflow.
      values[row.key] = match ? ("outflow" in row ? -match.val : match.val) : null;
    }
    
    // Calculate 'Free Cash Flow' manually from operating cash and capital expenditures, if both are present.
    values.free = values.operating !== null && values.capex !== null ? values.operating + values.capex : null;
    
    // Return the completed annual period object.
    return { start: anchor.start!, end: anchor.end, filed: anchor.filed, accession: anchor.accn, values };
  });
}
