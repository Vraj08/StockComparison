"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownUp, BarChart3, BriefcaseBusiness, ChevronRight, CircleAlert, Download, LineChart as LineChartIcon, LoaderCircle, Moon, Search, Sparkles, Sun, TrendingUp, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateMonth, type MonthCalculation, type PriceField } from "@/lib/dca-core.mjs";
import type { MarketDataResult, MarketPrice } from "@/lib/market-data";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";

type MonthRow = MonthCalculation & { month: string; monthLabel: string };
type SortKey = "month" | "firstPrice" | "tradingDays" | "dcaAverageCost" | "dcaShares" | "differenceShares" | "dcaGain";
const today = new Date().toISOString().slice(0, 10);
const yearsAgo = (years: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10); };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const signedMoney = (value: number) => `${value >= 0 ? "+" : "−"}${money(Math.abs(value))}`;
const shares = (value: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const monthName = (value: string) => new Date(`${value}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

function downloadCsv(name: string, rows: Array<Record<string, string | number | null>>) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((key) => escape(row[key])).join(","))].join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = name; link.click(); URL.revokeObjectURL(link.href);
}

function StatCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "neutral" | "positive" | "negative" }) {
  return <article className="stat-card"><p>{label}</p><strong className={tone === "positive" ? "positive" : tone === "negative" ? "negative" : ""}>{value}</strong><span>{detail}</span></article>;
}

export default function Home() {
  const [ticker, setTicker] = useState("VOO");
  const [start, setStart] = useState(yearsAgo(1));
  const [end, setEnd] = useState(today);
  const [priceField, setPriceField] = useState<PriceField>("close");
  const [data, setData] = useState<MarketDataResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MonthRow | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({ key: "month", direction: -1 });
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<"portfolio" | "research">("portfolio");

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
    return [...groups.entries()].map(([month, rows]) => ({ month, monthLabel: monthName(month), ...calculateMonth(rows, priceField) }));
  }, [data, priceField]);

  const cumulative = useMemo(() => {
    let invested = 0, dcaShares = 0, lumpShares = 0;
    return months.map((row) => { invested += row.monthlyBudget; dcaShares += row.dcaShares; lumpShares += 1; return { date: row.lastDate, marketPrice: row.lastPrice, averageCost: invested / dcaShares, dcaValue: dcaShares * row.lastPrice, lumpValue: lumpShares * row.lastPrice, invested, dcaShares, lumpShares }; });
  }, [months]);
  const summary = cumulative.at(-1);
  const sortedMonths = useMemo(() => [...months].sort((a, b) => { const av = a[sort.key], bv = b[sort.key]; return (typeof av === "string" ? av.localeCompare(String(bv)) : Number(av) - Number(bv)) * sort.direction; }), [months, sort]);
  const priceChart = useMemo(() => { if (!data) return []; const step = Math.max(1, Math.ceil(data.prices.length / 360)); return data.prices.filter((_, i) => i % step === 0 || i === data.prices.length - 1).map((row) => ({ date: row.date, price: row.close })); }, [data]);

  const setRange = (monthsBack: number | "max") => {
    const nextEnd = today; const d = new Date();
    const nextStart = monthsBack === "max" ? "1970-01-01" : (d.setMonth(d.getMonth() - monthsBack), d.toISOString().slice(0, 10));
    setStart(nextStart); setEnd(nextEnd); void load(ticker, nextStart, nextEnd);
  };
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void load(); };
  const changeSort = (key: SortKey) => setSort((current) => ({ key, direction: current.key === key ? current.direction === 1 ? -1 : 1 : 1 }));

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "run_dca_research", title: "Run DCA research", description: "Load historical prices for a U.S. stock or ETF and update the visible first-day-equivalent DCA analysis.", inputSchema: { type: "object", properties: { ticker: { type: "string" }, start: { type: "string" }, end: { type: "string" } }, required: ["ticker", "start", "end"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: async (input: unknown) => { const value = input as { ticker?: string; start?: string; end?: string }; if (!value.ticker || !/^\d{4}-\d{2}-\d{2}$/.test(value.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.end || "")) throw new Error("Ticker, start, and end are required."); setTicker(value.ticker.toUpperCase()); setStart(value.start!); setEnd(value.end!); await load(value.ticker, value.start!, value.end!); return { status: "loaded", ticker: value.ticker.toUpperCase(), start: value.start, end: value.end }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [load]);

  return <main className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><TrendingUp /></span><div><strong>DCA Research Lab</strong><span>Investing explained simply</span></div></div><nav className="view-switch" aria-label="Choose a workspace"><button className={view === "portfolio" ? "active" : ""} onClick={() => setView("portfolio")}><BriefcaseBusiness/> My portfolio</button><button className={view === "research" ? "active" : ""} onClick={() => setView("research")}><LineChartIcon/> Stock research</button></nav><div className="header-actions"><span className="live-pill"><i /> Market data on demand</span><Button variant="ghost" size="icon" aria-label="Toggle color theme" onClick={() => setDark((value) => !value)}>{dark ? <Sun /> : <Moon />}</Button></div></header>
    {view === "portfolio" ? <PortfolioDashboard /> : <>
    <section className="workspace">
      <div className="page-heading"><div><span className="eyebrow"><Sparkles /> One stock or ETF at a time</span><h1>Buy it all at once, or spread it out?</h1><p>Pick a ticker and time period. We compare buying one share on the first market day with spending the same dollars little by little throughout each month.</p></div>{data && <div className="security-chip"><div><strong>{data.ticker}</strong><span>{data.name}</span></div><strong>{money(data.prices.at(-1)?.close || 0)}</strong><span>{shortDate(data.prices.at(-1)?.date || "")}</span></div>}</div>
      <section className="control-panel">
        <form onSubmit={onSubmit} className="search-control"><label htmlFor="ticker">Ticker</label><div className="search-box"><Search /><Input id="ticker" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="Enter ticker" autoComplete="off"/><Button type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : "Analyze"}</Button></div></form>
        <div className="date-control"><label htmlFor="start">Start date</label><Input id="start" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} /></div>
        <div className="date-control"><label htmlFor="end">End date</label><Input id="end" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} /></div>
        <div className="date-control"><label>Purchase price</label><Select value={priceField} onValueChange={(value) => setPriceField(value as PriceField)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="close">Daily close</SelectItem><SelectItem value="open">Daily open</SelectItem></SelectContent></Select></div>
      </section>
      <div className="quick-ranges">{[[1,"1M"],[3,"3M"],[6,"6M"],[12,"1Y"],[36,"3Y"],[60,"5Y"],[120,"10Y"],["max","MAX"]].map(([value,label]) => <button key={label} onClick={() => setRange(value as number | "max")}>{label}</button>)}<span>{priceField === "close" ? "Close uses each trading day’s closing price." : "Open uses each trading day’s opening price."}</span></div>
      {error && <div className="error-banner"><CircleAlert /><div><strong>Couldn’t load this analysis</strong><span>{error}</span></div><Button variant="outline" onClick={() => void load()}>Try again</Button></div>}
      {!error && <>
        <section className="stats-grid">
          <StatCard label="Money put in" value={summary ? money(summary.invested) : "—"} detail={`${months.length} monthly examples`} />
          <StatCard label="Shares built with DCA" value={summary ? shares(summary.dcaShares) : "—"} detail="Includes fractional shares" />
          <StatCard label="Average DCA price" value={summary ? money(summary.invested / summary.dcaShares) : "—"} detail="Money put in ÷ shares bought" />
          <StatCard label="What DCA ended at" value={summary ? money(summary.dcaValue) : "—"} detail={summary ? `${signedMoney(summary.dcaValue - summary.invested)} gain or loss` : "Awaiting data"} tone={summary && summary.dcaValue >= summary.invested ? "positive" : "negative"} />
          <StatCard label="DCA vs buying right away" value={summary ? signedMoney(summary.dcaValue - summary.lumpValue) : "—"} detail="Positive means DCA finished ahead" tone={summary && summary.dcaValue >= summary.lumpValue ? "positive" : "negative"} />
        </section>
        <section className="chart-grid">
          <article className="panel chart-panel"><div className="panel-heading"><div><span>Market history</span><h2>{data?.ticker || "Ticker"} closing price</h2></div><BarChart3 /></div><div className="chart-wrap">{loading ? <div className="chart-loading"><LoaderCircle className="spin" /> Loading verified trading days…</div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={priceChart}><defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52e0c4" stopOpacity={.35}/><stop offset="100%" stopColor="#52e0c4" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/><XAxis dataKey="date" minTickGap={54} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/><YAxis domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={52}/><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10 }} formatter={(v) => money(Number(v))}/><Area type="monotone" dataKey="price" stroke="#52e0c4" strokeWidth={2} fill="url(#priceFill)"/></AreaChart></ResponsiveContainer>}</div></article>
          <article className="panel chart-panel"><div className="panel-heading"><div><span>Cost discipline</span><h2>Market price vs DCA cost</h2></div><WalletCards /></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={cumulative}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/><XAxis dataKey="date" minTickGap={36} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/><YAxis domain={["auto","auto"]} tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={52}/><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10 }} formatter={(v) => money(Number(v))}/><Line type="monotone" dataKey="marketPrice" name="Market price" stroke="#7ea6ff" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="averageCost" name="DCA cost basis" stroke="#f7c65b" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div><div className="legend"><span><i className="blue"/> Market price</span><span><i className="gold"/> DCA average cost</span></div></article>
          <article className="panel chart-panel portfolio-chart"><div className="panel-heading"><div><span>Strategy value</span><h2>DCA portfolio vs monthly first-day purchases</h2></div><TrendingUp /></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={cumulative}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/><XAxis dataKey="date" minTickGap={36} tickFormatter={(v) => v.slice(0,7)} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}/><YAxis tickFormatter={(v) => `$${Math.round(v)}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} width={62}/><Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10 }} formatter={(v) => money(Number(v))}/><Area type="monotone" dataKey="dcaValue" name="DCA value" stroke="#52e0c4" fill="#52e0c422" strokeWidth={2}/><Area type="monotone" dataKey="lumpValue" name="Lump-sum value" stroke="#7ea6ff" fill="#7ea6ff12" strokeWidth={2}/></AreaChart></ResponsiveContainer></div><div className="legend"><span><i/> DCA portfolio</span><span><i className="blue"/> Monthly first-day shares</span></div></article>
        </section>
        <section className="panel table-panel"><div className="panel-heading"><div><span>Month by month</span><h2>First-day share equivalent results</h2><p>Choose a month to inspect every purchase. Column headers sort the table.</p></div><div className="export-actions"><Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker || "ticker"}-monthly-dca.csv`, months.map(({ daily, ...row }) => row))}><Download /> Monthly CSV</Button><Button variant="outline" size="sm" onClick={() => data && downloadCsv(`${data.ticker}-prices.csv`, data.prices)}><Download /> Price history</Button></div></div><Table><TableHeader><TableRow>{[["month","Month"],["firstPrice","First-day price"],["tradingDays","Days"],["dcaAverageCost","DCA cost"],["dcaShares","DCA shares"],["differenceShares","Share difference"],["dcaGain","DCA gain/loss"]].map(([key,label]) => <TableHead key={key}><button onClick={() => changeSort(key as SortKey)}>{label}<ArrowDownUp /></button></TableHead>)}<TableHead>Month-end value</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{sortedMonths.map((row) => <TableRow key={row.month} onClick={() => setSelected(row)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && setSelected(row)}><TableCell><strong>{row.monthLabel}</strong><span className="cell-sub">{shortDate(row.firstDate)}</span></TableCell><TableCell>{money(row.firstPrice)}</TableCell><TableCell>{row.tradingDays}</TableCell><TableCell>{money(row.dcaAverageCost)}</TableCell><TableCell>{shares(row.dcaShares)}</TableCell><TableCell className={row.differenceShares >= 0 ? "positive" : "negative"}>{row.differenceShares >= 0 ? "+" : ""}{shares(row.differenceShares)}</TableCell><TableCell className={row.dcaGain >= 0 ? "positive" : "negative"}>{signedMoney(row.dcaGain)}</TableCell><TableCell>{money(row.dcaEndValue)}</TableCell><TableCell><ChevronRight /></TableCell></TableRow>)}</TableBody></Table></section>
      </>}
      <footer><p>{data?.methodology || "No price data loaded."}</p><p>For personal research and educational purposes only. Historical performance does not guarantee future results. This application does not provide investment advice.</p><span>Data source: {data?.provider || "Yahoo Finance"} · Missing records are never fabricated.</span></footer>
    </section>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><SheetContent className="detail-sheet"><SheetHeader><SheetTitle>{selected?.monthLabel} · Daily purchases</SheetTitle><SheetDescription>{selected && `${data?.ticker} · ${selected.tradingDays} actual trading days · ${money(selected.dailyInvestment)} invested per day`}</SheetDescription></SheetHeader>{selected && <div className="detail-content"><div className="detail-stats"><StatCard label="Monthly budget" value={money(selected.monthlyBudget)} detail="First trading-day price"/><StatCard label="DCA shares" value={shares(selected.dcaShares)} detail={`${selected.differenceShares >= 0 ? "+" : ""}${shares(selected.differenceShares)} vs 1 share`} tone={selected.differenceShares >= 0 ? "positive" : "negative"}/><StatCard label="DCA average cost" value={money(selected.dcaAverageCost)} detail={`Average market price: ${money(selected.averageMarketPrice)}`}/></div><Button variant="outline" size="sm" onClick={() => downloadCsv(`${data?.ticker}-${selected.month}-daily-dca.csv`, selected.daily)}><Download /> Export daily CSV</Button><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Open</TableHead><TableHead>Close</TableHead><TableHead>Price used</TableHead><TableHead>Daily investment</TableHead><TableHead>Shares</TableHead><TableHead>Cumulative investment</TableHead><TableHead>Cumulative shares</TableHead><TableHead>Running cost</TableHead></TableRow></TableHeader><TableBody>{selected.daily.map((row) => <TableRow key={row.date}><TableCell>{shortDate(row.date)}</TableCell><TableCell>{money(row.open)}</TableCell><TableCell>{money(row.close)}</TableCell><TableCell>{money(row.priceUsed)}</TableCell><TableCell>{money(row.dailyInvestment)}</TableCell><TableCell>{shares(row.sharesPurchased)}</TableCell><TableCell>{money(row.cumulativeInvestment)}</TableCell><TableCell>{shares(row.cumulativeShares)}</TableCell><TableCell>{money(row.runningAverageCost)}</TableCell></TableRow>)}</TableBody></Table></div>}</SheetContent></Sheet>
    </>}
  </main>;
}
