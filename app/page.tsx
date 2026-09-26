"use client"; // Indicates this file is a React Client Component, necessary for using hooks like useState and useEffect

// React hooks for managing component state, side effects, memoized values, refs, and events
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

// Recharts components for rendering interactive charts like Area, Line, Tooltips, and Axes
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Lucide-react icons used for UI elements and decorative symbols across the app
import {
  ArrowDownUp, BarChart3, BriefcaseBusiness, Calendar, Check, ChevronRight,
  CircleAlert, Download, LineChart as LineChartIcon, LoaderCircle,
  Moon, Search, Sparkles, Sun, TrendingDown, TrendingUp, WalletCards,
} from "lucide-react";

// Custom UI components styled and pre-configured (likely using Radix UI and Tailwind CSS)
import { Button } from "@/components/ui/button"; // Button component for actions
import { Input } from "@/components/ui/input"; // Input component for user text/number entry
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; // Dropdown selector
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"; // Side sheet for detail views
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"; // Data table components

// Core business logic functions and types for calculating DCA (Dollar Cost Averaging) strategies
import { calculateMonth, calculateDipBuyStrategy, type MonthCalculation, type PriceField, type DipBuyMonthResult } from "@/lib/dca-core.mjs";

// Market data types representing the fetched historical prices
import type { MarketDataResult, MarketPrice } from "@/lib/market-data";

// Sub-components for different views in the app
import { CompanyFinancials } from "@/components/company-financials"; // Financials view
import { PortfolioDashboard } from "@/components/portfolio-dashboard"; // Portfolio view

// Extended type for a month's calculation that includes formatting fields
type MonthRow = MonthCalculation & { month: string; monthLabel: string };

// Allowed keys for sorting the month-by-month table
type SortKey = "purchasePrice" | "month" | "monthlyBudget" | "firstPrice" | "tradingDays" | "dcaAverageCost" | "dcaShares" | "lumpShares" | "differenceShares" | "dcaGain" | "lumpGain" | "dcaEndValue" | "lumpEndValue" | "weeklyAverageCost" | "weeklyShares" | "weeklyGain" | "weeklyEndValue";

// Today's date formatted as YYYY-MM-DD for setting the default end date
const today = new Date().toISOString().slice(0, 10);

// Helper function to calculate a date 'n' years ago from today, formatted as YYYY-MM-DD
const yearsAgo = (years: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };

// Helper function to format numbers as US Dollar currency
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

// Helper function to format money with explicit + or - signs
const signedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;

// Helper function to format share counts with 4 to 6 decimal places
const shares = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);

// Helper function to format a YYYY-MM-DD string into a short date (e.g., Jan 1, 2023)
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Helper function to extract just the month and year from a YYYY-MM string (e.g., January 2023)
const monthName = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Helper function to format a number as a percentage with a + sign if positive
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

/**
 * Generates and triggers a download of a CSV file given an array of objects.
 * @param name The name of the file to download.
 * @param rows The data to convert to CSV format.
 */
function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return; // Exit if no data
  const headers = Object.keys(rows[0]); // Extract column headers from the first object
  // Helper to escape values containing quotes or commas
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  // Construct CSV string: join headers, then join each row's escaped values
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
  // Create a temporary link element to trigger the download
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); // Create blob URL
  link.download = name; // Set filename
  link.click(); // Trigger click to start download
  URL.revokeObjectURL(link.href); // Cleanup blob URL to free memory
}

/**
 * A reusable UI component for displaying a statistic with a label, primary value, and optional details.
 */
function StatCard({ label, value, detail, tone = "neutral", sub }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative"; sub?: string }) {
  return (
    <article className="stat-card">
      <p>{label}</p> {/* Title of the stat */}
      {/* Primary value, styled based on the tone (positive = green, negative = red) */}
      <strong className={tone === "positive" ? "positive" : tone === "negative" ? "negative" : ""}>{value}</strong>
      <span>{detail}</span> {/* Additional context or secondary metric */}
      {/* Optional subtext with lower opacity for extra details */}
      {sub && <span style={{ marginTop: ".2rem", opacity: .7 }}>{sub}</span>}
    </article>
  );
}

/**
 * Renders the content for a specific cell in the month-by-month table based on the given sort key.
 * This abstracts the formatting logic out of the table rendering code.
 */
function monthCell(row: MonthRow, key: SortKey) {
  // Renders the month label and purchase date
  if (key === "month") return <><strong>{row.monthLabel}</strong><span className="cell-sub">{shortDate(row.purchaseDate)}</span></>;
  // Renders the monthly budget for the row as currency
  if (key === "monthlyBudget") return <strong>{money(row.monthlyBudget)}</strong>;
  // Renders purchase price, first price, trading days, etc.
  if (key === "purchasePrice") return money(row.purchasePrice);
  if (key === "firstPrice") return money(row.firstPrice);
  if (key === "tradingDays") return row.tradingDays;
  if (key === "dcaAverageCost") return money(row.dcaAverageCost);
  if (key === "dcaShares") return shares(row.dcaShares);
  if (key === "weeklyAverageCost") return money(row.weeklyAverageCost);
  if (key === "weeklyShares") return shares(row.weeklyShares);
  if (key === "weeklyEndValue") return money(row.weeklyEndValue);
  // Renders gain with color-coding based on positive/negative value
  if (key === "weeklyGain") return <span className={row.weeklyGain >= 0 ? "positive" : "negative"}>{signedMoney(row.weeklyGain)}</span>;
  if (key === "lumpShares") return shares(row.lumpShares);
  if (key === "dcaEndValue") return money(row.dcaEndValue);
  if (key === "lumpEndValue") return money(row.lumpEndValue);
  // Renders the difference in shares, color-coded
  if (key === "differenceShares") return <span className={row.differenceShares >= 0 ? "positive" : "negative"}>{row.differenceShares >= 0 ? "+" : ""}{shares(row.differenceShares)}</span>;
  if (key === "dcaGain") return <span className={row.dcaGain >= 0 ? "positive" : "negative"}>{signedMoney(row.dcaGain)}</span>;
  // Fallback for lumpGain
  return <span className={row.lumpGain >= 0 ? "positive" : "negative"}>{signedMoney(row.lumpGain)}</span>;
}

// ---------- Custom tooltip components for Recharts ----------

// Interface defining the payload structure provided by Recharts to the tooltip
interface PriceTooltipPayload {
  name: string;
  value: number;
  color: string;
}

/**
 * Custom tooltip for the main stock price line chart.
 */
function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: PriceTooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null; // Only render if active and data exists
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label ? shortDate(label) : ""}</p> {/* Shows formatted date */}
      {payload.map((p) => (
        <div key={p.name} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color }} /> {/* Color indicator matching chart line */}
          <span>{p.name}</span>
          <strong>{money(p.value)}</strong> {/* Formats price as currency */}
        </div>
      ))}
    </div>
  );
}

/**
 * Custom tooltip for the average cost comparison chart.
 */
function CostTooltip({ active, payload, label }: { active?: boolean; payload?: PriceTooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label ? shortDate(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.name} className="tooltip-row">
          <span className="tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong>{money(p.value)}</strong>
        </div>
      ))}
      <p className="tooltip-hint">Lower cost per share = better deal</p> {/* Contextual hint for user */}
    </div>
  );
}

/**
 * Custom tooltip for the growth (portfolio value) area chart.
 * Computes and displays the gain compared to the total invested amount.
 */
function GrowthTooltip({ active, payload, label }: { active?: boolean; payload?: PriceTooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  // Extract the baseline 'invested' payload to calculate gains against
  const invested = payload.find((p) => p.name === "Total invested");
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label ? shortDate(label) : ""}</p>
      {/* Map through the portfolio lines, ignoring the invested baseline itself for main rendering */}
      {payload.filter((p) => p.name !== "Total invested").map((p) => {
        // Calculate the absolute gain vs invested amount
        const gain = invested ? p.value - invested.value : null;
        return (
          <div key={p.name} className="tooltip-row-block">
            <div className="tooltip-row">
              <span className="tooltip-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
              <strong>{money(p.value)}</strong>
            </div>
            {/* Show gain/loss below the value, colored accordingly */}
            {gain !== null && (
              <div className="tooltip-gain" style={{ color: gain >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {gain >= 0 ? "▲" : "▼"} {signedMoney(gain)} vs. amount invested
              </div>
            )}
          </div>
        );
      })}
      {/* Separately show the invested amount at the bottom */}
      {invested && <div className="tooltip-row tooltip-invested"><span>💰 Amount invested</span><strong>{money(invested.value)}</strong></div>}
    </div>
  );
}

/**
 * The main application component.
 */
export default function Home() {
  // State variables for user inputs and configurations
  const [ticker, setTicker] = useState("VOO"); // The stock ticker symbol to analyze
  const [start, setStart] = useState(yearsAgo(1)); // Start date for historical data
  const [end, setEnd] = useState(today); // End date for historical data
  const [priceField, setPriceField] = useState<PriceField>("close"); // Which daily price to use (open vs close)
  const [useDividendAdjusted, setUseDividendAdjusted] = useState(true); // Toggle for dividend-adjusted prices
  const [purchaseDay, setPurchaseDay] = useState(1); // Day of the month for "Always In" purchases
  const [monthlyInvestment, setMonthlyInvestment] = useState(""); // Custom fixed monthly dollar amount
  const [dipBuyAmount, setDipBuyAmount] = useState("100"); // Custom amount allocated to dip-buy strategy
  const [dipPercentage, setDipPercentage] = useState("5"); // Percentage drop required to trigger a dip buy
  const [customYears, setCustomYears] = useState(""); // Input field for custom year range buttons
  
  // State for toggling which strategies are shown
  const [methods, setMethods] = useState({ daily: true, weekly: false, start: true });
  const [showDipBuy, setShowDipBuy] = useState(false); // Separately tracks dip-buy toggle

  // Application state for data, loading, errors, and navigation
  const [data, setData] = useState<MarketDataResult | null>(null); // Holds the fetched market data
  const activeRequest = useRef<AbortController | null>(null); // Ref to abort ongoing fetch requests if params change
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string } | null>(null); // Tracks the date range currently applied to the data
  const [loading, setLoading] = useState(true); // Loading indicator
  const [error, setError] = useState(""); // Error message
  const [selected, setSelected] = useState<MonthRow | null>(null); // Tracks which month is selected for the detail sheet (DCA)
  const [selectedDipMonth, setSelectedDipMonth] = useState<DipBuyMonthResult | null>(null); // Tracks selected month for dip-buy sheet
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "month", direction: -1 }); // Sorting state for the data table
  const [dark, setDark] = useState(false); // Dark mode toggle
  const [view, setView] = useState<"portfolio" | "research" | "financials">("portfolio"); // Active top-level view

  // Derived settings for easier use in logic
  const customMonthlyBudget = Number(monthlyInvestment) > 0 ? Number(monthlyInvestment) : undefined;
  const dipBudget = Number(dipBuyAmount) > 0 ? Number(dipBuyAmount) : 100; // Fallback to 100 if invalid
  const dipPercent = Math.min(95, Math.max(.1, Number(dipPercentage) || 5)); // Clamp percentage between 0.1% and 95%
  
  // Override priceField with adjustedClose if dividend reinvestment is toggled on
  const effectivePriceField: PriceField = useDividendAdjusted ? "adjustedClose" : priceField;

  /**
   * Fetches historical data from the internal API route based on current state.
   */
  const load = useCallback(async (nextTicker = ticker, nextStart = start, nextEnd = end) => {
    // Abort any existing in-flight request to prevent race conditions
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    
    // Reset state before fetching
    setLoading(true); setError(""); setData(null); setAppliedRange(null);
    setSelected(null); setSelectedDipMonth(null);
    try {
      // Call the Next.js API endpoint with ticker and dates
      const response = await fetch(`/api/market?ticker=${encodeURIComponent(nextTicker.trim().toUpperCase())}&start=${nextStart}&end=${nextEnd}`, { signal: controller.signal });
      const payload = await response.json() as MarketDataResult & { error?: string };
      
      // If the request was aborted or a new one started, ignore this response
      if (activeRequest.current !== controller || controller.signal.aborted) return;
      
      // Throw if the API returned an error status or explicitly included an error message
      if (!response.ok) throw new Error(payload.error || "Historical data could not be loaded.");
      
      // Set the retrieved data and mark the applied range
      setData(payload); setAppliedRange({ start: nextStart, end: nextEnd });
    } catch (cause) { 
      // Handle errors only if this is still the active request
      if (activeRequest.current === controller && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Historical data could not be loaded."); 
    } finally { 
      // Stop loading indicator
      if (activeRequest.current === controller && !controller.signal.aborted) setLoading(false); 
    }
  }, [ticker, start, end]);

  // Initial data load when the component mounts
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load("VOO", start, end); return () => activeRequest.current?.abort(); }, []);
  
  // Effect to sync the document body's data-theme attribute with the dark mode state
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  /**
   * Memoized computation of month-by-month statistics for standard DCA and lump sum strategies.
   * Groups daily prices by month, then passes them to `calculateMonth` from dca-core.
   */
  const months = useMemo<MonthRow[]>(() => {
    if (!data) return [];
    const groups = new Map<string, MarketPrice[]>();
    // Group raw market data rows into buckets based on the YYYY-MM prefix
    data.prices.forEach((row) => { const key = row.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), row]); });
    // Process each group into a full MonthRow summary object
    return [...groups.entries()].map(([month, rows]) => ({ month, monthLabel: monthName(month), ...calculateMonth(rows, effectivePriceField, customMonthlyBudget, purchaseDay) }));
  }, [data, effectivePriceField, customMonthlyBudget, purchaseDay]);

  /**
   * Memoized computation of the Dip-Buy strategy.
   * This is calculated across all months at once because the cash reserve rolls over from month to month.
   */
  const dipBuyResult = useMemo(() => {
    if (!data) return null;
    const groups = new Map<string, MarketPrice[]>();
    // Group prices by month again for the dip strategy
    data.prices.forEach((row) => { const key = row.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), row]); });
    const monthGroups = [...groups.entries()].map(([month, prices]) => ({ month, prices }));
    if (!monthGroups.length) return null;
    // Call the core library to simulate the stateful dip-buy logic
    return calculateDipBuyStrategy(monthGroups, effectivePriceField, dipBudget, dipPercent);
  }, [data, effectivePriceField, dipBudget, dipPercent]);

  /**
   * Calculates a simulated High-Yield Savings Account (HYSA) return for the undeployed cash in the dip strategy.
   * Assumes a flat 3% APY compounded monthly.
   */
  const dipHysaValue = useMemo(() => {
    if (!dipBuyResult) return 0;
    const monthlyRate = 0.03 / 12; // 3% annual yield divided by 12 months
    let hysaBalance = 0;
    for (const m of dipBuyResult.monthResults) {
      hysaBalance += m.reserveAdded;      // Add the unspent 50% for this month to the balance
      hysaBalance *= (1 + monthlyRate);   // Apply one month of interest
      if (m.dipOccurred) {
        hysaBalance = 0;                  // If a dip occurs, all cash is deployed into the market; balance drops to 0
      }
    }
    return hysaBalance; // Return final balance today
  }, [dipBuyResult]);

  /**
   * Memoized cumulative calculations for plotting on the charts.
   * Steps through the computed months chronologically and sums up investments and shares.
   */
  const cumulative = useMemo(() => {
    let invested = 0, dcaShares = 0, weeklyShares = 0, lumpShares = 0;
    return months.map((row) => {
      invested += row.monthlyBudget;
      dcaShares += row.dcaShares;
      weeklyShares += row.weeklyShares;
      lumpShares += row.lumpShares;
      return {
        date: row.lastDate,
        marketPrice: row.lastPrice,
        // Average cost = total dollars spent / total shares owned
        averageCost: invested / dcaShares,
        weeklyAverageCost: invested / weeklyShares,
        startAverageCost: invested / lumpShares,
        // Current value = total shares owned * current market price
        dcaValue: dcaShares * row.lastPrice,
        weeklyValue: weeklyShares * row.lastPrice,
        lumpValue: lumpShares * row.lastPrice,
        invested,
        dcaShares,
        weeklyShares,
        lumpShares,
      };
    });
  }, [months]);

  /**
   * Extends the cumulative chart data array with the dip-buy strategy metrics,
   * matching them by date so all lines can share the same x-axis on the chart.
   */
  const cumulativeWithDip = useMemo(() => {
    // If dip buy not active, append undefined to keep data shape consistent
    if (!dipBuyResult) return cumulative.map((r) => ({ ...r, dipValue: undefined, dipInvested: undefined, dipAverageCost: undefined }));
    
    // Map the dip strategy month results by their last date for O(1) lookups
    const dipByDate = new Map<string, (typeof dipBuyResult.monthResults)[number]>();
    for (const m of dipBuyResult.monthResults) {
      dipByDate.set(m.lastDate, m);
    }
    
    // Merge dip metrics into the main cumulative array
    return cumulative.map((r) => {
      const mData = dipByDate.get(r.date);
      const dipShares = mData ? mData.totalSharesSoFar : undefined;
      const dipValue = dipShares !== undefined ? dipShares * r.marketPrice : undefined;
      const dipInvested = mData ? mData.totalInvestedSoFar : undefined;
      const dipAverageCost = mData && mData.totalSharesSoFar > 0 ? mData.totalInvestedSoFar / mData.totalSharesSoFar : undefined;
      return { ...r, dipValue, dipInvested, dipAverageCost };
    });
  }, [cumulative, dipBuyResult]);

  /**
   * Prepares the simple stock price timeline chart.
   * Decimates (samples) the data if there are too many points to improve rendering performance.
   */
  const priceChart = useMemo(() => {
    if (!data) return [];
    const first = data.prices[0]?.close || 1; // Used to calculate percent return
    // Target ~300 points on the chart. Calculate step size.
    const step = Math.max(1, Math.ceil(data.prices.length / 300));
    return data.prices
      // Filter out points to downsample, but always keep the very last point
      .filter((_, i) => i % step === 0 || i === data.prices.length - 1)
      .map((row) => ({
        date: row.date,
        price: row.close,
        returnPct: (row.close / first - 1) * 100, // Total percentage growth since day 1
      }));
  }, [data]);

  // Extract the very first price point for baseline reference line on the chart
  const startingPrice = priceChart[0]?.price ?? 0;

  // The very last row of the cumulative array represents the present-day final scorecard
  const summary = cumulative.at(-1);

  // Sorting logic for the month-by-month table
  const sortedMonths = useMemo(() => [...months].sort((a, b) => { 
    const av = a[sort.key], bv = b[sort.key]; 
    // String comparison vs number comparison based on type
    return (typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv)) * sort.direction; 
  }), [months, sort]);

  /**
   * Dynamic column definitions for the month table based on which strategies the user has toggled on.
   */
  const monthColumns = useMemo(() => {
    const columns: { key: SortKey; label: string }[] = [{ key: "month", label: "Month" }, { key: "monthlyBudget", label: "Monthly amount" }, { key: "purchasePrice", label: "Monthly buy price" }, { key: "tradingDays", label: "Days" }];
    // Append DCA columns if daily is checked
    if (methods.daily) columns.push({ key: "dcaAverageCost", label: "DCA cost" }, { key: "dcaShares", label: "DCA shares" }, { key: "dcaGain", label: "DCA gain/loss" }, { key: "dcaEndValue", label: "DCA ended at" });
    // Append Weekly columns if weekly is checked
    if (methods.weekly) columns.push({ key: "weeklyAverageCost", label: "Weekly cost" }, { key: "weeklyShares", label: "Weekly shares" }, { key: "weeklyGain", label: "Weekly gain/loss" }, { key: "weeklyEndValue", label: "Weekly ended at" });
    // Append Lump sum columns if start is checked
    if (methods.start) columns.push({ key: "lumpShares", label: "Monthly shares" }, { key: "lumpGain", label: "Monthly gain/loss" }, { key: "lumpEndValue", label: "Monthly ended at" });
    // If both daily and start are selected, show the direct diff comparison column
    if (methods.daily && methods.start) columns.push({ key: "differenceShares", label: "Share difference" });
    return columns;
  }, [methods]);

  /**
   * Evaluates the different strategies to determine the "winner" and formats a plain-english explanation.
   * Only compares the strategies that are currently toggled ON.
   */
  const researchSummary = useMemo(() => {
    if (!summary || !months.length) return null;
    const dcaAdvantage = summary.dcaValue - summary.lumpValue;
    const dcaWins = months.filter((row) => row.differenceShares > 0).length; // Months where Daily got more shares
    const firstDayWins = months.filter((row) => row.differenceShares < 0).length; // Months where Monthly got more shares
    const tieMonths = months.length - dcaWins - firstDayWins;
    
    // Construct list of active strategies and their final dollar values
    const candidates = [
      methods.start ? { label: "Monthly buy", value: summary.lumpValue } : null,
      methods.weekly ? { label: "Weekly DCA", value: summary.weeklyValue } : null,
      methods.daily ? { label: "Daily DCA", value: summary.dcaValue } : null,
    ].filter((item): item is { label: string; value: number } => Boolean(item)).sort((a,b)=>b.value-a.value); // Sort highest to lowest
    
    const leader = candidates[0]; 
    const runnerUp = candidates[1];
    
    // Format sentence based on if there are multiple methods to compare or just one
    const winner = candidates.length > 1 ? `${leader.label} finished highest` : `Your ${leader.label} result`;
    const why = candidates.length > 1
      ? `${leader.label} ended at ${money(leader.value)}, ${money(Math.max(0, leader.value-(runnerUp?.value||0)))} above the next selected method. Daily purchases beat monthly buy shares in ${dcaWins} of ${months.length} months; monthly buy won ${firstDayWins}, with ${tieMonths} ties.`
      : `You invested ${money(summary.invested)} using ${leader.label} and ended at ${money(leader.value)}.`;
      
    // Return structured object with the verdict
    return { dcaAdvantage, winner, why, dcaWins, firstDayWins, leader, difference: runnerUp ? leader.value-runnerUp.value : leader.value-summary.invested };
  }, [methods, months, summary]);

  /**
   * Helper to quickly set the date range back a certain number of years from today.
   */
  const setRange = (yearsBack: number | "max") => {
    const nextEnd = today; 
    const d = new Date();
    // If 'max', use 1900. Otherwise subtract years. (The API handles bounding to actual available data)
    const nextStart = yearsBack === "max" ? "1900-01-01" : (d.setFullYear(d.getFullYear() - yearsBack), d.toISOString().slice(0, 10));
    setStart(nextStart); setEnd(nextEnd); void load(ticker, nextStart, nextEnd);
  };
  
  // Triggers setRange using the value from the custom years input field
  const applyCustomYears = () => { const value = Number(customYears); if (customYears.trim() && Number.isInteger(value) && value >= 1 && value <= 100) setRange(value); };
  
  // Form submission handler for the main search bar
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void load(); };
  
  // Toggles the sort direction for a specific table column, or switches sorting to a new column
  const changeSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === 1 ? -1 : 1 : 1 }));
  
  // Toggles visibility of a specific method in the tables and charts. Ensures at least one is always active.
  const toggleMethod = (key: "daily" | "weekly" | "start") => setMethods((current) => current[key] && Object.values(current).filter(Boolean).length === 1 ? current : { ...current, [key]: !current[key] });

  // Registers the component with an external model context if present, allowing external control/scripts to run analysis
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "run_dca_research", title: "Run DCA research", description: "Load historical prices for a U.S. stock or ETF and update the visible daily-versus-monthly buy analysis.", inputSchema: { type: "object", properties: { ticker: { type: "string" }, start: { type: "string" }, end: { type: "string" }, monthlyInvestment: { type: "number", minimum: 0, description: "Optional dollars invested per month. Omit to use the first-day share-equivalent default." } }, required: ["ticker", "start", "end"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { const value = input as { ticker?: string; start?: string; end?: string; monthlyInvestment?: number }; if (!value.ticker || !/^\d{4}-\d{2}-\d{2}$/.test(value.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.end || "")) throw new Error("Ticker, start, and end are required."); setTicker(value.ticker.toUpperCase()); setStart(value.start!); setEnd(value.end!); setMonthlyInvestment(value.monthlyInvestment && value.monthlyInvestment > 0 ? String(value.monthlyInvestment) : ""); await load(value.ticker, value.start!, value.end!); return { status: "loaded", ticker: value.ticker.toUpperCase(), start: value.start, end: value.end, monthlyInvestment: value.monthlyInvestment || null }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [load]);

  // Extract final gain metrics for all strategies for display in the scenario cards
  const dipGain = dipBuyResult ? dipBuyResult.endValue - dipBuyResult.totalInvested : 0;
  const alwaysInEndValue = summary?.lumpValue ?? 0;
  const alwaysInInvested = summary?.invested ?? 0;
  const alwaysInGain = alwaysInEndValue - alwaysInInvested;
  const dcaEndValue = summary?.dcaValue ?? 0;
  const dcaInvested = summary?.invested ?? 0;
  const dcaGain = dcaEndValue - dcaInvested;
  const weeklyEndValue = summary?.weeklyValue ?? 0;
  const weeklyInvested = summary?.invested ?? 0;
  const weeklyGain = weeklyEndValue - weeklyInvested;

  return <main className="app-shell">
    {/* Global Header / Navigation */}
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><TrendingUp /></span>
        <div><strong>Portfolio Lab</strong><span>Your investment workspace</span></div>
      </div>
      {/* View switching tabs */}
      <nav className="view-switch" aria-label="Choose a workspace">
        <button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}><BriefcaseBusiness/> My portfolio</button>
        <button className={view === "research" ? "active" : ""} onClick={() => setView("research")}><LineChartIcon/> Stock research</button>
        <button className={view === "financials" ? "active" : ""} onClick={() => setView("financials")}><BarChart3/> Financials</button>
      </nav>
      {/* Actions like Dark Mode toggle */}
      <div className="header-actions">
        <span className="live-pill"><i /> Market data on demand</span>
        <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button>
      </div>
    </header>
    
    {/* Render the appropriate view component */}
    {view === "portfolio" ? <PortfolioDashboard /> : view === "financials" ? <CompanyFinancials /> : <>
    <section className="workspace">
      {/* Page Title and Ticker Details */}
      <div className="page-heading">
        <div>
          <span className="eyebrow"><Sparkles /> One stock or ETF at a time</span>
          <h1>A smarter lens on every investment.</h1>
          <p>Pick a ticker and time period. Compare monthly buy, weekly, daily, or a custom dip-wait strategy.</p>
        </div>
        {/* Chip showing current ticker price and details if data is loaded */}
        {data && <div className="security-chip"><div><strong>{data.ticker}</strong><span>{data.name}</span></div><strong>{money(data.prices.at(-1)?.close || 0)}</strong><span>{shortDate(data.prices.at(-1)?.date || "")}</span></div>}
      </div>
      
      {/* Input controls block */}
      <section className="control-panel">
        <form onSubmit={onSubmit} className="search-control">
          <label htmlFor="ticker">Ticker</label>
          <div className="search-box"><Search /><Input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="Enter ticker" autoComplete="off"/><Button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : "Analyze"}</Button></div>
        </form>
        <div className="date-control"><label htmlFor="start">Start date</label><Input id="start" type="date" value={start} min="1900-01-01" max={end} onChange={(event) => setStart(event.target.value)} /></div>
        <div className="date-control"><label htmlFor="end">End date</label><Input id="end" type="date" value={end} min="1900-01-01" max={today} onChange={(event) => setEnd(event.target.value)} /></div>
        <div className="date-control purchase-control">
          <label>Purchase price</label>
          <Select value={priceField} onValueChange={(value) => setPriceField(value as PriceField)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="close">Daily close</SelectItem><SelectItem value="open">Daily open</SelectItem></SelectContent></Select>
        </div>
        <div className="date-control">
          <label htmlFor="purchase-day">Monthly purchase day</label>
          <Select value={String(purchaseDay)} onValueChange={(value) => { setPurchaseDay(Number(value)); setSelected(null); }}>
            <SelectTrigger id="purchase-day" aria-describedby="purchase-day-rule"><SelectValue/></SelectTrigger>
            <SelectContent>{Array.from({ length: 31 }, (_, index) => index + 1).map(day => <SelectItem key={day} value={String(day)}>Day {day}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="date-control monthly-control">
          <label htmlFor="monthly-investment">Monthly amount <em>optional</em></label>
          <div className="money-input"><span>$</span><Input id="monthly-investment" type="number" min="0" step="25" inputMode="decimal" value={monthlyInvestment} onChange={(event)=>setMonthlyInvestment(event.target.value)} placeholder="Default"/></div>
        </div>
      </section>

      {/* ── Strategy toggles ── */}
      <section className="investment-options" aria-label="Optional investment details">
        <div className="method-options">
          <div><strong>Methods to show</strong><span>Mix and match to compare strategies side by side.</span></div>
          <button type="button" aria-pressed={methods.daily} className={methods.daily?"active":""} onClick={()=>toggleMethod("daily")}><i>{methods.daily&&<Check/>}</i><span><strong>Daily DCA</strong><small>Split the monthly amount across every trading day.</small></span></button>
          <button type="button" aria-pressed={methods.weekly} className={methods.weekly?"active":""} onClick={()=>toggleMethod("weekly")}><i>{methods.weekly&&<Check/>}</i><span><strong>Weekly DCA</strong><small>Split the monthly amount across the first trading day of each week.</small></span></button>
          <button type="button" aria-pressed={methods.start} className={methods.start?"active":""} onClick={()=>toggleMethod("start")}><i>{methods.start&&<Check/>}</i><span><strong>Always In (Monthly buy)</strong><small>Invest 100% on day {purchaseDay} of every month.</small></span></button>
          <button type="button" aria-pressed={showDipBuy} className={showDipBuy?"active dip-active":""} onClick={()=>setShowDipBuy((v)=>!v)}><i>{showDipBuy&&<Check/>}</i><span><strong>Dip-Wait 50/50</strong><small>50% in on day 1. Save the rest until the stock drops your chosen percentage.</small></span></button>
        </div>
        {/* Conditional controls when Dip-Buy is toggled on */}
        {showDipBuy && (
          <div className="dip-budget-row">
            <TrendingDown style={{width:16,color:"var(--primary)"}}/>
            <span><strong>Dip-Wait settings:</strong> 50% goes in on the first trading day; the other 50% waits until the stock falls {dipPercent}% from that month&apos;s starting price.</span>
            <div className="money-input" style={{width:140}}>
              <span>$</span>
              <Input type="number" min="0" step="25" inputMode="decimal" value={dipBuyAmount} onChange={(e)=>setDipBuyAmount(e.target.value)} placeholder="100"/>
            </div>
            <label className="dip-percent-input"><span>Drop</span><Input aria-label="Dip trigger percentage" type="number" min="0.1" max="95" step="0.5" inputMode="decimal" value={dipPercentage} onChange={(e)=>setDipPercentage(e.target.value)}/><b>%</b></label>
          </div>
        )}
        <div className="dividend-toggle-row">
          <label className="div-toggle-label">
            <input type="checkbox" checked={useDividendAdjusted} onChange={(e) => setUseDividendAdjusted(e.target.checked)} />
            <span className="div-toggle-icon">📈</span>
            <span><strong>Assume dividends reinvested:</strong> uses dividend-adjusted prices so dividend income is automatically counted in all results. Applies to all strategies.</span>
          </label>
        </div>
        <p>{customMonthlyBudget ? `Every month now uses ${money(customMonthlyBudget)} for a fair, same-dollar comparison.` : "No monthly amount entered: each month uses the original one-share-equivalent default automatically."}</p>
      </section>

      {/* Helper text explaining rules and quick range buttons */}
      <p id="purchase-day-rule" className="purchase-day-rule">Monthly buys use day {purchaseDay}, or the next available trading day in that month. If none follows, use the last available trading day. Partial months use only dates in your research range. This setting applies to Always In; Dip-Wait keeps its first-day schedule.</p>
      <div className="quick-ranges">
        <strong>Years:</strong>{[[1,"1"],[5,"5"],[10,"10"],[20,"20"],["max","MAX"]].map(([value,label]) => <button key={label} onClick={() => setRange(value as number | "max")}>{label}</button>)}
        <label className="custom-range"><Input aria-label="Custom number of years" type="number" min="1" max="100" step="1" value={customYears} onChange={(event)=>setCustomYears(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")applyCustomYears()}} placeholder="Custom"/><Button type="button" variant="outline" size="sm" disabled={!customYears.trim() || !Number.isInteger(Number(customYears)) || Number(customYears) < 1 || Number(customYears) > 100} onClick={applyCustomYears}>Apply</Button></label>
        <span>{useDividendAdjusted ? "📈 Dividend-adjusted prices: dividends are included in all returns." : priceField === "close" ? "Close uses each trading day's closing price." : "Open uses each trading day's opening price."}</span>
      </div>
      
      {/* Error state display */}
      {error && <div className="error-banner"><CircleAlert /><div><strong>Couldn&apos;t load this analysis</strong><span>{error}</span></div><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
      
      {/* Loading indicator */}
      {loading && <div className="plain-note" role="status"><LoaderCircle className="spin"/><span>Updating analysis for {start} through {end}…</span></div>}
      
      {/* Status string showing applied date range */}
      {data && appliedRange && <p className="range-status" role="status">Showing {data.ticker}: {shortDate(appliedRange.start)} – {shortDate(appliedRange.end)} · Available prices: {shortDate(data.prices[0].date)} – {shortDate(data.prices.at(-1)!.date)}{(start !== appliedRange.start || end !== appliedRange.end || ticker.trim().toUpperCase() !== data.ticker) ? " · Inputs changed. Select Analyze to apply." : ""}</p>}
      
      {/* Render main research output if no errors, not loading, and data exists */}
      {!error && !loading && data && <>
        {/* Main textual verdict box indicating the "winner" */}
        {researchSummary && summary && <section className={`research-verdict ${researchSummary.leader.value >= summary.invested ? "dca-win" : "early-win"}`}><div><span>Plain-English answer</span><h2>{researchSummary.winner}</h2><p>{researchSummary.why}</p></div><div className="verdict-number"><span>{Object.values(methods).filter(Boolean).length>1?"Lead over next method":"Gain or loss"}</span><strong className={researchSummary.difference>=0?"positive":"negative"}>{signedMoney(researchSummary.difference)}</strong><small>{researchSummary.leader.label} · ending value {money(researchSummary.leader.value)}</small></div></section>}

        {/* ── Dip-buy verdict banner ── */}
        {showDipBuy && dipBuyResult && (
          <section className="research-verdict dip-win">
            <div>
              <span>Dip-Wait 50/50 result</span>
              <h2>{dipGain >= 0 ? "Your dip-wait strategy made money" : "Your dip-wait strategy is down"}</h2>
              <p>
                You committed {money(dipBuyResult.totalCashCommitted)} over {dipBuyResult.monthResults.length} months ({money(dipBudget)}/month).
                Of that, <strong>{money(dipBuyResult.totalInvested)}</strong> actually went into the market
                ({dipBuyResult.dipMonthCount > 0 ? `a ${dipPercent}% dip occurred ${dipBuyResult.dipMonthCount} time${dipBuyResult.dipMonthCount > 1 ? "s" : ""}: extra cash deployed then` : `no ${dipPercent}% dip occurred, so only the 50% first-day amounts were invested`}).
                The remaining <strong>{money(dipBuyResult.totalReserveUndeployed)}</strong> is still sitting as cash.
              </p>
            </div>
            <div className="verdict-number">
              <span>Portfolio value</span>
              <strong className={dipGain >= 0 ? "positive" : "negative"}>{money(dipBuyResult.endValue)}</strong>
              <small>{signedMoney(dipGain)} vs. money put in market</small>
            </div>
          </section>
        )}

        {/* ── Scenario comparison cards ── */}
        <section className="scenario-compare-grid">
          {methods.start && (
            <div className="scenario-box always-in-box">
              <span className="scenario-label"><Calendar style={{width:14,display:"inline",verticalAlign:"middle"}}/> Scenario 1: Always In (Monthly buy)</span>
              <p className="scenario-desc">You invest 100% of your budget on day {purchaseDay} of every month, adjusted to an available trading day using the rule above.</p>
              <div className="scenario-facts">
                <div>
                  <span>Total invested</span>
                  <strong>{money(alwaysInInvested)}</strong>
                  <em className="fact-explain">The real dollars you put in, added up across all months.</em>
                </div>
                <div>
                  <span>📊 Shares accumulated</span>
                  <strong>{summary ? shares(summary.lumpShares) : "-"}</strong>
                  <em className="fact-explain">Total shares bought over the period.</em>
                </div>
                <div>
                  <span>⚖️ Avg cost per share</span>
                  <strong>{summary && summary.lumpShares > 0 ? money(alwaysInInvested / summary.lumpShares) : "-"}</strong>
                  <em className="fact-explain">Your average purchase price across all months.</em>
                </div>
                <div>
                  <span>Portfolio value today</span>
                  <strong className={alwaysInGain >= 0 ? "positive" : "negative"}>{money(alwaysInEndValue)}</strong>
                  <em className="fact-explain">What all your shares are worth right now at the current price.</em>
                </div>
                <div>
                  <span>Gain / Loss</span>
                  <strong className={alwaysInGain >= 0 ? "positive" : "negative"}>{signedMoney(alwaysInGain)}</strong>
                  <em className="fact-explain">Portfolio value minus what you put in. Green = profit, red = loss.</em>
                </div>
                <div>
                  <span>Total return %</span>
                  <strong className={alwaysInGain >= 0 ? "positive" : "negative"}>{pct((alwaysInGain / alwaysInInvested) * 100)}</strong>
                  <em className="fact-explain">How much your money grew as a percentage. +10% means every $100 became $110.</em>
                </div>
              </div>
            </div>
          )}

          {showDipBuy && dipBuyResult && (
            <div className="scenario-box dip-wait-box">
              <span className="scenario-label"><TrendingDown style={{width:14,display:"inline",verticalAlign:"middle"}}/> Scenario 2: Dip-Wait 50/50</span>
              <p className="scenario-desc">50% goes in on day 1 every month. The other 50% accumulates as cash and waits. The moment the stock drops {dipPercent}% in any month, all the saved-up cash is deployed at that lower price.</p>
              <div className="scenario-facts">
                <div>
                  <span>💼 Cash committed (total budget)</span>
                  <strong>{money(dipBuyResult.totalCashCommitted)}</strong>
                  <em className="fact-explain">Your full budget set aside: {money(dipBudget)}/month × {dipBuyResult.monthResults.length} months = {money(dipBudget * dipBuyResult.monthResults.length)}. This matches what Scenario 1 also invested.</em>
                </div>
                <div>
                  <span>✅ Actually invested (in market)</span>
                  <strong>{money(dipBuyResult.totalInvested)}</strong>
                  <em className="fact-explain">Money that actually <strong>bought shares</strong>: the 50% day-1 each month, PLUS all reserve deployed during {dipBuyResult.dipMonthCount} dip{dipBuyResult.dipMonthCount !== 1 ? "s" : ""}.</em>
                </div>
                <div>
                  <span>📊 Shares accumulated</span>
                  <strong>{shares(dipBuyResult.totalShares)}</strong>
                  <em className="fact-explain">Total shares bought (day-1 buys + dip buys).</em>
                </div>
                <div>
                  <span>⚖️ Avg cost per share</span>
                  <strong>{dipBuyResult.totalShares > 0 ? money(dipBuyResult.totalInvested / dipBuyResult.totalShares) : "-"}</strong>
                  <em className="fact-explain">Your average purchase price for the shares you actually bought.</em>
                </div>
                <div>
                  <span>💰 Still sitting as cash (undeployed)</span>
                  <strong style={{color:"var(--muted-foreground)"}}>{money(dipBuyResult.totalReserveUndeployed)}</strong>
                  <em className="fact-explain">
                    Cash waiting for a dip that never came. It&apos;s still yours, unspent.
                    {dipHysaValue > 0 && <><br/><span className="hysa-note">(At 3% APY in a HYSA, this would now be <strong>{money(dipHysaValue)}</strong>)</span></>}
                  </em>
                </div>
                <div>
                  <span>📈 Portfolio value today (shares only)</span>
                  <strong className={dipGain >= 0 ? "positive" : "negative"}>{money(dipBuyResult.endValue)}</strong>
                  <em className="fact-explain">What your shares are worth right now. Does NOT include the cash reserve above. Add them together for your true total net position.</em>
                </div>
                <div>
                  <span>Gain / Loss (on invested money)</span>
                  <strong className={dipGain >= 0 ? "positive" : "negative"}>{signedMoney(dipGain)}</strong>
                  <em className="fact-explain">Portfolio value minus what actually went into the market. Green = profit on deployed cash, red = loss.</em>
                </div>
                <div>
                  <span>📊 Return % (on invested money)</span>
                  <strong className={dipGain >= 0 ? "positive" : "negative"}>{dipBuyResult.totalInvested > 0 ? pct((dipGain / dipBuyResult.totalInvested) * 100) : "-"}</strong>
                  <em className="fact-explain">How much the money that actually entered the market grew. Compare to Scenario 1&apos;s return % to see which strategy performed better per dollar invested.</em>
                </div>
              </div>
            </div>
          )}

          {methods.daily && summary && (
            <div className="scenario-box daily-dca-box">
              <span className="scenario-label"><Calendar style={{width:14,display:"inline",verticalAlign:"middle"}}/> Scenario 3: Daily DCA</span>
              <p className="scenario-desc">You split your budget evenly across every single trading day. This smooths out volatility completely, buying a tiny bit every day.</p>
              <div className="scenario-facts">
                <div>
                  <span>✅ Total invested</span>
                  <strong>{money(dcaInvested)}</strong>
                  <em className="fact-explain">The real dollars you put in, added up across all days.</em>
                </div>
                <div>
                  <span>📊 Shares accumulated</span>
                  <strong>{shares(summary.dcaShares)}</strong>
                  <em className="fact-explain">Total (including fractional) shares bought over the period.</em>
                </div>
                <div>
                  <span>⚖️ Avg cost per share</span>
                  <strong>{summary.dcaShares > 0 ? money(dcaInvested / summary.dcaShares) : "-"}</strong>
                  <em className="fact-explain">Your average purchase price.</em>
                </div>
                <div>
                  <span>📈 Portfolio value today</span>
                  <strong className={dcaGain >= 0 ? "positive" : "negative"}>{money(dcaEndValue)}</strong>
                  <em className="fact-explain">What all your shares are worth right now at the current price.</em>
                </div>
                <div>
                  <span>Gain / Loss</span>
                  <strong className={dcaGain >= 0 ? "positive" : "negative"}>{signedMoney(dcaGain)}</strong>
                  <em className="fact-explain">Portfolio value minus what you put in. Green = profit, red = loss.</em>
                </div>
                <div>
                  <span>Return %</span>
                  <strong className={dcaGain >= 0 ? "positive" : "negative"}>{pct((dcaGain / dcaInvested) * 100)}</strong>
                  <em className="fact-explain">How much your money grew as a percentage. +10% means every $100 became $110.</em>
                </div>
              </div>
            </div>
          )}
          {methods.weekly && summary && (
            <div className="scenario-box weekly-dca-box">
              <span className="scenario-label"><Calendar style={{width:14,display:"inline",verticalAlign:"middle"}}/> Scenario 4: Weekly DCA</span>
              <p className="scenario-desc">Your monthly budget is divided equally across the first available trading day of each calendar week.</p>
              <div className="scenario-facts">
                <div><span>✅ Total invested</span><strong>{money(weeklyInvested)}</strong><em className="fact-explain">The same monthly budget as the other DCA methods.</em></div>
                <div><span>📊 Shares accumulated</span><strong>{shares(summary.weeklyShares)}</strong><em className="fact-explain">Total fractional shares bought through weekly purchases.</em></div>
                <div><span>⚖️ Avg cost per share</span><strong>{summary.weeklyShares > 0 ? money(weeklyInvested / summary.weeklyShares) : "-"}</strong><em className="fact-explain">Your dollar-weighted average weekly purchase price.</em></div>
                <div><span>📈 Portfolio value today</span><strong className={weeklyGain >= 0 ? "positive" : "negative"}>{money(weeklyEndValue)}</strong><em className="fact-explain">What the weekly purchases are worth at the latest price.</em></div>
                <div><span>Gain / Loss</span><strong className={weeklyGain >= 0 ? "positive" : "negative"}>{signedMoney(weeklyGain)}</strong><em className="fact-explain">Portfolio value minus the amount invested.</em></div>
                <div><span>Return %</span><strong className={weeklyGain >= 0 ? "positive" : "negative"}>{weeklyInvested > 0 ? pct((weeklyGain / weeklyInvested) * 100) : "-"}</strong><em className="fact-explain">The total return from weekly purchases.</em></div>
              </div>
            </div>
          )}
        </section>

        {/* ── Charts ── */}
        <section className="chart-grid">

          {/* Chart 1: Stock price over time */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Market history</span>
                <h2>Stock price over time</h2>
                <p>The green line is the stock price each day. The dashed line shows where the price started, anything above that line is a gain.</p>
              </div>
              <BarChart3 />
            </div>
            <div className="chart-wrap" style={{ position: "relative" }}>
              {/* Highlight badge showing total price growth */}
              {priceChart.length > 0 && (
                <div style={{position: "absolute", top: 12, right: 16, background: "color-mix(in srgb, var(--card) 85%, transparent)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontSize: 12, zIndex: 10, backdropFilter: "blur(12px)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)"}}>
                  <span style={{color: "var(--foreground)"}}>Total growth: </span>
                  <strong className={(priceChart.at(-1)?.price ?? startingPrice) >= startingPrice ? "positive" : "negative"} style={{fontSize: 12}}>{pct(((priceChart.at(-1)?.price || 1) - startingPrice) / startingPrice * 100)}</strong>
                </div>
              )}
              {loading ? <div className="chart-loading"><LoaderCircle className="spin" /> Loading trading days…</div> :
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceChart} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={.35}/>
                      <stop offset="40%" stopColor="var(--chart-1)" stopOpacity={.12}/>
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--grid)"/>
                  <XAxis axisLine={false} tickLine={false} tickMargin={12} dataKey="date" minTickGap={40} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}/>
                  <YAxis axisLine={false} tickLine={false} tickMargin={10} domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={58}/>
                  <ReferenceLine y={startingPrice} stroke="var(--chart-2)" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Where you started", fill: "var(--chart-2)", fontSize: 12, position: "insideTopLeft" }}/>
                  <Tooltip content={<PriceTooltip />}/>
                  <Area type="monotone" dataKey="price" name="Stock price" stroke="var(--chart-1)" strokeWidth={2.8} fill="url(#priceFill)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>}
            </div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                <span><i className="ci-dot" style={{background:"var(--chart-1)"}}/> <strong>Green line</strong> = the stock price on each day</span>
                <span><i className="ci-dash" style={{background:"var(--chart-2)"}}/> <strong>Blue dashed line</strong> = the price on the very first day you started investing</span>
              </div>
              <div className="interpret-takeaway">
                <strong>📖 How to read this:</strong> Over the selected time period, the stock&apos;s price changed from <strong>{money(startingPrice)}</strong> to <strong>{money(priceChart.at(-1)?.price || 0)}</strong>, a total growth of <strong>{pct(((priceChart.at(-1)?.price || 1) - startingPrice) / startingPrice * 100)}</strong>. The green line shows that journey.
              </div>
            </div>
          </article>

          {/* Chart 2: Average cost per share (lower is better) */}
          <article className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <span>Your average purchase price</span>
                <h2>What you paid per share (lower is better)</h2>
                <p>The lower a line is, the cheaper that strategy was buying shares on average. Cheaper shares = more profit when they go up.</p>
              </div>
              <WalletCards />
            </div>
            <div className="chart-wrap" style={{ position: "relative" }}>
              {/* Computed badge declaring the strategy with the lowest cost */}
              {(() => {
                let best = "";
                let min = Infinity;
                if (methods.start && summary && summary.lumpShares > 0) { const val = summary.invested/summary.lumpShares; if (val < min) { min = val; best = "Always-In"; } }
                if (methods.daily && summary && summary.dcaShares > 0) { const val = summary.invested/summary.dcaShares; if (val < min) { min = val; best = "Daily DCA"; } }
                if (methods.weekly && summary && summary.weeklyShares > 0) { const val = summary.invested/summary.weeklyShares; if (val < min) { min = val; best = "Weekly DCA"; } }
                if (showDipBuy && dipBuyResult && dipBuyResult.totalShares > 0) { const val = dipBuyResult.totalInvested/dipBuyResult.totalShares; if (val < min) { min = val; best = "Dip-Wait"; } }
                if (min === Infinity) return null;
                return (
                  <div style={{position: "absolute", top: 12, left: 24, background: "color-mix(in srgb, var(--card) 90%, transparent)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", fontSize: 12, zIndex: 10, backdropFilter: "blur(12px)", boxShadow: "0 2px 8px rgba(0,0,0,0.06)"}}>
                    <span style={{color: "var(--muted-foreground)"}}>Cheapest avg share: </span>
                    <strong style={{color: "var(--foreground)", fontSize: 12}}>{best}</strong> <span style={{opacity: 0.7}}>at {money(min)}</span>
                  </div>
                );
              })()}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeWithDip} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--grid)"/>
                  <XAxis axisLine={false} tickLine={false} tickMargin={12} dataKey="date" minTickGap={40} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}/>
                  <YAxis axisLine={false} tickLine={false} tickMargin={10} domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={58}/>
                  <Tooltip content={<CostTooltip />}/>
                  {/* Lines for each active strategy */}
                  {methods.start&&<Line type="monotone" dataKey="startAverageCost" name="Always-In avg cost" stroke="var(--chart-2)" strokeWidth={2.5} dot={false}/>}
                  {methods.daily&&<Line type="monotone" dataKey="averageCost" name="Daily DCA avg cost" stroke="var(--chart-1)" strokeWidth={2.5} dot={false}/>}
                  {methods.weekly&&<Line type="monotone" dataKey="weeklyAverageCost" name="Weekly DCA avg cost" stroke="var(--chart-4)" strokeWidth={2.5} dot={false}/>}
                  {showDipBuy&&<Line type="monotone" dataKey="dipAverageCost" name="Dip-Wait avg cost" stroke="var(--chart-3)" strokeWidth={2.5} dot={false}/>}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                {methods.start&&<span><i className="ci-dot" style={{background:"var(--chart-2)"}}/> <strong>Blue line</strong> = Always-In (Monthly buy)</span>}
                {methods.daily&&<span><i className="ci-dot" style={{background:"var(--chart-1)"}}/> <strong>Teal line</strong> = Daily DCA</span>}
                {methods.weekly&&<span><i className="ci-dot" style={{background:"var(--chart-4)"}}/> <strong>Purple line</strong> = Weekly DCA</span>}
                {showDipBuy&&<span><i className="ci-dot" style={{background:"var(--chart-3)"}}/> <strong>Amber line</strong> = Dip-Wait 50/50</span>}
              </div>
              <div className="interpret-takeaway">
                <strong>📖 How to read this:</strong> Think of it as your &quot;average price paid per share&quot; race. The strategy with the lowest line was successfully buying the cheapest shares on average. 
                {summary && (
                  <> By the end of the period, {methods.start ? `Always-In locked in at ${money(summary.invested/summary.lumpShares)}, ` : ""}{methods.daily ? `Daily DCA locked in at ${money(summary.invested/summary.dcaShares)}, ` : ""}{methods.weekly ? `Weekly DCA locked in at ${money(summary.invested/summary.weeklyShares)}, ` : ""}{showDipBuy && dipBuyResult?.totalShares ? `and Dip-Wait locked in at ${money(dipBuyResult.totalInvested/dipBuyResult.totalShares)}.` : ""}</>
                )}
              </div>
            </div>
          </article>

          {/* Chart 3: How your money grew (full width) */}
          <article className="panel chart-panel portfolio-chart">
            <div className="panel-heading">
              <div>
                <span>{methods.daily&&methods.start?"Strategy comparison":showDipBuy?"Strategy comparison":"Your selected strategy"}</span>
                <h2>How your money grew over time</h2>
                <p>The dashed line is the total cash you put in. Any solid line above it means your investment is in profit. Below means it&apos;s currently at a loss.</p>
              </div>
              <TrendingUp />
            </div>
            <div className="chart-wrap" style={{height:340}}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeWithDip} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dcaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={.30}/><stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="lumpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={.25}/><stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="dipGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={.28}/><stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--grid)"/>
                  <XAxis axisLine={false} tickLine={false} tickMargin={12} dataKey="date" minTickGap={40} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}/>
                  <YAxis axisLine={false} tickLine={false} tickMargin={10} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={64}/>
                  <Tooltip content={<GrowthTooltip />}/>
                  {/* Dashed "amount invested" baseline */}
                  <Area type="monotone" dataKey="invested" name="Total invested" stroke="#627083" strokeWidth={1.5} strokeDasharray="6 4" fill="transparent" dot={false}/>
                  {/* Strategy portfolio value areas */}
                  {methods.start&&<Area type="monotone" dataKey="lumpValue" name="Always-In value" stroke="var(--chart-2)" fill="url(#lumpGrad)" strokeWidth={2.5} dot={false}/>}
                  {methods.daily&&<Area type="monotone" dataKey="dcaValue" name="Daily DCA value" stroke="var(--chart-1)" fill="url(#dcaGrad)" strokeWidth={2.5} dot={false}/>}
                  {methods.weekly&&<Area type="monotone" dataKey="weeklyValue" name="Weekly DCA value" stroke="var(--chart-4)" fill="transparent" strokeWidth={2.5} dot={false}/>}
                  {showDipBuy&&<Area type="monotone" dataKey="dipValue" name="Dip-Wait value" stroke="var(--chart-3)" fill="url(#dipGrad)" strokeWidth={2.5} dot={false} connectNulls={false}/>}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-annotation">Hover over the lines to compare exact portfolio values on any given date.</div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                <span><i className="ci-dash" style={{background:"#627083"}}/> <strong>Grey dashed line</strong> = your break-even baseline (the money you deposited)</span>
                {methods.start&&<span><i className="ci-dot" style={{background:"var(--chart-2)"}}/> <strong>Blue line</strong> = Always-In portfolio</span>}
                {methods.daily&&<span><i className="ci-dot" style={{background:"var(--chart-1)"}}/> <strong>Teal line</strong> = Daily DCA portfolio</span>}
                {methods.weekly&&<span><i className="ci-dot" style={{background:"var(--chart-4)"}}/> <strong>Purple line</strong> = Weekly DCA portfolio</span>}
                {showDipBuy&&<span><i className="ci-dot" style={{background:"var(--chart-3)"}}/> <strong>Amber line</strong> = Dip-Wait portfolio</span>}
              </div>
              <div className="interpret-takeaway">
                <strong>📖 Final Scorecard:</strong> From a total baseline investment of <strong>{summary ? money(summary.invested) : "$0"}</strong>, here&apos;s where they ended up today:
                <ul>
                  {methods.start && <li><strong>Always-In</strong> ended at <strong>{money(alwaysInEndValue)}</strong> (a {pct((alwaysInGain / alwaysInInvested) * 100)} return).</li>}
                  {methods.daily && summary && <li><strong>Daily DCA</strong> ended at <strong>{money(dcaEndValue)}</strong> (a {pct((dcaGain / dcaInvested) * 100)} return).</li>}
                  {methods.weekly && summary && <li><strong>Weekly DCA</strong> ended at <strong>{money(weeklyEndValue)}</strong> (a {pct((weeklyGain / weeklyInvested) * 100)} return).</li>}
                  {showDipBuy && dipBuyResult && <li><strong>Dip-Wait</strong> ended at <strong>{money(dipBuyResult.endValue)}</strong> on its deployed cash (a {dipBuyResult.totalInvested > 0 ? pct((dipGain / dipBuyResult.totalInvested) * 100) : "0%"} return).</li>}
                </ul>
              </div>
            </div>
          </article>
        </section>

        {/* ── Month-by-month table ── */}
        <section className="panel table-panel">
          <div className="panel-heading">
            <div>
              <span>Month by month</span>
              <h2>Your monthly investment results</h2>
              <p>One row per month. Each row shows what happened if you invested during that month using the methods you selected above. Click any row to see the full daily breakdown.</p>
            </div>
            <div className="export-actions">
              {/* CSV export buttons */}
              <Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker || "ticker"}-monthly-dca.csv`, months.map((month) => Object.fromEntries(Object.entries(month).filter(([key]) => key !== "daily"))))}><Download /> Monthly CSV</Button>
              <Button variant="outline" size="sm" onClick={() => data && downloadCsv(`${data.ticker}-prices.csv`, data.prices)}><Download /> Price history</Button>
            </div>
          </div>
          <div className="table-explainer">
            <strong>📋 What does each column mean?</strong>
            <ul>
              <li><strong>Month:</strong> the calendar month this row covers.</li>
              <li><strong>Monthly amount:</strong> the dollars used in that month&apos;s simulation.</li>
              <li><strong>Monthly buy price:</strong> the price on the actual monthly purchase date shown under each month.</li>
              <li><strong>Days:</strong> how many trading days were in that month (markets are closed weekends &amp; holidays).</li>
              {methods.daily && <li><strong>DCA cost:</strong> the average price you paid per share by spreading purchases across all days in that month.</li>}
              {methods.daily && <li><strong>DCA shares:</strong> total shares bought by splitting the budget across every trading day.</li>}
              {methods.daily && <li><strong>DCA gain/loss:</strong> how much profit or loss those shares made by month-end.</li>}
              {methods.weekly && <li><strong>Weekly columns:</strong> the cost, shares, gain/loss, and ending value from buying on the first trading day of each week.</li>}
              {methods.start && <li><strong>Monthly shares:</strong> shares bought by putting the full amount in on your selected monthly purchase day.</li>}
              {methods.start && <li><strong>Monthly gain/loss:</strong> profit or loss from buying all on your selected monthly purchase day.</li>}
              {methods.daily && methods.start && <li><strong>Share difference:</strong> how many more (or fewer) shares Daily DCA got vs. buying all on your selected monthly purchase day. Green = DCA won that month.</li>}
            </ul>
            <p className="table-explainer-note">💡 Click any row to open a day-by-day breakdown of every purchase made that month.</p>
          </div>
          {/* Main data table mapping over sortedMonths */}
          <Table>
            <TableHeader>
              <TableRow>
                {monthColumns.map(({ key, label }) => <TableHead key={key}><button onClick={() => changeSort(key)}>{label}<ArrowDownUp /></button></TableHead>)}
                <TableHead><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMonths.map((row) => (
                <TableRow key={row.month} onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelected(row)}>
                  {monthColumns.map(({ key }) => <TableCell key={key}>{monthCell(row, key)}</TableCell>)}
                  <TableCell><ChevronRight /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {/* ── Dip-buy month table ── */}
        {showDipBuy && dipBuyResult && (
          <section className="panel table-panel" style={{marginTop:"1rem"}}>
            <div className="panel-heading">
              <div>
                <span>Dip-Wait 50/50 — month by month</span>
                <h2>When did the {dipPercent}% dip trigger?</h2>
                <p>One row per month. Amber/highlighted rows = a dip occurred that month and accumulated cash was deployed. Plain rows = no dip, only the 50% day-1 purchase went in.</p>
              </div>
              <TrendingDown style={{width:20,color:"var(--chart-3)"}}/>
            </div>
            <div className="table-explainer">
              <strong>📋 What does each column mean?</strong>
              <ul>
                <li><strong>Month</strong> — the calendar month.</li>
                <li><strong>First-day price</strong> — the stock price on day 1 of that month. This is the baseline used to detect your {dipPercent}% dip.</li>
                <li><strong>50% invested day 1</strong> — the half-budget that always goes in on the first trading day, no matter what.</li>
                <li><strong>Dip triggered?</strong> — whether the stock ever fell {dipPercent}% below day 1&apos;s price at any point during the month.</li>
                <li><strong>Dip price</strong> — the actual price at which the dip was detected.</li>
                <li><strong>Cash deployed</strong> — the total accumulated reserve that was invested on the dip day. This is all the saved-up 50% from previous months plus this month&apos;s 50%, deployed at once.</li>
                <li><strong>Reserve after month</strong> — how much cash is still sitting undeployed and waiting for the next dip.</li>
                <li><strong>Shares so far</strong> — the total number of shares you own across all months up to this point.</li>
                <li><strong>Portfolio value</strong> — what all your shares are worth at this month&apos;s closing price.</li>
              </ul>
              <p className="table-explainer-note">💡 Click any row to see a full breakdown of that month&apos;s purchases.</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><button onClick={()=>{}}>Month</button></TableHead>
                  <TableHead>First-day price</TableHead>
                  <TableHead>50% invested day 1</TableHead>
                  <TableHead>Dip triggered?</TableHead>
                  <TableHead>Dip price</TableHead>
                  <TableHead>Cash deployed</TableHead>
                  <TableHead>Reserve after month</TableHead>
                  <TableHead>Shares so far</TableHead>
                  <TableHead>Portfolio value</TableHead>
                  <TableHead><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dipBuyResult.monthResults.map((row) => (
                  <TableRow key={row.month} className={row.dipOccurred ? "dip-row" : ""} style={{cursor:"pointer"}} onClick={()=>setSelectedDipMonth(row)} tabIndex={0} onKeyDown={(e)=>e.key==="Enter"&&setSelectedDipMonth(row)}>
                    <TableCell><strong>{monthName(row.month)}</strong><span className="cell-sub">{shortDate(row.firstDate)}</span></TableCell>
                    <TableCell>{money(row.firstPrice)}</TableCell>
                    <TableCell>{money(row.halfBudgetInvested)}</TableCell>
                    <TableCell>
                      {row.dipOccurred
                        ? <span className="positive" style={{fontWeight:700}}>✓ Yes — {shortDate(row.dipDate!)}</span>
                        : <span style={{color:"var(--muted-foreground)"}}>No dip this month</span>}
                    </TableCell>
                    <TableCell>{row.dipPrice ? money(row.dipPrice) : "—"}</TableCell>
                    <TableCell>{row.dipAmountDeployed > 0 ? <span className="positive">{money(row.dipAmountDeployed)}</span> : "—"}</TableCell>
                    <TableCell><span style={{color:"var(--muted-foreground)"}}>{money(row.reserveAfterMonth)}</span></TableCell>
                    <TableCell>{shares(row.totalSharesSoFar)}</TableCell>
                    <TableCell><strong>{money(row.endValueSoFar)}</strong></TableCell>
                    <TableCell><ChevronRight /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </>}
      <footer>
        <p>{data?.methodology || "No price data loaded."}</p>
        <p>For personal research and educational purposes only. Historical performance does not guarantee future results. This application does not provide investment advice.</p>
        <span>Data source: {data?.provider || "Yahoo Finance"} · Missing records are never fabricated.</span>
      </footer>
    </section>

    {/* ── Detail sheet: DCA/Lump ── */}
    {/* A slide-out panel that opens when a row in the monthly table is clicked */}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <SheetTitle>{selected?.monthLabel} · Purchase details</SheetTitle>
          <SheetDescription>{selected && `${data?.ticker} · ${selected.tradingDays} trading days · ${selected.weeklyPurchaseCount} weekly purchases`}</SheetDescription>
        </SheetHeader>
        {selected && (
          <div className="detail-content">
            <div className="detail-stats">
              <StatCard label="Monthly investment" value={money(selected.monthlyBudget)} detail={customMonthlyBudget?"Your custom amount":"Automatic first-day share equivalent"}/>
              {methods.daily&&<StatCard label="Daily DCA shares" value={shares(selected.dcaShares)} detail={`${selected.differenceShares >= 0 ? "+" : ""}${shares(selected.differenceShares)} vs monthly buy shares`} tone={selected.differenceShares >= 0 ? "positive" : "negative"}/>}
              {methods.daily&&<StatCard label="Daily average cost" value={money(selected.dcaAverageCost)} detail={`Average market price: ${money(selected.averageMarketPrice)}`}/>}
              {methods.weekly&&<StatCard label="Weekly DCA shares" value={shares(selected.weeklyShares)} detail={`${selected.weeklyPurchaseCount} purchases in this month`} tone={selected.weeklyGain >= 0 ? "positive" : "negative"}/>}
              {methods.weekly&&<StatCard label="Weekly average cost" value={money(selected.weeklyAverageCost)} detail={`${money(selected.weeklyInvestment)} per weekly purchase`}/>}
              {methods.start&&<StatCard label="Monthly buy shares" value={shares(selected.lumpShares)} detail={`${shortDate(selected.purchaseDate)} · Bought at ${money(selected.purchasePrice)}`}/>}
              {methods.start&&<StatCard label="Monthly buy ended at" value={money(selected.lumpEndValue)} detail={signedMoney(selected.lumpGain)} tone={selected.lumpGain >= 0 ? "positive" : "negative"}/>}
            </div>
            <div className="export-actions">
              {methods.daily&&<Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker}-${selected.month}-daily-dca.csv`, selected.daily)}><Download /> Daily CSV</Button>}
              {methods.weekly&&<Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker}-${selected.month}-weekly-dca.csv`, selected.weekly)}><Download /> Weekly CSV</Button>}
            </div>
            {methods.daily&&<Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead><TableHead>Open</TableHead><TableHead>Close</TableHead><TableHead>Price used</TableHead><TableHead>Daily investment</TableHead><TableHead>Shares</TableHead><TableHead>Cumulative investment</TableHead><TableHead>Cumulative shares</TableHead><TableHead>Running cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.daily.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{shortDate(row.date)}</TableCell><TableCell>{money(row.open)}</TableCell><TableCell>{money(row.close)}</TableCell><TableCell>{money(row.priceUsed)}</TableCell><TableCell>{money(row.dailyInvestment)}</TableCell><TableCell>{shares(row.sharesPurchased)}</TableCell><TableCell>{money(row.cumulativeInvestment)}</TableCell><TableCell>{shares(row.cumulativeShares)}</TableCell><TableCell>{money(row.runningAverageCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
            {methods.weekly&&<Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Weekly purchase date</TableHead><TableHead>Price used</TableHead><TableHead>Investment</TableHead><TableHead>Shares</TableHead><TableHead>Running cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selected.weekly.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell>{shortDate(row.date)}</TableCell><TableCell>{money(row.priceUsed)}</TableCell><TableCell>{money(row.weeklyInvestment)}</TableCell><TableCell>{shares(row.sharesPurchased)}</TableCell><TableCell>{money(row.runningAverageCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>}
          </div>
        )}
      </SheetContent>
    </Sheet>

    {/* ── Detail sheet: Dip-buy month ── */}
    {/* A slide-out panel that opens when a row in the dip-buy table is clicked */}
    <Sheet open={Boolean(selectedDipMonth)} onOpenChange={(open) => !open && setSelectedDipMonth(null)}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <SheetTitle>{selectedDipMonth ? monthName(selectedDipMonth.month) : ""} · Dip-Wait 50/50</SheetTitle>
          <SheetDescription>{selectedDipMonth && `${data?.ticker} · First-day price: ${money(selectedDipMonth.firstPrice)} · ${selectedDipMonth.dipOccurred ? `Dip triggered on ${shortDate(selectedDipMonth.dipDate!)} at ${money(selectedDipMonth.dipPrice!)}` : `No ${dipPercent}% dip this month`}`}</SheetDescription>
        </SheetHeader>
        {selectedDipMonth && (
          <div className="detail-content">
            <div className="detail-stats">
              <StatCard label="First-day investment (50%)" value={money(selectedDipMonth.halfBudgetInvested)} detail={`Bought at ${money(selectedDipMonth.firstPrice)}`}/>
              <StatCard label="Dip triggered?" value={selectedDipMonth.dipOccurred ? "Yes ✓" : "No"} detail={selectedDipMonth.dipOccurred ? `On ${shortDate(selectedDipMonth.dipDate!)} — price hit ${money(selectedDipMonth.dipPrice!)}` : `Stock never fell ${dipPercent}% from the first-day price`} tone={selectedDipMonth.dipOccurred ? "positive" : "neutral"}/>
              <StatCard label="Cash deployed at dip" value={selectedDipMonth.dipAmountDeployed > 0 ? money(selectedDipMonth.dipAmountDeployed) : "—"} detail={selectedDipMonth.dipShares > 0 ? `Bought ${shares(selectedDipMonth.dipShares)} shares at the dip` : "No cash deployed this month"}/>
              <StatCard label="Reserve carried forward" value={money(selectedDipMonth.reserveAfterMonth)} detail="Waiting for the next dip opportunity"/>
              <StatCard label="Total shares accumulated" value={shares(selectedDipMonth.totalSharesSoFar)} detail="Running total across all months"/>
              <StatCard label="Portfolio value at month end" value={money(selectedDipMonth.endValueSoFar)} detail={`At last price: ${money(selectedDipMonth.lastPrice)}`} tone={selectedDipMonth.endValueSoFar >= selectedDipMonth.totalInvestedSoFar ? "positive" : "negative"}/>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
    </>}
    <div className="site-credit"><span>Copyright Vraj Patel</span><strong>Made with love by Vraj Patel <span aria-hidden="true">♥</span></strong></div>
  </main>;
}
