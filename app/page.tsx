"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownUp, BarChart3, BriefcaseBusiness, Calendar, Check, ChevronRight,
  CircleAlert, Download, LineChart as LineChartIcon, LoaderCircle,
  Moon, Search, Sparkles, Sun, TrendingDown, TrendingUp, WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateMonth, calculateDipBuyStrategy, type MonthCalculation, type PriceField, type DipBuyMonthResult } from "@/lib/dca-core.mjs";
import type { MarketDataResult, MarketPrice } from "@/lib/market-data";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";

type MonthRow = MonthCalculation & { month: string; monthLabel: string };
type SortKey = "month" | "monthlyBudget" | "firstPrice" | "tradingDays" | "dcaAverageCost" | "dcaShares" | "lumpShares" | "differenceShares" | "dcaGain" | "lumpGain" | "dcaEndValue" | "lumpEndValue";
const today = new Date().toISOString().slice(0, 10);
const yearsAgo = (years: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const signedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
const shares = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const monthName = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

function downloadCsv(name: string, rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = name; link.click(); URL.revokeObjectURL(link.href);
}

function StatCard({ label, value, detail, tone = "neutral", sub }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative"; sub?: string }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong className={tone === "positive" ? "positive" : tone === "negative" ? "negative" : ""}>{value}</strong>
      <span>{detail}</span>
      {sub && <span style={{ marginTop: ".2rem", opacity: .7 }}>{sub}</span>}
    </article>
  );
}

function monthCell(row: MonthRow, key: SortKey) {
  if (key === "month") return <><strong>{row.monthLabel}</strong><span className="cell-sub">{shortDate(row.firstDate)}</span></>;
  if (key === "monthlyBudget") return <strong>{money(row.monthlyBudget)}</strong>;
  if (key === "firstPrice") return money(row.firstPrice);
  if (key === "tradingDays") return row.tradingDays;
  if (key === "dcaAverageCost") return money(row.dcaAverageCost);
  if (key === "dcaShares") return shares(row.dcaShares);
  if (key === "lumpShares") return shares(row.lumpShares);
  if (key === "dcaEndValue") return money(row.dcaEndValue);
  if (key === "lumpEndValue") return money(row.lumpEndValue);
  if (key === "differenceShares") return <span className={row.differenceShares >= 0 ? "positive" : "negative"}>{row.differenceShares >= 0 ? "+" : ""}{shares(row.differenceShares)}</span>;
  if (key === "dcaGain") return <span className={row.dcaGain >= 0 ? "positive" : "negative"}>{signedMoney(row.dcaGain)}</span>;
  return <span className={row.lumpGain >= 0 ? "positive" : "negative"}>{signedMoney(row.lumpGain)}</span>;
}

// ---------- Custom tooltip components ----------

interface PriceTooltipPayload {
  name: string;
  value: number;
  color: string;
}

function PriceTooltip({ active, payload, label }: { active?: boolean; payload?: PriceTooltipPayload[]; label?: string }) {
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
    </div>
  );
}

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
      <p className="tooltip-hint">Lower cost per share = better deal</p>
    </div>
  );
}

function GrowthTooltip({ active, payload, label }: { active?: boolean; payload?: PriceTooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const invested = payload.find((p) => p.name === "Total invested");
  return (
    <div className="custom-tooltip">
      <p className="tooltip-date">{label ? shortDate(label) : ""}</p>
      {payload.filter((p) => p.name !== "Total invested").map((p) => {
        const gain = invested ? p.value - invested.value : null;
        return (
          <div key={p.name} className="tooltip-row-block">
            <div className="tooltip-row">
              <span className="tooltip-dot" style={{ background: p.color }} />
              <span>{p.name}</span>
              <strong>{money(p.value)}</strong>
            </div>
            {gain !== null && (
              <div className="tooltip-gain" style={{ color: gain >= 0 ? "#27bf8a" : "#ef6e83" }}>
                {gain >= 0 ? "▲" : "▼"} {signedMoney(gain)} vs. amount invested
              </div>
            )}
          </div>
        );
      })}
      {invested && <div className="tooltip-row tooltip-invested"><span>💰 Amount invested</span><strong>{money(invested.value)}</strong></div>}
    </div>
  );
}

export default function Home() {
  const [ticker, setTicker] = useState("VOO");
  const [start, setStart] = useState(yearsAgo(1));
  const [end, setEnd] = useState(today);
  const [priceField, setPriceField] = useState<PriceField>("close");
  const [useDividendAdjusted, setUseDividendAdjusted] = useState(true);
  const [monthlyInvestment, setMonthlyInvestment] = useState("");
  const [dipBuyAmount, setDipBuyAmount] = useState("100");
  const [methods, setMethods] = useState({ daily: true, start: true });
  const [showDipBuy, setShowDipBuy] = useState(false);
  const [data, setData] = useState<MarketDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MonthRow | null>(null);
  const [selectedDipMonth, setSelectedDipMonth] = useState<DipBuyMonthResult | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "month", direction: -1 });
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<"portfolio" | "research">("portfolio");
  const customMonthlyBudget = Number(monthlyInvestment) > 0 ? Number(monthlyInvestment) : undefined;
  const dipBudget = Number(dipBuyAmount) > 0 ? Number(dipBuyAmount) : 100;
  // When dividend-adjusted is on, override priceField to use adjustedClose
  const effectivePriceField: PriceField = useDividendAdjusted ? "adjustedClose" : priceField;

  const load = useCallback(async (nextTicker = ticker, nextStart = start, nextEnd = end) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/market?ticker=${encodeURIComponent(nextTicker.trim().toUpperCase())}&start=${nextStart}&end=${nextEnd}`);
      const payload = await response.json() as MarketDataResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Historical data could not be loaded.");
      setData(payload); setTicker(payload.ticker);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Historical data could not be loaded."); }
    finally { setLoading(false); }
  }, [ticker, start, end]);

  useEffect(() => { void load("VOO", start, end); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);

  const months = useMemo<MonthRow[]>(() => {
    if (!data) return [];
    const groups = new Map<string, MarketPrice[]>();
    data.prices.forEach((row) => { const key = row.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), row]); });
    return [...groups.entries()].map(([month, rows]) => ({ month, monthLabel: monthName(month), ...calculateMonth(rows, effectivePriceField, customMonthlyBudget) }));
  }, [data, effectivePriceField, customMonthlyBudget]);

  // Dip-buy strategy computed across all months together (reserve rolls over)
  const dipBuyResult = useMemo(() => {
    if (!data) return null;
    const groups = new Map<string, MarketPrice[]>();
    data.prices.forEach((row) => { const key = row.date.slice(0, 7); groups.set(key, [...(groups.get(key) || []), row]); });
    const monthGroups = [...groups.entries()].map(([month, prices]) => ({ month, prices }));
    if (!monthGroups.length) return null;
    return calculateDipBuyStrategy(monthGroups, effectivePriceField, dipBudget);
  }, [data, effectivePriceField, dipBudget]);

  // HYSA estimate: simulate the reserve sitting in a 3% APY savings account
  const dipHysaValue = useMemo(() => {
    if (!dipBuyResult) return 0;
    const monthlyRate = 0.03 / 12;
    let hysaBalance = 0;
    for (const m of dipBuyResult.monthResults) {
      hysaBalance += m.reserveAdded;      // 50% of monthly budget added to HYSA
      hysaBalance *= (1 + monthlyRate);   // earn one month of 3% APY interest
      if (m.dipOccurred) {
        hysaBalance = 0;                  // deployed to market, withdrawn from HYSA
      }
    }
    return hysaBalance; // remaining balance in HYSA today
  }, [dipBuyResult]);

  const cumulative = useMemo(() => {
    let invested = 0, dcaShares = 0, lumpShares = 0;
    return months.map((row) => {
      invested += row.monthlyBudget;
      dcaShares += row.dcaShares;
      lumpShares += row.lumpShares;
      return {
        date: row.lastDate,
        marketPrice: row.lastPrice,
        averageCost: invested / dcaShares,
        startAverageCost: invested / lumpShares,
        dcaValue: dcaShares * row.lastPrice,
        lumpValue: lumpShares * row.lastPrice,
        invested,
        dcaShares,
        lumpShares,
      };
    });
  }, [months]);

  // Build cumulative chart data that also includes dip-buy portfolio value and average cost
  const cumulativeWithDip = useMemo(() => {
    if (!dipBuyResult) return cumulative.map((r) => ({ ...r, dipValue: undefined, dipInvested: undefined, dipAverageCost: undefined }));
    // Map dip month results by lastDate
    const dipByDate = new Map<string, any>();
    for (const m of dipBuyResult.monthResults) {
      dipByDate.set(m.lastDate, m);
    }
    return cumulative.map((r) => {
      const mData = dipByDate.get(r.date);
      const dipShares = mData ? mData.totalSharesSoFar : undefined;
      const dipValue = dipShares !== undefined ? dipShares * r.marketPrice : undefined;
      const dipInvested = mData ? mData.totalInvestedSoFar : undefined;
      const dipAverageCost = mData && mData.totalSharesSoFar > 0 ? mData.totalInvestedSoFar / mData.totalSharesSoFar : undefined;
      return { ...r, dipValue, dipInvested, dipAverageCost };
    });
  }, [cumulative, dipBuyResult]);

  // Price chart — simplified single-axis
  const priceChart = useMemo(() => {
    if (!data) return [];
    const first = data.prices[0]?.close || 1;
    const step = Math.max(1, Math.ceil(data.prices.length / 300));
    return data.prices
      .filter((_, i) => i % step === 0 || i === data.prices.length - 1)
      .map((row) => ({
        date: row.date,
        price: row.close,
        returnPct: (row.close / first - 1) * 100,
      }));
  }, [data]);

  const startingPrice = priceChart[0]?.price ?? 0;

  const summary = cumulative.at(-1);
  const sortedMonths = useMemo(() => [...months].sort((a, b) => { const av = a[sort.key], bv = b[sort.key]; return (typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv)) * sort.direction; }), [months, sort]);
  const monthColumns = useMemo(() => {
    const columns: { key: SortKey; label: string }[] = [{ key: "month", label: "Month" }, { key: "monthlyBudget", label: "Monthly amount" }, { key: "firstPrice", label: "First-day price" }, { key: "tradingDays", label: "Days" }];
    if (methods.daily) columns.push({ key: "dcaAverageCost", label: "DCA cost" }, { key: "dcaShares", label: "DCA shares" }, { key: "dcaGain", label: "DCA gain/loss" }, { key: "dcaEndValue", label: "DCA ended at" });
    if (methods.start) columns.push({ key: "lumpShares", label: "Start shares" }, { key: "lumpGain", label: "Start gain/loss" }, { key: "lumpEndValue", label: "Start ended at" });
    if (methods.daily && methods.start) columns.push({ key: "differenceShares", label: "Share difference" });
    return columns;
  }, [methods]);

  const researchSummary = useMemo(() => {
    if (!summary || !months.length) return null;
    const dcaAdvantage = summary.dcaValue - summary.lumpValue;
    const dcaWins = months.filter((row) => row.differenceShares > 0).length;
    const firstDayWins = months.filter((row) => row.differenceShares < 0).length;
    const tieMonths = months.length - dcaWins - firstDayWins;
    const winner = dcaAdvantage > .01 ? "Spreading purchases won" : dcaAdvantage < -.01 ? "Buying at the start won" : "The two methods were nearly tied";
    const why = dcaAdvantage > .01
      ? `Prices often fell after the month began, so the same dollars bought more shares later. DCA bought more shares in ${dcaWins} of ${months.length} months.`
      : dcaAdvantage < -.01
        ? `Prices often rose after the month began, so buying at the start locked in lower prices. The first-day purchase won in ${firstDayWins} of ${months.length} months.`
        : `Prices moved both ways. DCA won ${dcaWins} months, the first-day purchase won ${firstDayWins}, and ${tieMonths} were effectively tied.`;
    return { dcaAdvantage, winner, why, dcaWins, firstDayWins };
  }, [months, summary]);

  const setRange = (monthsBack: number | "max") => {
    const nextEnd = today; const d = new Date();
    const nextStart = monthsBack === "max" ? "1970-01-01" : (d.setMonth(d.getMonth() - monthsBack), d.toISOString().slice(0, 10));
    setStart(nextStart); setEnd(nextEnd); void load(ticker, nextStart, nextEnd);
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void load(); };
  const changeSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === 1 ? -1 : 1 : 1 }));
  const toggleMethod = (key: "daily" | "start") => setMethods((current) => current[key] && Object.values(current).filter(Boolean).length === 1 ? current : { ...current, [key]: !current[key] });

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "run_dca_research", title: "Run DCA research", description: "Load historical prices for a U.S. stock or ETF and update the visible daily-versus-month-start analysis.", inputSchema: { type: "object", properties: { ticker: { type: "string" }, start: { type: "string" }, end: { type: "string" }, monthlyInvestment: { type: "number", minimum: 0, description: "Optional dollars invested per month. Omit to use the first-day share-equivalent default." } }, required: ["ticker", "start", "end"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { const value = input as { ticker?: string; start?: string; end?: string; monthlyInvestment?: number }; if (!value.ticker || !/^\d{4}-\d{2}-\d{2}$/.test(value.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.end || "")) throw new Error("Ticker, start, and end are required."); setTicker(value.ticker.toUpperCase()); setStart(value.start!); setEnd(value.end!); setMonthlyInvestment(value.monthlyInvestment && value.monthlyInvestment > 0 ? String(value.monthlyInvestment) : ""); await load(value.ticker, value.start!, value.end!); return { status: "loaded", ticker: value.ticker.toUpperCase(), start: value.start, end: value.end, monthlyInvestment: value.monthlyInvestment || null }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [load]);

  const dipGain = dipBuyResult ? dipBuyResult.endValue - dipBuyResult.totalInvested : 0;
  const alwaysInEndValue = summary?.lumpValue ?? 0;
  const alwaysInInvested = summary?.invested ?? 0;
  const alwaysInGain = alwaysInEndValue - alwaysInInvested;
  const dcaEndValue = summary?.dcaValue ?? 0;
  const dcaInvested = summary?.invested ?? 0;
  const dcaGain = dcaEndValue - dcaInvested;

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><TrendingUp /></span><div><strong>DCA Research Lab</strong><span>Investing explained simply</span></div></div><nav className="view-switch" aria-label="Choose a workspace"><button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}><BriefcaseBusiness/> My portfolio</button><button className={view === "research" ? "active" : ""} onClick={() => setView("research")}><LineChartIcon/> Stock research</button></nav><div className="header-actions"><span className="live-pill"><i /> Market data on demand</span><Button variant="ghost" size="icon" aria-label="Toggle color theme" onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button></div></header>
    {view === "portfolio" ? <PortfolioDashboard /> : <>
    <section className="workspace">
      <div className="page-heading"><div><span className="eyebrow"><Sparkles /> One stock or ETF at a time</span><h1>Compare three ways to invest your money</h1><p>Pick a ticker and time period. Compare investing monthly at the start, spreading it daily, or waiting for a 5% price dip to deploy extra cash.</p></div>{data && <div className="security-chip"><div><strong>{data.ticker}</strong><span>{data.name}</span></div><strong>{money(data.prices.at(-1)?.close || 0)}</strong><span>{shortDate(data.prices.at(-1)?.date || "")}</span></div>}</div>
      <section className="control-panel">
        <form onSubmit={onSubmit} className="search-control"><label htmlFor="ticker">Ticker</label><div className="search-box"><Search /><Input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="Enter ticker" autoComplete="off"/><Button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : "Analyze"}</Button></div></form>
        <div className="date-control"><label htmlFor="start">Start date</label><Input id="start" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></div>
        <div className="date-control"><label htmlFor="end">End date</label><Input id="end" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></div>
        <div className="date-control purchase-control"><label>Purchase price</label><Select value={priceField} onValueChange={(value) => setPriceField(value as PriceField)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="close">Daily close</SelectItem><SelectItem value="open">Daily open</SelectItem></SelectContent></Select></div>
        <div className="date-control monthly-control"><label htmlFor="monthly-investment">Monthly amount <em>optional</em></label><div className="money-input"><span>$</span><Input id="monthly-investment" type="number" min="0" step="25" inputMode="decimal" value={monthlyInvestment} onChange={(event)=>setMonthlyInvestment(event.target.value)} placeholder="Default"/></div></div>
      </section>

      {/* ── Strategy toggles ── */}
      <section className="investment-options" aria-label="Optional investment details">
        <div className="method-options">
          <div><strong>Methods to show</strong><span>Mix and match to compare strategies side by side.</span></div>
          <button type="button" aria-pressed={methods.daily} className={methods.daily?"active":""} onClick={()=>toggleMethod("daily")}><i>{methods.daily&&<Check/>}</i><span><strong>Daily DCA</strong><small>Split the monthly amount across every trading day.</small></span></button>
          <button type="button" aria-pressed={methods.start} className={methods.start?"active":""} onClick={()=>toggleMethod("start")}><i>{methods.start&&<Check/>}</i><span><strong>Always In (Month-start)</strong><small>Invest 100% on the first trading day of every month.</small></span></button>
          <button type="button" aria-pressed={showDipBuy} className={showDipBuy?"active dip-active":""} onClick={()=>setShowDipBuy((v)=>!v)}><i>{showDipBuy&&<Check/>}</i><span><strong>Dip-Wait 50/50</strong><small>50% in on day 1. Save the rest until the stock drops 5%.</small></span></button>
        </div>
        {showDipBuy && (
          <div className="dip-budget-row">
            <TrendingDown style={{width:16,color:"var(--primary)"}}/>
            <span><strong>Dip-Wait monthly budget:</strong> 50% goes in on the 1st trading day; the other 50% waits and rolls over until a 5% dip occurs.</span>
            <div className="money-input" style={{width:140}}>
              <span>$</span>
              <Input type="number" min="0" step="25" inputMode="decimal" value={dipBuyAmount} onChange={(e)=>setDipBuyAmount(e.target.value)} placeholder="100"/>
            </div>
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

      <div className="quick-ranges">{[[1,"1M"],[3,"3M"],[6,"6M"],[12,"1Y"],[36,"3Y"],[60,"5Y"],[120,"10Y"],[180,"15Y"],[240,"20Y"],["max","MAX"]].map(([value,label]) => <button key={label} onClick={() => setRange(value as number | "max")}>{label}</button>)}<span>{useDividendAdjusted ? "📈 Dividend-adjusted prices: dividends are included in all returns." : priceField === "close" ? "Close uses each trading day's closing price." : "Open uses each trading day's opening price."}</span></div>
      {error && <div className="error-banner"><CircleAlert /><div><strong>Couldn't load this analysis</strong><span>{error}</span></div><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
      {!error && <>
        {researchSummary && summary && <section className={`research-verdict ${researchSummary.dcaAdvantage >= 0 ? "dca-win" : "early-win"}`}><div><span>Plain-English answer</span><h2>{methods.daily&&methods.start?researchSummary.winner:methods.daily?"Your daily DCA result":"Your month-start result"}</h2><p>{methods.daily&&methods.start?researchSummary.why:methods.daily?`You invested ${money(summary.invested)} by spreading each month's amount across trading days. It ended at ${money(summary.dcaValue)}, a ${signedMoney(summary.dcaValue-summary.invested)} gain or loss.`:`You invested ${money(summary.invested)} on each month's first trading day. It ended at ${money(summary.lumpValue)}, a ${signedMoney(summary.lumpValue-summary.invested)} gain or loss.`}</p></div><div className="verdict-number"><span>{methods.daily&&methods.start?"Difference at the end":"Ending value"}</span><strong className={methods.daily&&methods.start?(researchSummary.dcaAdvantage>=0?"positive":"negative"):(methods.daily?summary.dcaValue>=summary.invested:summary.lumpValue>=summary.invested)?"positive":"negative"}>{methods.daily&&methods.start?signedMoney(researchSummary.dcaAdvantage):money(methods.daily?summary.dcaValue:summary.lumpValue)}</strong><small>{methods.daily&&methods.start?(researchSummary.dcaAdvantage>=0?"Daily DCA finished ahead":"Month-start buying finished ahead"):`Using ${customMonthlyBudget?money(customMonthlyBudget):"the automatic default"} each month`}</small></div></section>}

        {/* ── Dip-buy verdict banner ── */}
        {showDipBuy && dipBuyResult && (
          <section className="research-verdict dip-win">
            <div>
              <span>Dip-Wait 50/50 result</span>
              <h2>{dipGain >= 0 ? "Your dip-wait strategy made money" : "Your dip-wait strategy is down"}</h2>
              <p>
                You committed {money(dipBuyResult.totalCashCommitted)} over {dipBuyResult.monthResults.length} months ({money(dipBudget)}/month).
                Of that, <strong>{money(dipBuyResult.totalInvested)}</strong> actually went into the market
                ({dipBuyResult.dipMonthCount > 0 ? `a dip occurred ${dipBuyResult.dipMonthCount} time${dipBuyResult.dipMonthCount > 1 ? "s" : ""}: extra cash deployed then` : "no 5% dip occurred, so only the 50% first-day amounts were invested"}).
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
              <span className="scenario-label"><Calendar style={{width:14,display:"inline",verticalAlign:"middle"}}/> Scenario 1: Always In (Month-Start)</span>
              <p className="scenario-desc">You invest 100% of your budget on the first trading day of every month. No waiting, no timing, every dollar goes to work immediately.</p>
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
              <p className="scenario-desc">50% goes in on day 1 every month. The other 50% accumulates as cash and waits. The moment the stock drops 5% in any month, all the saved-up cash is deployed at that lower price.</p>
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
              {priceChart.length > 0 && (
                <div style={{position: "absolute", top: 12, right: 16, background: "rgba(82,224,196,0.1)", border: "1px solid rgba(82,224,196,0.3)", borderRadius: 6, padding: "6px 10px", fontSize: 13, zIndex: 10, backdropFilter: "blur(4px)"}}>
                  <span style={{color: "var(--foreground)"}}>Total growth: </span>
                  <strong style={{color: "#30c0a3", fontSize: 14}}>{pct(((priceChart.at(-1)?.price || 1) - startingPrice) / startingPrice * 100)}</strong>
                </div>
              )}
              {loading ? <div className="chart-loading"><LoaderCircle className="spin" /> Loading trading days…</div> :
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={priceChart} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#52e0c4" stopOpacity={.28}/>
                      <stop offset="100%" stopColor="#52e0c4" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/>
                  <XAxis dataKey="date" minTickGap={60} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/>
                  <YAxis domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={58}/>
                  <ReferenceLine y={startingPrice} stroke="#7ea6ff" strokeDasharray="5 4" strokeWidth={1.5} label={{ value: "Where you started", fill: "#7ea6ff", fontSize: 10, position: "insideTopLeft" }}/>
                  <Tooltip content={<PriceTooltip />}/>
                  <Area type="monotone" dataKey="price" name="Stock price" stroke="#52e0c4" strokeWidth={2.5} fill="url(#priceFill)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>}
            </div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                <span><i className="ci-dot" style={{background:"#52e0c4"}}/> <strong>Green line</strong> = the stock price on each day</span>
                <span><i className="ci-dash" style={{background:"#7ea6ff"}}/> <strong>Blue dashed line</strong> = the price on the very first day you started investing</span>
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
              {(() => {
                let best = "";
                let min = Infinity;
                if (methods.start && summary && summary.lumpShares > 0) { const val = summary.invested/summary.lumpShares; if (val < min) { min = val; best = "Always-In"; } }
                if (methods.daily && summary && summary.dcaShares > 0) { const val = summary.invested/summary.dcaShares; if (val < min) { min = val; best = "Daily DCA"; } }
                if (showDipBuy && dipBuyResult && dipBuyResult.totalShares > 0) { const val = dipBuyResult.totalInvested/dipBuyResult.totalShares; if (val < min) { min = val; best = "Dip-Wait"; } }
                if (min === Infinity) return null;
                return (
                  <div style={{position: "absolute", top: 12, left: 24, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13, zIndex: 10, boxShadow: "0 2px 4px rgba(0,0,0,0.1)"}}>
                    <span style={{color: "var(--muted-foreground)"}}>Cheapest avg share: </span>
                    <strong style={{color: "var(--foreground)", fontSize: 14}}>{best}</strong> <span style={{opacity: 0.7}}>at {money(min)}</span>
                  </div>
                );
              })()}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeWithDip} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/>
                  <XAxis dataKey="date" minTickGap={40} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/>
                  <YAxis domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={58}/>
                  <Tooltip content={<CostTooltip />}/>
                  {methods.start&&<Line type="monotone" dataKey="startAverageCost" name="Always-In avg cost" stroke="#7ea6ff" strokeWidth={2.5} dot={false}/>}
                  {methods.daily&&<Line type="monotone" dataKey="averageCost" name="Daily DCA avg cost" stroke="#52e0c4" strokeWidth={2.5} dot={false}/>}
                  {showDipBuy&&<Line type="monotone" dataKey="dipAverageCost" name="Dip-Wait avg cost" stroke="#f7a243" strokeWidth={2.5} dot={false}/>}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                {methods.start&&<span><i className="ci-dot" style={{background:"#7ea6ff"}}/> <strong>Blue line</strong> = Always-In (Month start)</span>}
                {methods.daily&&<span><i className="ci-dot" style={{background:"#52e0c4"}}/> <strong>Teal line</strong> = Daily DCA</span>}
                {showDipBuy&&<span><i className="ci-dot" style={{background:"#f7a243"}}/> <strong>Amber line</strong> = Dip-Wait 50/50</span>}
              </div>
              <div className="interpret-takeaway">
                <strong>📖 How to read this:</strong> Think of it as your &quot;average price paid per share&quot; race. The strategy with the lowest line was successfully buying the cheapest shares on average. 
                {summary && (
                  <> By the end of the period, {methods.start ? `Always-In locked in at ${money(summary.invested/summary.lumpShares)}, ` : ""}{methods.daily ? `Daily DCA locked in at ${money(summary.invested/summary.dcaShares)}, ` : ""}{showDipBuy && dipBuyResult?.totalShares ? `and Dip-Wait locked in at ${money(dipBuyResult.totalInvested/dipBuyResult.totalShares)}.` : ""}</>
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
                <p>The dashed line is the total cash you put in. Any solid line above it means your investment is in profit. Below means it's currently at a loss.</p>
              </div>
              <TrendingUp />
            </div>
            <div className="chart-wrap" style={{height:340}}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeWithDip} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="dcaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#52e0c4" stopOpacity={.22}/><stop offset="100%" stopColor="#52e0c4" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="lumpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#7ea6ff" stopOpacity={.18}/><stop offset="100%" stopColor="#7ea6ff" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="dipGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f7a243" stopOpacity={.22}/><stop offset="100%" stopColor="#f7a243" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/>
                  <XAxis dataKey="date" minTickGap={40} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/>
                  <YAxis tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={64}/>
                  <Tooltip content={<GrowthTooltip />}/>
                  {/* Dashed "amount invested" baseline */}
                  <Area type="monotone" dataKey="invested" name="Total invested" stroke="#627083" strokeWidth={1.5} strokeDasharray="6 4" fill="transparent" dot={false}/>
                  {methods.start&&<Area type="monotone" dataKey="lumpValue" name="Always-In value" stroke="#7ea6ff" fill="url(#lumpGrad)" strokeWidth={2.5} dot={false}/>}
                  {methods.daily&&<Area type="monotone" dataKey="dcaValue" name="Daily DCA value" stroke="#52e0c4" fill="url(#dcaGrad)" strokeWidth={2.5} dot={false}/>}
                  {showDipBuy&&<Area type="monotone" dataKey="dipValue" name="Dip-Wait value" stroke="#f7a243" fill="url(#dipGrad)" strokeWidth={2.5} dot={false} connectNulls={false}/>}
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-annotation">Hover over the lines to compare exact portfolio values on any given date.</div>
            <div className="chart-interpret">
              <div className="interpret-legend">
                <span><i className="ci-dash" style={{background:"#627083"}}/> <strong>Grey dashed line</strong> = your break-even baseline (the money you deposited)</span>
                {methods.start&&<span><i className="ci-dot" style={{background:"#7ea6ff"}}/> <strong>Blue line</strong> = Always-In portfolio</span>}
                {methods.daily&&<span><i className="ci-dot" style={{background:"#52e0c4"}}/> <strong>Teal line</strong> = Daily DCA portfolio</span>}
                {showDipBuy&&<span><i className="ci-dot" style={{background:"#f7a243"}}/> <strong>Amber line</strong> = Dip-Wait portfolio</span>}
              </div>
              <div className="interpret-takeaway">
                <strong>📖 Final Scorecard:</strong> From a total baseline investment of <strong>{summary ? money(summary.invested) : "$0"}</strong>, here&apos;s where they ended up today:
                <ul>
                  {methods.start && <li><strong>Always-In</strong> ended at <strong>{money(alwaysInEndValue)}</strong> (a {pct((alwaysInGain / alwaysInInvested) * 100)} return).</li>}
                  {methods.daily && summary && <li><strong>Daily DCA</strong> ended at <strong>{money(dcaEndValue)}</strong> (a {pct((dcaGain / dcaInvested) * 100)} return).</li>}
                  {showDipBuy && dipBuyResult && <li><strong>Dip-Wait</strong> ended at <strong>{money(dipBuyResult.endValue)}</strong> on its deployed cash (a {dipBuyResult.totalInvested > 0 ? pct((dipGain / dipBuyResult.totalInvested) * 100) : "0%"} return).</li>}
                </ul>
              </div>
            </div>
          </article>
        </section>

        {/* ── Month-by-month table ── */}
        <section className="panel table-panel">
          <div className="panel-heading"><div><span>Month by month</span><h2>Your monthly investment results</h2><p>One row per month. Each row shows what happened if you invested during that month using the methods you selected above. Click any row to see the full daily breakdown.</p></div><div className="export-actions"><Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker || "ticker"}-monthly-dca.csv`, months.map(({ daily, ...row }) => row))}><Download /> Monthly CSV</Button><Button variant="outline" size="sm" onClick={() => data && downloadCsv(`${data.ticker}-prices.csv`, data.prices)}><Download /> Price history</Button></div></div>
          <div className="table-explainer">
            <strong>📋 What does each column mean?</strong>
            <ul>
              <li><strong>Month:</strong> the calendar month this row covers.</li>
              <li><strong>Monthly amount:</strong> the dollars used in that month&apos;s simulation.</li>
              <li><strong>First-day price:</strong> the stock price on the first trading day of that month (used for the Always-In purchase).</li>
              <li><strong>Days:</strong> how many trading days were in that month (markets are closed weekends &amp; holidays).</li>
              {methods.daily && <li><strong>DCA cost:</strong> the average price you paid per share by spreading purchases across all days in that month.</li>}
              {methods.daily && <li><strong>DCA shares:</strong> total shares bought by splitting the budget across every trading day.</li>}
              {methods.daily && <li><strong>DCA gain/loss:</strong> how much profit or loss those shares made by month-end.</li>}
              {methods.start && <li><strong>Start shares:</strong> shares bought by putting the full amount in on day 1.</li>}
              {methods.start && <li><strong>Start gain/loss:</strong> profit or loss from buying all on day 1.</li>}
              {methods.daily && methods.start && <li><strong>Share difference:</strong> how many more (or fewer) shares Daily DCA got vs. buying all on day 1. Green = DCA won that month.</li>}
            </ul>
            <p className="table-explainer-note">💡 Click any row to open a day-by-day breakdown of every purchase made that month.</p>
          </div>
        <Table><TableHeader><TableRow>{monthColumns.map(({ key, label }) => <TableHead key={key}><button onClick={() => changeSort(key)}>{label}<ArrowDownUp /></button></TableHead>)}<TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{sortedMonths.map((row) => <TableRow key={row.month} onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelected(row)}>{monthColumns.map(({ key }) => <TableCell key={key}>{monthCell(row, key)}</TableCell>)}<TableCell><ChevronRight /></TableCell></TableRow>)}</TableBody></Table></section>

        {/* ── Dip-buy month table ── */}
        {showDipBuy && dipBuyResult && (
          <section className="panel table-panel" style={{marginTop:"1rem"}}>
            <div className="panel-heading">
              <div><span>Dip-Wait 50/50 — month by month</span><h2>When did the 5% dip trigger?</h2><p>One row per month. Amber/highlighted rows = a dip occurred that month and accumulated cash was deployed. Plain rows = no dip, only the 50% day-1 purchase went in.</p></div>
              <TrendingDown style={{width:20,color:"#f7a243"}}/>
            </div>
            <div className="table-explainer">
              <strong>📋 What does each column mean?</strong>
              <ul>
                <li><strong>Month</strong> — the calendar month.</li>
                <li><strong>First-day price</strong> — the stock price on day 1 of that month. This is the baseline used to detect a 5% dip.</li>
                <li><strong>50% invested day 1</strong> — the half-budget that always goes in on the first trading day, no matter what.</li>
                <li><strong>Dip triggered?</strong> — whether the stock ever fell 5% below day 1&apos;s price at any point during the month.</li>
                <li><strong>Dip price</strong> — the actual price at which the dip was detected (the first day it crossed -5%).</li>
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
      <footer><p>{data?.methodology || "No price data loaded."}</p><p>For personal research and educational purposes only. Historical performance does not guarantee future results. This application does not provide investment advice.</p><span>Data source: {data?.provider || "Yahoo Finance"} · Missing records are never fabricated.</span></footer>
    </section>

    {/* ── Detail sheet: DCA/Lump ── */}
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{selected?.monthLabel} · {methods.daily ? "Daily purchases" : "Month-start purchase"}</SheetTitle><SheetDescription>{selected && `${data?.ticker} · ${selected.tradingDays} actual trading days · ${methods.daily ? `${money(selected.dailyInvestment)} invested per day` : `${money(selected.monthlyBudget)} invested on the first trading day`}`}</SheetDescription></SheetHeader>{selected && <div className="detail-content"><div className="detail-stats"><StatCard label="Monthly investment" value={money(selected.monthlyBudget)} detail={customMonthlyBudget?"Your custom amount":"Automatic first-day share equivalent"}/>{methods.daily&&<StatCard label="DCA shares" value={shares(selected.dcaShares)} detail={`${selected.differenceShares >= 0 ? "+" : ""}${shares(selected.differenceShares)} vs month-start shares`} tone={selected.differenceShares >= 0 ? "positive" : "negative"}/>}{methods.daily&&<StatCard label="DCA average cost" value={money(selected.dcaAverageCost)} detail={`Average market price: ${money(selected.averageMarketPrice)}`}/>}{methods.start&&<StatCard label="Month-start shares" value={shares(selected.lumpShares)} detail={`Bought at ${money(selected.firstPrice)}`}/>}{methods.start&&<StatCard label="Month-start ended at" value={money(selected.lumpEndValue)} detail={signedMoney(selected.lumpGain)} tone={selected.lumpGain >= 0 ? "positive" : "negative"}/>}</div>{methods.daily&&<Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker}-${selected.month}-daily-dca.csv`, selected.daily)}><Download /> Export daily CSV</Button>}{methods.daily&&<Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Open</TableHead><TableHead>Close</TableHead><TableHead>Price used</TableHead><TableHead>Daily investment</TableHead><TableHead>Shares</TableHead><TableHead>Cumulative investment</TableHead><TableHead>Cumulative shares</TableHead><TableHead>Running cost</TableHead></TableRow></TableHeader><TableBody>{selected.daily.map((row) => <TableRow key={row.date}><TableCell>{shortDate(row.date)}</TableCell><TableCell>{money(row.open)}</TableCell><TableCell>{money(row.close)}</TableCell><TableCell>{money(row.priceUsed)}</TableCell><TableCell>{money(row.dailyInvestment)}</TableCell><TableCell>{shares(row.sharesPurchased)}</TableCell><TableCell>{money(row.cumulativeInvestment)}</TableCell><TableCell>{shares(row.cumulativeShares)}</TableCell><TableCell>{money(row.runningAverageCost)}</TableCell></TableRow>)}</TableBody></Table>}</div>}</SheetContent></Sheet>

    {/* ── Detail sheet: Dip-buy month ── */}
    <Sheet open={Boolean(selectedDipMonth)} onOpenChange={(open) => !open && setSelectedDipMonth(null)}>
      <SheetContent className="detail-sheet">
        <SheetHeader>
          <SheetTitle>{selectedDipMonth ? monthName(selectedDipMonth.month) : ""} · Dip-Wait 50/50</SheetTitle>
          <SheetDescription>{selectedDipMonth && `${data?.ticker} · First-day price: ${money(selectedDipMonth.firstPrice)} · ${selectedDipMonth.dipOccurred ? `Dip triggered on ${shortDate(selectedDipMonth.dipDate!)} at ${money(selectedDipMonth.dipPrice!)}` : "No 5% dip this month"}`}</SheetDescription>
        </SheetHeader>
        {selectedDipMonth && (
          <div className="detail-content">
            <div className="detail-stats">
              <StatCard label="First-day investment (50%)" value={money(selectedDipMonth.halfBudgetInvested)} detail={`Bought at ${money(selectedDipMonth.firstPrice)}`}/>
              <StatCard label="Dip triggered?" value={selectedDipMonth.dipOccurred ? "Yes ✓" : "No"} detail={selectedDipMonth.dipOccurred ? `On ${shortDate(selectedDipMonth.dipDate!)} — price hit ${money(selectedDipMonth.dipPrice!)}` : "Stock never fell 5% from the first-day price"} tone={selectedDipMonth.dipOccurred ? "positive" : "neutral"}/>
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
