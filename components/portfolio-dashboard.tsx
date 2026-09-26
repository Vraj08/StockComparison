"use client"; // Marks this as a Client Component for Next.js app router, ensuring it runs on the client.

// Import necessary React hooks for managing state, side effects, refs, and memoization.
import { ChangeEvent, DragEvent, useMemo, useState, useEffect, useCallback } from "react";
// Import various Lucide icons used throughout the dashboard for UI enhancements.
import { Activity, AlertTriangle, ArrowDown, ArrowRight, BriefcaseBusiness, Check, ChevronDown, FileSpreadsheet, Gauge, Layers3, LoaderCircle, Newspaper, ShieldCheck, Sparkles, Target, UploadCloud, Link as LinkIcon } from "lucide-react";
// Import Plaid Link hook and types for connecting brokerage accounts securely.
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
// Import Recharts components for visualizing portfolio data (area charts, pie charts).
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Import custom UI components for buttons, charts, inputs, and tables.
import { Button } from "@/components/ui/button";
import { FinancialChartTooltip } from "@/components/financial-chart-tooltip";
import { Input } from "@/components/ui/input";
import { InflationCalculator } from "@/components/inflation-calculator";
import { WithdrawalPlanner } from "@/components/withdrawal-planner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Represents a parsed position from a CSV upload or Plaid sync.
type ParsedPosition = { ticker: string; quantity: number; netInvested: number; firstInvestmentDate: string | null };
// Valid keys for different market scenarios used in projections.
type ScenarioKey = "worst" | "bear" | "base" | "bull" | "best" | "average" | "realistic";
// Represents forecasted performance metrics for a single holding.
type HoldingForecast = { annualRate: number; historicalGrowth: number; recentGrowth: number; longTermGrowth: number; recentWeight: number; historicalWeight: number; longTermWeight: number; riskDeduction: number; source: string; samples: number };
// Represents an entire scenario projection curve with associated math details.
type ScenarioCurve = Record<ScenarioKey, number> & { source: "rolling history" | "history-adjusted model"; samples: number; math: { allocationWeightedRate: number; riskAdjustment: number; planningRate: number } };
// The complete result returned from the portfolio analysis API.
type PortfolioResult = {
  asOf: string;
  totalValue: number;
  positions: Array<{ ticker: string; name: string; quantity: number; netInvested: number; firstInvestmentDate: string | null; returnSinceFirstBuy: number | null; annualizedSinceFirstBuy: number | null; latestPrice: number; priceDate: string; marketValue: number; oneYearReturn: number; volatility: number; maxDrawdown: number; weight: number; sector: string; industry: string; nextYear: { low: number; base: number; high: number }; forecastByHorizon: Record<string, HoldingForecast> }>;
  unavailable: Array<{ ticker: string; error: string }>;
  scenarioCurves: Record<string, ScenarioCurve>;
  historicalReturns: Array<{ years: number; available: boolean; totalReturn: number | null; annualizedReturn: number | null; coverage: number; hypotheticalValue: number | null }>;
  portfolioVolatility: number;
  largestWeight: number;
  concentrationIndex: number;
  sectors: Array<{ sector: string; weight: number; holdings: Array<{ ticker: string; name: string; marketValue: number; portfolioWeight: number; sectorWeight: number }> }>;
  timeline: { firstInvestmentDate: string | null; dateCoverage: number; annualizedCoverage: number; weightedReturnSinceFirstBuy: number | null; weightedAnnualizedSinceFirstBuy: number | null; netInvested: number | null; investedValue: number | null; investedCoverage: number; currentGain: number | null; currentReturnOnCashInvested: number | null };
  risk: { score: number; label: string; realisticDownside: number; largestHistoricalHoldingDrawdown: number; math: { volatility: number; largestHolding: number; concentration: number; downside: { floor: number; bearDownside: number; volatilityAndConcentration: number; cap: number } } };
  diversification: { score: number; label: string; effectiveHoldings: number; knownSectorWeight: number; sectorCount: number; math: { concentrationSpread: number; effectiveHoldings: number; sectorSpread: number } };
  marketMood: string;
  strategy: { recommended: "alwaysIn" | "blend" | "dailyDca"; fit: string; explanation: string };
  news: Array<{ ticker: string; title: string; url: string; publisher: string; publishedAt: string | null; sentiment: "positive" | "negative" | "neutral" }>;
  newsByHolding: Array<{ ticker: string; name: string; sector: string; weight: number; stories: Array<{ ticker: string; title: string; url: string; publisher: string; publishedAt: string | null; sentiment: "positive" | "negative" | "neutral" }> }>;
  methodology: string;
};

// Colors for chart segments (e.g., pie chart allocations).
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#58b5d9", "#8ad17e", "#dd8b4f"];
// Helper to format values as USD currency.
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
// Helper to format values as percentages with 1 decimal place.
const pct = (value: number) => new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
// Helper to format date strings consistently.
const dateLabel = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Parses raw CSV text into a 2D array of strings, handling quotes and newlines.
function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  // Iterate through every character in the text
  for (let i = 0; i < text.length; i++) { 
    const char = text[i]; 
    if (quoted) { 
      // Handle escaped quotes inside a quoted field
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; } 
      // End of quoted field
      else if (char === '"') quoted = false; 
      // Normal character inside quotes
      else field += char; 
    } 
    // Start of quoted field
    else if (char === '"') quoted = true; 
    // Field separator
    else if (char === ",") { row.push(field); field = ""; } 
    // Newline, end of row
    else if (char === "\n") { 
      row.push(field.replace(/\r$/, "")); 
      if (row.some(Boolean)) rows.push(row); 
      row = []; field = ""; 
    } 
    // Normal character
    else field += char; 
  }
  // Push the final field and row
  row.push(field.replace(/\r$/, "")); 
  if (row.some(Boolean)) rows.push(row); 
  return rows;
}

// Safely converts a string to a number, handling negative formats like "(100)".
const numberFrom = (value = "") => { 
  const negative = /^\s*\(/.test(value); 
  const parsed = Number(value.replace(/[^0-9.-]/g, "")); 
  return Number.isFinite(parsed) ? parsed * (negative ? -1 : 1) : 0; 
};

// Extracts positions and transaction history from parsed CSV data.
function positionsFromCsv(text: string) {
  const rows = parseCsv(text); 
  // Need at least headers + 1 row
  if (rows.length < 2) throw new Error("The CSV does not contain any portfolio rows.");
  
  // Extract headers and map to lower case for case-insensitive matching
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  // Helper to find column index matching any of the provided names
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  
  // Locate required and optional columns
  const tickerIndex = index("instrument", "ticker", "symbol"); 
  const quantityIndex = index("quantity", "shares", "share quantity");
  const actionIndex = index("trans code", "action", "type", "transaction type"); 
  const amountIndex = index("amount", "net amount", "cost basis"); 
  const priceIndex = index("price", "average price", "avg price");
  const dateIndex = index("activity date", "date", "transaction date", "trade date", "settlement date");
  
  // Throw if critical columns are missing
  if (tickerIndex < 0 || quantityIndex < 0) throw new Error("I could not find ticker and quantity columns. Use Instrument/Ticker and Quantity/Shares.");
  
  // Map to accumulate net position data
  const map = new Map<string, ParsedPosition>();
  
  // Iterate data rows
  rows.slice(1).forEach((values) => { 
    // Normalize ticker symbol
    const ticker = (values[tickerIndex] || "").trim().toUpperCase(); 
    if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return; 
    
    // Normalize transaction action
    const action = (values[actionIndex] || "position").trim().toLowerCase(); 
    const rawQuantity = Math.abs(numberFrom(values[quantityIndex])); 
    if (!rawQuantity) return; 
    
    // Determine if it's a buy (1), sell (-1), or ignore (0)
    const sign = /sell|sold/.test(action) ? -1 : /buy|position|holding/.test(action) || actionIndex < 0 ? 1 : 0; 
    if (!sign) return; 
    
    // Calculate net amount for the transaction
    const amount = Math.abs(numberFrom(values[amountIndex])) || rawQuantity * Math.abs(numberFrom(values[priceIndex])); 
    const parsedDate = dateIndex >= 0 && values[dateIndex] ? new Date(values[dateIndex]) : null; 
    const isoDate = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString().slice(0,10) : null; 
    
    // Retrieve or initialize the position record
    const current = map.get(ticker) || { ticker, quantity: 0, netInvested: 0, firstInvestmentDate: null }; 
    // Update net quantity and net invested amount
    current.quantity += sign * rawQuantity; 
    current.netInvested += sign * amount; 
    // Update earliest investment date if this is a buy
    if (sign > 0 && isoDate && (!current.firstInvestmentDate || isoDate < current.firstInvestmentDate)) {
      current.firstInvestmentDate = isoDate; 
    }
    map.set(ticker, current); 
  });
  
  // Filter out tiny/zero positions and sort by net invested
  const positions = [...map.values()].filter((item) => item.quantity > .0000001).sort((a, b) => b.netInvested - a.netInvested);
  if (!positions.length) throw new Error("No positive stock or ETF positions were found after buys and sells were combined.");
  
  return { positions, transactionExport: actionIndex >= 0, rowCount: rows.length - 1, dateColumnFound: dateIndex >= 0 };
}

// Calculates the future value of an investment with monthly contributions.
function futureValue(current: number, monthly: number, years: number, annualRate: number) {
  // Prevent division by zero or invalid roots for < -100% loss
  const safeAnnual = Math.max(-.99, annualRate);
  // Convert annual rate to monthly rate
  const rate = Math.pow(1 + safeAnnual, 1 / 12) - 1;
  const months = Math.max(0, years * 12);
  const growth = Math.pow(1 + rate, months);
  // Handle edge case where rate is zero
  const additions = Math.abs(rate) < 1e-9 ? monthly * months : monthly * ((growth - 1) / rate);
  // Return projected total, floored at zero
  return Math.max(0, current * growth + additions);
}

// Main Portfolio Dashboard Component
export function PortfolioDashboard() {
  // UI and State hooks
  const [fileName, setFileName] = useState("");
  // Holds parsed CSV metadata
  const [parsed, setParsed] = useState<{ positions: ParsedPosition[]; transactionExport: boolean; rowCount: number; dateColumnFound: boolean } | null>(null);
  // Holds the fully enriched portfolio data from the API
  const [result, setResult] = useState<PortfolioResult | null>(null);
  // Global error message for user display
  const [error, setError] = useState("");
  // Tracks loading/processing status
  const [loading, setLoading] = useState(false);
  // Tracks whether a file is currently dragged over the dropzone
  const [dragging, setDragging] = useState(false);
  
  // Simulation parameters
  const [years, setYears] = useState(10);
  const [monthly, setMonthly] = useState(500);
  const [downsideDrop, setDownsideDrop] = useState(10);
  const [customReturn, setCustomReturn] = useState(12);
  
  // Plaid token state
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [hasSavedToken, setHasSavedToken] = useState(false);

  // Initialize Plaid token on mount
  useEffect(() => {
    // Check if we already have an access token stored locally
    if (typeof window !== "undefined" && localStorage.getItem("plaid_access_token")) {
      setHasSavedToken(true);
    }
    // Fetch a new link token from the backend
    const fetchToken = async () => {
      try {
        const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
        const data = await res.json();
        if (data.link_token) setLinkToken(data.link_token);
      } catch {}
    };
    fetchToken();
  }, []);

  // Submits parsed positions to the backend for analysis
  const loadPositions = async (positions: ParsedPosition[]) => {
    setParsed({ positions, transactionExport: false, rowCount: positions.length, dateColumnFound: true });
    // Call the portfolio analysis endpoint
    const analyzeRes = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions }) });
    const payload = await analyzeRes.json();
    if (!analyzeRes.ok) throw new Error(payload.error || "Portfolio analysis failed.");
    setResult(payload);
  };

  // Uses a previously stored Plaid token to refresh holdings
  const fetchSavedPlaid = async () => {
    const token = localStorage.getItem("plaid_access_token");
    if (!token) return;
    setLoading(true); setError(""); setResult(null); setFileName("Saved Brokerage Sync");
    try {
      // Fetch holdings from Plaid using the access token
      const res = await fetch("/api/plaid/holdings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) });
      const data = await res.json();
      if (!res.ok) {
        // If the token expired or is invalid, remove it
        if (res.status === 400 || res.status === 401) { localStorage.removeItem("plaid_access_token"); setHasSavedToken(false); }
        throw new Error(data.error || "Plaid error");
      }
      // Analyze the returned positions
      await loadPositions(data.positions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Plaid data");
    } finally {
      setLoading(false);
    }
  };

  // Callback when user successfully connects Plaid
  const onSuccess: PlaidLinkOnSuccess = useCallback(async (public_token) => {
    if (!public_token) return;
    setLoading(true); setError(""); setResult(null); setFileName("Brokerage Sync");
    try {
      // Exchange public token for an access token
      const res = await fetch("/api/plaid/exchange-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_token }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Plaid error");
      // Store the access token for future visits
      if (data.access_token) {
        localStorage.setItem("plaid_access_token", data.access_token);
        setHasSavedToken(true);
      }
      // Analyze the returned positions
      await loadPositions(data.positions);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load Plaid data");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialize the Plaid Link hook
  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess });

  // Handle manual CSV file upload
  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(""); setResult(null);
    try {
      // Basic validation
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Please upload a CSV file.");
      // Read text, parse positions, and update state
      const next = positionsFromCsv(await file.text()); 
      setFileName(file.name); setParsed(next); setLoading(true);
      // Analyze positions
      const response = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions: next.positions }) });
      const payload = await response.json() as PortfolioResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Portfolio analysis failed.");
      setResult(payload);
    } catch (cause) { 
      setError(cause instanceof Error ? cause.message : "The file could not be read."); 
    } finally { 
      setLoading(false); 
    }
  };

  // Get the curve (forecast data) specific to the user's selected horizon
  const curve = result?.scenarioCurves[String(years)];
  
  // Memoized calculations for different scenario projection outcomes
  const projected = useMemo(() => {
    if (!result || !curve) return null;
    // Map each scenario to its forecasted return rate
    const rates: Record<ScenarioKey | "custom", number> = { worst: curve.worst, bear: curve.bear, base: curve.base, bull: curve.bull, best: curve.best, average: curve.average, realistic: curve.realistic, custom: customReturn / 100 };
    // Amount the user will have put in total (current balance + all contributions)
    const cashValue = result.totalValue + monthly * years * 12;
    // Compute future value for each rate
    return Object.fromEntries(Object.entries(rates).map(([key, appliedRate]) => {
      const ending = futureValue(result.totalValue, monthly, years, appliedRate);
      const noNewMoney = futureValue(result.totalValue, 0, years, appliedRate);
      const totalReturnPct = cashValue > 0 ? (ending - cashValue) / cashValue : 0;
      // Return details for display
      return [key, { ending, noNewMoney, cashValue, marketEffect: ending - cashValue, appliedRate, totalReturnPct }];
    })) as Record<ScenarioKey | "custom", { ending: number; noNewMoney: number; cashValue: number; marketEffect: number; appliedRate: number; totalReturnPct: number }>;
  }, [result, curve, monthly, years, customReturn]);
  
  // Memoized data points for rendering the growth area chart
  const growthData = useMemo(() => {
    if (!result || !curve) return [];
    // Generate up to 60 data points spread over the selected years
    const points = Array.from({ length: Math.min(60, years) + 1 }, (_, index) => years <= 60 ? index : index * years / 60);
    // Ensure the final point hits exactly the requested number of years
    if (points.at(-1) !== years) points.push(years);
    
    // Map time points to actual projected values
    return points.map((elapsed) => ({
      year: elapsed === 0 ? "Now" : `${Math.round(elapsed)}Y`,
      realistic: futureValue(result.totalValue, monthly, elapsed, curve.realistic),
      cash: result.totalValue + monthly * elapsed * 12,
    }));
  }, [result, curve, monthly, years]);

  // Handle dropping a CSV file
  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files[0]); };
  
  // Specific static projections to December 2026
  const endOf2026 = new Date("2026-12-31T23:59:59Z");
  const yearsTo2026 = Math.max(0, (endOf2026.getTime() - Date.now()) / (365.2425 * 86400000));
  const monthsTo2026 = yearsTo2026 * 12;
  // 1-year realistic return rate
  const baseRate = result?.scenarioCurves["1"]?.realistic || 0;
  
  const dec2026NoAdds = result ? futureValue(result.totalValue, 0, yearsTo2026, baseRate) : 0;
  const dec2026WithAdds = result ? futureValue(result.totalValue, monthly, yearsTo2026, baseRate) : 0;
  const dec2026Cash = result ? result.totalValue + monthly * monthsTo2026 : 0;
  
  const coveredValueAtYearEnd = result?.timeline.investedValue == null ? null : result.timeline.investedValue * Math.pow(1 + baseRate, yearsTo2026);
  const sinceStartProjectedReturn = coveredValueAtYearEnd == null || !result?.timeline.netInvested ? null : coveredValueAtYearEnd / result.timeline.netInvested - 1;

  // Render the full UI structure
  return <section className="workspace portfolio-workspace">
    {/* Page Header */}
    <div className="portfolio-hero">
      <div>
        <span className="eyebrow"><Sparkles/> Clarity for your next chapter</span>
        <h1>Your wealth. A clearer perspective.</h1>
        <p>See allocation, portfolio-specific historical ranges, risk, diversification, and what several investment paths could mean in dollars.</p>
      </div>
      <div className="privacy-note">
        <ShieldCheck/>
        <div><strong>Your CSV stays private</strong><span>The raw file is read in your browser and is not stored.</span></div>
      </div>
    </div>
    
    {/* Progress Tracker */}
    <div className="simple-steps">
      <span className={parsed ? "done" : "active"}><i>{parsed ? <Check/> : "1"}</i> Upload CSV</span><ArrowRight/>
      <span className={loading ? "active" : result ? "done" : ""}><i>{result ? <Check/> : "2"}</i> Check market data</span><ArrowRight/>
      <span className={result ? "active" : ""}><i>3</i> Read your snapshot</span>
    </div>
    
    {/* Input Area (CSV upload + Plaid connection) */}
    <div className="upload-options">
      {/* File Dropzone */}
      <label className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <input type="file" accept=".csv,text/csv" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])}/>
        <span className="upload-icon">{loading ? <LoaderCircle className="spin"/> : <UploadCloud/>}</span>
        <div>
          <strong>{loading ? "Reading your portfolio…" : fileName || "Drop your portfolio CSV here"}</strong>
          <span>{parsed ? `${parsed.rowCount} rows · ${parsed.positions.length} positions found` : "Or click to choose a file. Robinhood-style transaction exports and basic holdings files are supported."}</span>
        </div>
        <Button type="button" variant="outline">Choose CSV</Button>
      </label>
      {/* Plaid Option */}
      <div className="plaid-card">
        <div>
          <strong>Connect Brokerage directly</strong>
          <span>Log in securely via Plaid to instantly pull your active portfolio holdings (Robinhood, Fidelity, Vanguard, etc).</span>
        </div>
        <div style={{display: "flex", gap: "0.5rem", flexDirection: "column"}}>
          {hasSavedToken && <Button onClick={fetchSavedPlaid} disabled={loading} variant="secondary">Refresh Saved Connection</Button>}
          <Button onClick={() => open()} disabled={!ready || !linkToken || loading} variant="default"><LinkIcon style={{width:16,height:16,marginRight:6}}/> {hasSavedToken ? "Connect Different Account" : "Connect with Plaid"}</Button>
        </div>
      </div>
    </div>
    
    {/* Error notification */}
    {error && <div className="error-banner"><AlertTriangle/><div><strong>I couldn’t read that portfolio</strong><span>{error}</span></div></div>}
    
    {/* Info notification if they uploaded a transaction file */}
    {parsed?.transactionExport && <div className="plain-note"><FileSpreadsheet/><div><strong>This is a transaction-history file.</strong><span>The snapshot combines buys and sells inside the CSV. If the export is incomplete, the estimated holdings may also be incomplete.</span></div></div>}

    {/* Supplementary Tools */}
    <InflationCalculator />
    <WithdrawalPlanner />
    
    {/* Main Results View */}
    {result && projected && curve && <>
      
      {/* High-level Summary */}
      <section className="plain-summary">
        <div className="summary-icon"><BriefcaseBusiness/></div>
        <div><span>Your snapshot</span><h2>{money(result.totalValue)} estimated market value</h2><p>{result.positions.length} positions with market data as of {new Date(`${result.asOf}T00:00:00`).toLocaleDateString()}.</p></div>
        <div className="summary-facts">
          <div><span>Largest holding</span><strong>{result.positions[0]?.ticker} · {pct(result.largestWeight)}</strong></div>
          <div><span>Risk score</span><strong>{result.risk.score}/100 · {result.risk.label}</strong></div>
          <div><span>Diversification</span><strong>{result.diversification.score}/100 · {result.diversification.label}</strong></div>
        </div>
      </section>

      {/* Timeline/History Panel */}
      <section className="panel timeline-panel">
        <div className="panel-heading">
          <div><span>Your money so far</span><h2>{result.timeline.firstInvestmentDate ? `${dateLabel(result.timeline.firstInvestmentDate)} to December 31, 2026` : "Investment-date details"}</h2><p>This uses the buy and sell amounts found in the CSV. Money invested yesterday is included at its full cost—it is not treated as if it had been invested since the first date.</p></div>
          <Target/>
        </div>
        {result.timeline.netInvested && result.timeline.investedValue ? <>
          <div className="timeline-grid">
            <article><span>Cash put into covered positions</span><strong>{money(result.timeline.netInvested)}</strong><p>Buys minus sells found in the uploaded file.</p></article>
            <article><span>What those covered positions are worth now</span><strong>{money(result.timeline.investedValue)}</strong><p>{pct(result.timeline.investedCoverage)} of the current portfolio had usable cost information.</p></article>
            <article><span>Gain or loss so far</span><strong className={(result.timeline.currentGain||0)>=0?"positive":"negative"}>{(result.timeline.currentGain||0)>=0?"+":"−"}{money(Math.abs(result.timeline.currentGain||0))}</strong><p>{pct(result.timeline.currentReturnOnCashInvested||0)} compared with the cash recorded as invested.</p></article>
            <article><span>Estimated return by Dec. 31</span><strong className={(sinceStartProjectedReturn||0)>=0?"positive":"negative"}>{sinceStartProjectedReturn==null?"—":pct(sinceStartProjectedReturn)}</strong><p>Covered positions today, grown for the remaining {monthsTo2026.toFixed(1)} months at the {pct(baseRate)}/yr planning rate, compared with recorded cash invested.</p></article>
          </div>
          <div className="timeline-plain-math"><strong>In plain numbers:</strong> estimated covered value on Dec. 31 ({coveredValueAtYearEnd==null?"—":money(coveredValueAtYearEnd)}) minus cash invested ({money(result.timeline.netInvested)}) gives the estimated gain. Dividing that gain by cash invested gives the percentage above.</div>
        </> : <div className="timeline-empty">The CSV did not contain usable transaction amounts, so the site will not guess a personal return. The forward calculator still works from today’s estimated balance.</div>}
      </section>

      {/* Allocation and Strategy Panels */}
      <section className="explain-grid">
        {/* Allocation Donut Chart */}
        <article className="panel allocation-card">
          <div className="panel-heading"><div><span>What you own</span><h2>Portfolio mix</h2><p>Bigger slices mean more of your balance depends on that holding.</p></div></div>
          <div className="allocation-body">
            <div className="donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={result.positions.slice(0,8)} dataKey="marketValue" nameKey="ticker" innerRadius="62%" outerRadius="90%" paddingAngle={2}>
                    {result.positions.slice(0,8).map((item,index)=><Cell key={item.ticker} fill={COLORS[index%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip formatter={(value)=>money(Number(value))} contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:10}}/>
                </PieChart>
              </ResponsiveContainer>
              <div><strong>{result.positions.length}</strong><span>holdings</span></div>
            </div>
            {/* Legend */}
            <div className="allocation-list">{result.positions.slice(0,7).map((item,index)=><div key={item.ticker}><i style={{background:COLORS[index%COLORS.length]}}/><strong>{item.ticker}</strong><span>{pct(item.weight)}</span></div>)}</div>
          </div>
        </article>
        
        {/* Recommended Strategy Block */}
        <article className="panel strategy-card">
          <div className="strategy-top"><span className="summary-icon"><Gauge/></span><div><span>What may fit new money</span><h2>{result.strategy.fit}</h2></div></div>
          <p>{result.strategy.explanation}</p>
          <div className="strategy-compare">
            <div className={result.strategy.recommended === "alwaysIn" ? "recommended" : ""}><strong>Always-In {result.strategy.recommended === "alwaysIn" && <b>Best fit</b>}</strong><span>Invest new cash immediately for maximum time in the market.</span></div>
            <div className={result.strategy.recommended === "blend" ? "recommended" : ""}><strong>50/50 blend {result.strategy.recommended === "blend" && <b>Best fit</b>}</strong><span>Invest half now and phase the other half in during volatility.</span></div>
            <div className={result.strategy.recommended === "dailyDca" ? "recommended" : ""}><strong>Daily DCA {result.strategy.recommended === "dailyDca" && <b>Best fit</b>}</strong><span>Spread purchases out to reduce single-day entry risk.</span></div>
          </div>
          <small>The fit uses allocation concentration, historical price swings, and diversification. It does not know your goals, taxes, or cash needs.</small>
        </article>
      </section>

      {/* Risk and Sector Diversification */}
      <section className="panel risk-panel">
        <div className="panel-heading"><div><span>Risk & diversification</span><h2>Where portfolio risk is coming from</h2><p>Scores combine current weights, historical volatility, holding concentration, and sector spread.</p></div><Activity/></div>
        <div className="risk-layout">
          {/* Summary scores */}
          <div className="score-stack">
            <article><span>Risk</span><strong>{result.risk.score}<small>/100</small></strong><b>{result.risk.label}</b><div className="score-track"><i style={{width:`${result.risk.score}%`}}/></div><p>{result.risk.label === "High" ? "Large price swings or concentrated positions can move the portfolio sharply." : result.risk.label === "Moderate" ? "The portfolio has meaningful market swings, but concentration is not at the highest level." : "Historical swings and concentration are comparatively lower—not risk-free."}</p></article>
            <article><span>Diversification</span><strong>{result.diversification.score}<small>/100</small></strong><b>{result.diversification.label}</b><div className="score-track diversity"><i style={{width:`${result.diversification.score}%`}}/></div><p>{result.diversification.label === "Broad" ? `Exposure is spread across about ${result.diversification.effectiveHoldings.toFixed(1)} effective holdings and ${result.diversification.sectorCount} classified sectors.` : result.diversification.label === "Moderate" ? "Several holdings contribute, but a few positions or sectors still carry a meaningful share." : "A small number of positions or sectors drive most of the result."}</p></article>
            <details className="score-math"><summary>Why did I get these scores? <ChevronDown/></summary><div><p><strong>Risk score:</strong> past price swings add {result.risk.math.volatility.toFixed(1)} points, the size of the largest holding adds {result.risk.math.largestHolding.toFixed(1)}, and dependence on a few holdings adds {result.risk.math.concentration.toFixed(1)}. Together: <b>{result.risk.score}/100</b>.</p><p><strong>Diversification score:</strong> spreading money across holdings adds {result.diversification.math.concentrationSpread.toFixed(1)} points, having several meaningful holdings adds {result.diversification.math.effectiveHoldings.toFixed(1)}, and spreading across sectors adds {result.diversification.math.sectorSpread.toFixed(1)}. Together: <b>{result.diversification.score}/100</b>.</p><p><strong>Why “effective holdings”?</strong> You may own many tickers, but if most money sits in only a few, the portfolio behaves like a smaller portfolio. Yours behaves like about {result.diversification.effectiveHoldings.toFixed(1)} equally sized holdings.</p></div></details>
          </div>
          {/* Sector groupings */}
          <div className="sector-list">
            <div className="sector-title"><Layers3/><div><strong>Allocation by sector</strong><span>Select a sector to see every holding inside it</span></div></div>
            {result.sectors.map((item,index)=><details className="sector-group" key={item.sector}><summary><i style={{background:COLORS[index%COLORS.length]}}/><span>{item.sector}</span><div><b style={{width:`${item.weight*100}%`,background:COLORS[index%COLORS.length]}}/></div><strong>{pct(item.weight)}</strong><ChevronDown/></summary><div className="sector-holdings">{item.holdings.map((holding)=><div key={holding.ticker}><span><strong>{holding.ticker}</strong><small>{holding.name}</small></span><span><b>{pct(holding.portfolioWeight)} of portfolio</b><small>{pct(holding.sectorWeight)} of this sector · {money(holding.marketValue)}</small></span></div>)}</div></details>)}
          </div>
        </div>
      </section>

      {/* Interactive Stress Test */}
      <section className="panel stress-panel">
        <div className="panel-heading"><div><span>Downside check</span><h2>If the market dropped today</h2><p>Move the slider for your own stress test, then compare it with a portfolio-specific downside estimate.</p></div><ArrowDown/></div>
        <div className="stress-layout">
          {/* Slider for custom drop */}
          <div className="slider-card"><label><span>Drop percentage</span><strong>{downsideDrop}%</strong></label><input aria-label="Drop percentage" type="range" min="1" max="70" value={downsideDrop} onChange={(event)=>setDownsideDrop(Number(event.target.value))}/><div className="stress-result"><span>Your selected fall</span><strong className="negative">−{money(result.totalValue * downsideDrop / 100)}</strong><p>Estimated remaining balance <b>{money(result.totalValue * (1 - downsideDrop / 100))}</b></p></div></div>
          {/* System calculated realistic drop */}
          <div className="downside-estimate"><span><Target/> A cautious “be ready for this” drop</span><strong>{pct(result.risk.realisticDownside)} downside</strong><p>About <b>−{money(result.totalValue * result.risk.realisticDownside)}</b>, leaving roughly <b>{money(result.totalValue * (1-result.risk.realisticDownside))}</b>.</p><details><summary>Why is the warning this large? <ChevronDown/></summary><div className="downside-signals"><span><b>{pct(result.portfolioVolatility)}</b><small>How jumpy the holdings have been, after applying your allocation</small></span><span><b>{pct(result.largestWeight)}</b><small>How much of the portfolio depends on the largest holding</small></span><span><b>{pct(result.risk.math.downside.bearDownside)}</b><small>Loss in a weak historical one-year portfolio result, if it was negative</small></span></div><p>The site turns the normal price swings into a cautious loss allowance and adds a small amount for concentration. It compares that with the weak historical result and uses whichever warning is larger. For this portfolio, that produces {pct(result.risk.realisticDownside)}.</p></details><small>This is a stress-test amount to plan around—not a prediction that the portfolio will fall exactly this much.</small></div>
        </div>
      </section>

      {/* Scenario Planning Calculator */}
      <section className="panel scenario-panel">
        <div className="panel-heading">
          <div><span>Long-term calculator</span><h2>Invested versus left as cash</h2><p>Every portfolio case now uses your current allocation and a rate calculated for the selected horizon.</p></div>
          {/* Year/Contribution controls */}
          <div className="scenario-controls">
            <div className="year-presets"><span>Years</span>{[1,5,10,20,30,40,50].map((value)=><button className={years===value?"active":""} key={value} onClick={()=>setYears(value)}>{value}</button>)}</div>
            <label><span>Or type years</span><Input aria-label="Projection years" type="number" min="1" max="50" value={years} onChange={(event)=>setYears(Math.min(50,Math.max(1,Number(event.target.value)||1)))}/></label>
            <label><span>Add each month</span><Input type="number" min="0" step="50" value={monthly} onChange={(event)=>setMonthly(Math.max(0,Number(event.target.value)||0))}/></label>
          </div>
        </div>
        {/* Custom rate slider */}
        <div className="custom-rate"><label><span>Your custom expected return</span><strong>{customReturn}%/yr</strong></label><input aria-label="Custom expected annual return" type="range" min="-30" max="50" value={customReturn} onChange={(event)=>setCustomReturn(Number(event.target.value))}/></div>
        
        {/* Highlights logic comparison between investing and holding cash */}
        <div className="calculator-compare">
          <article><span>Path 1 · Keep it invested</span><strong>{money(projected.realistic.ending)}</strong><p>Uses the portfolio-tailored realistic rate and adds {money(monthly)} monthly. Market effect versus cash: <b className={projected.realistic.marketEffect>=0?"positive":"negative"}>{projected.realistic.marketEffect>=0?"+":"−"}{money(Math.abs(projected.realistic.marketEffect))}</b>.</p></article>
          <article><span>Path 2 · Leave the same dollars as cash</span><strong>{money(projected.realistic.cashValue)}</strong><p>Today’s balance plus the same monthly additions, assuming zero investment return.</p></article>
        </div>
        
        {/* Metadata on projection details */}
        <div className="projection-start"><span>Starting portfolio <strong>{money(result.totalValue)}</strong></span><span>Added over {years} years <strong>{money(monthly*years*12)}</strong></span><span>Scenario source <strong>{curve.source}{curve.samples?` · ${curve.samples} windows`:""}</strong></span></div>

        {/* Explain the math inside an expandable details section */}
        <details className="formula-panel" open><summary>Why the {years}-year planning estimate is {pct(curve.realistic)}/year <ChevronDown/></summary><div className="plain-steps"><article><b>1</b><div><strong>Estimate each holding for {years} years</strong><p>The site looks at that holding’s historical {years}-year results, its recent one-year move, and its longer-term yearly growth. The recent year matters less when you select a longer horizon.</p></div></article><article><b>2</b><div><strong>Apply your actual allocation</strong><p>A stock that is 20% of your portfolio contributes 20% of its {years}-year estimate. Adding every holding’s contribution gives {pct(curve.math.allocationWeightedRate)}.</p></div></article><article><b>3</b><div><strong>Reduce it for portfolio risk</strong><p>The site subtracts {pct(curve.math.riskAdjustment)} for portfolio-wide price swings and concentration. The final {years}-year planning rate is {pct(curve.math.planningRate)} per year.</p></div></article></div><div className="holding-math"><div className="holding-math-head"><span>Holding</span><span>Your allocation</span><span>{years}-year estimate</span><span>Adds to portfolio rate</span></div>{result.positions.map((item)=>{const estimate=item.forecastByHorizon[String(years)];return <details key={item.ticker}><summary><strong>{item.ticker}</strong><span>{pct(item.weight)}</span><span>{pct(estimate.annualRate)}/yr</span><b>{pct(item.weight*estimate.annualRate)}</b></summary><p>{item.ticker}: {Math.round(estimate.recentWeight*100)}% × recent one-year growth ({pct(estimate.recentGrowth)}) + {Math.round(estimate.historicalWeight*100)}% × its {years}-year historical result ({pct(estimate.historicalGrowth)}) + {Math.round(estimate.longTermWeight*100)}% × long-term yearly growth ({pct(estimate.longTermGrowth)}) − {pct(estimate.riskDeduction)} for that stock’s price swings = <strong>{pct(estimate.annualRate)}/year</strong>. Source: {estimate.source}{estimate.samples?` (${estimate.samples} historical periods)`:""}.</p></details>})}</div></details>

        {/* Shorter-term projections specific to the 2026 horizon */}
        {yearsTo2026 > 0 && <div className="year-end-block"><div><span>December 31, 2026 outlook</span><h3>Portfolio-tailored realistic rate: {pct(baseRate)}/yr</h3><p>Uses the remaining {monthsTo2026.toFixed(1)} months and today’s allocation.</p></div><article><span>Keep current holdings, add nothing</span><strong>{money(dec2026NoAdds)}</strong></article><article><span>Keep investing {money(monthly)}/month</span><strong>{money(dec2026WithAdds)}</strong></article><article><span>Leave it as zero-return cash</span><strong>{money(dec2026Cash)}</strong></article></div>}

        {/* Render scenario cards for all projected models (worst, bear, bull, etc.) */}
        <div className="scenario-grid">{[
          {key:"worst",label:"Very rough past market",help:"A historically difficult result",definition:"Picture 100 similar past time periods arranged from worst to best. This result would sit near the bottom: only about five were worse. It is not the maximum possible loss."}, {key:"bear",label:"Weak market",help:"Below-normal history",definition:"In a group of 100 similar past periods, about 25 performed this poorly or worse."}, {key:"base",label:"Typical past market",help:"The middle historical result",definition:"Half of similar past periods did better and half did worse. This describes history; it is not automatically the best forecast."}, {key:"bull",label:"Strong market",help:"Better-than-normal history",definition:"About three out of four comparable past periods were lower than this result."}, {key:"best",label:"Exceptional past market",help:"An unusually strong result",definition:"Only about five out of 100 comparable past periods were stronger. Treat this as optimistic, not expected."}, {key:"average",label:"Past average",help:"All comparable periods averaged together",definition:"Add the historical yearly results and divide by the number of periods. Very strong years can pull this number upward."}, {key:"realistic",label:"Planning estimate",help:"Built from your holdings and weights",definition:`Each holding gets its own recent-and-historical growth estimate, multiplied by its ${"share of your portfolio"}. The results are added, reduced for risk, and made more cautious over long periods.`}, {key:"custom",label:"Your own assumption",help:"You choose this number",definition:`Uses exactly the ${customReturn}% annual return selected above. The site does not calculate this one.`}
        ].map((item)=>{ const value=projected[item.key as ScenarioKey|"custom"]; return <article key={item.key} className={`scenario ${item.key}`}><span>{item.label}</span><strong>{money(value.ending)}</strong><em>With {money(monthly)}/month for {years} year{years===1?"":"s"}</em><dl><div><dt>Yearly rate used</dt><dd>{pct(value.appliedRate)}/yr</dd></div><div><dt>If you add nothing</dt><dd>{money(value.noNewMoney)}</dd></div><div><dt>If held as cash</dt><dd>{money(value.cashValue)}</dd></div><div><dt>Investment difference</dt><dd className={value.marketEffect>=0?"positive":"negative"}>{value.marketEffect>=0?"+":"−"}{money(Math.abs(value.marketEffect))} ({value.marketEffect>=0?"+":"−"}{pct(Math.abs(value.totalReturnPct))})</dd></div></dl><details className="scenario-meaning"><summary>Explain this simply <ChevronDown/></summary><p><strong>{item.help}.</strong> {item.definition}</p></details></article>; })}</div>
        <div className="scenario-explainer"><AlertTriangle/><div><p><strong>How to use these cards:</strong> the past-market cards show what happened during weak, typical, strong, and exceptional periods of the same length. Every stock is counted according to its share of your portfolio.</p><p>For planning, focus on the green “Planning estimate” card. The other cards help you understand how wide the possible range can be. None is a promise.</p></div></div>
      </section>

      {/* Visual representation of realistic growth trajectory */}
      <section className="panel growth-panel">
        <div className="panel-heading"><div><span>Simple growth picture</span><h2>Estimated portfolio value vs. amount invested</h2><p>The green line estimates what the invested portfolio could be worth. The dotted gray line shows only your starting amount plus monthly additions—the amount of money put in.</p></div><Activity/></div>
        <div className="growth-legend"><span><i className="realistic-line"/>Estimated portfolio value · kept invested</span><span><i className="cash-line"/>Amount invested · starting balance plus additions</span></div>
        <div className="growth-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growthData} margin={{top:18,right:26,left:10,bottom:6}}>
              <defs><linearGradient id="portfolioGrowthFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-1)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={.01}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--grid)"/>
              <XAxis axisLine={false} tickLine={false} tickMargin={12} dataKey="year" tick={{fill:"var(--muted-foreground)",fontSize: 12}} minTickGap={28}/>
              <YAxis axisLine={false} tickLine={false} tickMargin={10} tickFormatter={(value)=>new Intl.NumberFormat("en-US",{notation:"compact",style:"currency",currency:"USD",maximumFractionDigits:0}).format(Number(value))} tick={{fill:"var(--muted-foreground)",fontSize: 12}} width={76}/>
              <Tooltip content={<FinancialChartTooltip/>} cursor={{stroke:"var(--border)",strokeDasharray:"4 4"}}/>
              <Area fill="url(#portfolioGrowthFill)" type="monotone" dataKey="realistic" stroke="var(--chart-1)" strokeWidth={4} dot={false}/>
              <Area fill="transparent" type="monotone" dataKey="cash" stroke="#9aa4b2" strokeWidth={1.5} strokeDasharray="7 6" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="growth-summary"><span>Estimated value after {years} year{years===1?"":"s"} <strong>{money(projected.realistic.ending)}</strong></span><span>Total amount invested <strong>{money(projected.realistic.cashValue)}</strong></span><span>Estimated investment return <strong className={projected.realistic.marketEffect>=0?"positive":"negative"}>{projected.realistic.marketEffect>=0?"+":"−"}{money(Math.abs(projected.realistic.marketEffect))} ({projected.realistic.marketEffect>=0?"+":"−"}{pct(Math.abs(projected.realistic.totalReturnPct))})</strong></span></div>
      </section>

      {/* Break down holding-by-holding details into a table format */}
      <section className="panel holdings-panel">
        <div className="panel-heading"><div><span>Your positions</span><h2>What each holding contributes</h2><p>The estimate column follows the selected {years}-year calculator horizon and updates whenever the years change.</p></div></div>
        <Table>
          <TableHeader><TableRow><TableHead>Holding</TableHead><TableHead>Shares</TableHead><TableHead>Estimated value</TableHead><TableHead>Portfolio share</TableHead><TableHead>Sector</TableHead><TableHead>First buy in CSV</TableHead><TableHead>Since first buy</TableHead><TableHead>1-year move</TableHead><TableHead>{years}-year estimate</TableHead><TableHead>Price swing</TableHead></TableRow></TableHeader>
          <TableBody>
            {result.positions.map((item)=>{
              const estimate=item.forecastByHorizon[String(years)];
              return <TableRow key={item.ticker}>
                <TableCell><strong>{item.ticker}</strong><span className="cell-sub">{item.name}</span></TableCell>
                <TableCell>{item.quantity.toFixed(4)}</TableCell>
                <TableCell>{money(item.marketValue)}</TableCell>
                <TableCell>{pct(item.weight)}</TableCell>
                <TableCell>{item.sector}</TableCell>
                <TableCell>{item.firstInvestmentDate?dateLabel(item.firstInvestmentDate):"Not in file"}</TableCell>
                <TableCell className={(item.returnSinceFirstBuy||0)>=0?"positive":"negative"}>{item.returnSinceFirstBuy==null?"—":pct(item.returnSinceFirstBuy)}</TableCell>
                <TableCell className={item.oneYearReturn>=0?"positive":"negative"}>{pct(item.oneYearReturn)}</TableCell>
                <TableCell><strong className={estimate.annualRate>=0?"positive":"negative"}>{pct(estimate.annualRate)}/yr</strong><span className="cell-sub">{estimate.source}</span></TableCell>
                <TableCell>{item.volatility>=.4?"High":item.volatility>=.25?"Medium":"Lower"}</TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
      </section>

      {/* Relevant News Stories fetched for the portfolio holdings */}
      <section className="panel news-panel">
        <div className="panel-heading"><div><span>What the market is talking about</span><h2>Current news for each stock and ETF</h2><p>Up to four recent Yahoo Finance stories are grouped under each holding when available. Headline tone is a quick keyword scan—open the story for context.</p></div><Newspaper/></div>
        <div className="holding-news-groups">
          {result.newsByHolding.length ? result.newsByHolding.map((group) => <section key={group.ticker}>
            <div className="holding-news-heading"><div><strong>{group.ticker}</strong><span>{group.name}</span></div><small>{group.sector} · {pct(group.weight)} of portfolio · {group.stories.length} stor{group.stories.length===1?"y":"ies"}</small></div>
            <div className="news-grid">
              {group.stories.map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer"><div><span>{item.ticker}</span><em className={item.sentiment}>{item.sentiment}</em></div><strong>{item.title}</strong><small>{item.publisher}{item.publishedAt?` · ${new Date(item.publishedAt).toLocaleDateString()}`:""}</small></a>)}
            </div>
          </section>) : <div className="empty-news">No recent Yahoo Finance stories were available for these holdings.</div>}
        </div>
      </section>
      
      {/* Footer disclaimers and missing asset notices */}
      {result.unavailable.length>0 && <div className="plain-note"><AlertTriangle/><div><strong>{result.unavailable.length} holding{result.unavailable.length===1?" was":"s were"} excluded.</strong><span>{result.unavailable.map((item)=>item.ticker).join(", ")} did not return usable market history.</span></div></div>}
      <div className="method-note"><ShieldCheck/><p><strong>How this works:</strong> {result.methodology} For personal research and education only. It does not consider your income, taxes, debts, goals, or risk tolerance.</p></div>
    </>}
  </section>;
}
