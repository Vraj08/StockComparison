"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDown, ArrowRight, BriefcaseBusiness, Check, FileSpreadsheet, Gauge, History, Layers3, LoaderCircle, Newspaper, ShieldCheck, Sparkles, Target, UploadCloud } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ParsedPosition = { ticker: string; quantity: number; netInvested: number };
type ScenarioKey = "worst" | "bear" | "base" | "bull" | "best" | "average" | "realistic";
type ScenarioCurve = Record<ScenarioKey, number> & { source: "rolling history" | "history-adjusted model"; samples: number };
type PortfolioResult = {
  asOf: string;
  totalValue: number;
  positions: Array<{ ticker: string; name: string; quantity: number; netInvested: number; latestPrice: number; priceDate: string; marketValue: number; oneYearReturn: number; volatility: number; maxDrawdown: number; weight: number; sector: string; industry: string; nextYear: { low: number; base: number; high: number } }>;
  unavailable: Array<{ ticker: string; error: string }>;
  scenarioCurves: Record<string, ScenarioCurve>;
  historicalReturns: Array<{ years: number; available: boolean; totalReturn: number | null; annualizedReturn: number | null; coverage: number; hypotheticalValue: number | null }>;
  portfolioVolatility: number;
  largestWeight: number;
  concentrationIndex: number;
  sectors: Array<{ sector: string; weight: number }>;
  risk: { score: number; label: string; realisticDownside: number; largestHistoricalHoldingDrawdown: number };
  diversification: { score: number; label: string; effectiveHoldings: number; knownSectorWeight: number };
  marketMood: string;
  strategy: { recommended: "alwaysIn" | "blend" | "dailyDca"; fit: string; explanation: string };
  news: Array<{ ticker: string; title: string; url: string; publisher: string; publishedAt: string | null; sentiment: "positive" | "negative" | "neutral" }>;
  methodology: string;
};

const COLORS = ["#52e0c4", "#7ea6ff", "#f7c65b", "#be8cf5", "#ff8294", "#58b5d9", "#8ad17e", "#dd8b4f"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const pct = (value: number) => new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) { const char = text[i]; if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ",") { row.push(field); field = ""; } else if (char === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; } else field += char; }
  row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); return rows;
}
const numberFrom = (value = "") => { const negative = /^\s*\(/.test(value); const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed * (negative ? -1 : 1) : 0; };
function positionsFromCsv(text: string) {
  const rows = parseCsv(text); if (rows.length < 2) throw new Error("The CSV does not contain any portfolio rows.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const index = (...names: string[]) => headers.findIndex((header) => names.includes(header));
  const tickerIndex = index("instrument", "ticker", "symbol"); const quantityIndex = index("quantity", "shares", "share quantity");
  const actionIndex = index("trans code", "action", "type", "transaction type"); const amountIndex = index("amount", "net amount", "cost basis"); const priceIndex = index("price", "average price", "avg price");
  if (tickerIndex < 0 || quantityIndex < 0) throw new Error("I could not find ticker and quantity columns. Use Instrument/Ticker and Quantity/Shares.");
  const map = new Map<string, ParsedPosition>();
  rows.slice(1).forEach((values) => { const ticker = (values[tickerIndex] || "").trim().toUpperCase(); if (!/^[A-Z0-9.-]{1,12}$/.test(ticker)) return; const action = (values[actionIndex] || "position").trim().toLowerCase(); const rawQuantity = Math.abs(numberFrom(values[quantityIndex])); if (!rawQuantity) return; const sign = /sell|sold/.test(action) ? -1 : /buy|position|holding/.test(action) || actionIndex < 0 ? 1 : 0; if (!sign) return; const amount = Math.abs(numberFrom(values[amountIndex])) || rawQuantity * Math.abs(numberFrom(values[priceIndex])); const current = map.get(ticker) || { ticker, quantity: 0, netInvested: 0 }; current.quantity += sign * rawQuantity; current.netInvested += sign * amount; map.set(ticker, current); });
  const positions = [...map.values()].filter((item) => item.quantity > .0000001).sort((a, b) => b.netInvested - a.netInvested);
  if (!positions.length) throw new Error("No positive stock or ETF positions were found after buys and sells were combined.");
  return { positions, transactionExport: actionIndex >= 0, rowCount: rows.length - 1 };
}

function futureValue(current: number, monthly: number, years: number, annualRate: number) {
  const safeAnnual = Math.max(-.99, annualRate);
  const rate = Math.pow(1 + safeAnnual, 1 / 12) - 1;
  const months = Math.max(0, years * 12);
  const growth = Math.pow(1 + rate, months);
  const additions = Math.abs(rate) < 1e-9 ? monthly * months : monthly * ((growth - 1) / rate);
  return Math.max(0, current * growth + additions);
}

export function PortfolioDashboard() {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ positions: ParsedPosition[]; transactionExport: boolean; rowCount: number } | null>(null);
  const [result, setResult] = useState<PortfolioResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [years, setYears] = useState(10);
  const [monthly, setMonthly] = useState(500);
  const [downsideDrop, setDownsideDrop] = useState(10);
  const [customReturn, setCustomReturn] = useState(12);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setError(""); setResult(null);
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Please upload a CSV file.");
      const next = positionsFromCsv(await file.text()); setFileName(file.name); setParsed(next); setLoading(true);
      const response = await fetch("/api/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions: next.positions }) });
      const payload = await response.json() as PortfolioResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Portfolio analysis failed.");
      setResult(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be read."); } finally { setLoading(false); }
  };

  const curve = result?.scenarioCurves[String(years)];
  const projected = useMemo(() => {
    if (!result || !curve) return null;
    const rates: Record<ScenarioKey | "custom", number> = { worst: curve.worst, bear: curve.bear, base: curve.base, bull: curve.bull, best: curve.best, average: curve.average, realistic: curve.realistic, custom: customReturn / 100 };
    const cashValue = result.totalValue + monthly * years * 12;
    return Object.fromEntries(Object.entries(rates).map(([key, appliedRate]) => {
      const ending = futureValue(result.totalValue, monthly, years, appliedRate);
      const noNewMoney = futureValue(result.totalValue, 0, years, appliedRate);
      return [key, { ending, noNewMoney, cashValue, marketEffect: ending - cashValue, appliedRate }];
    })) as Record<ScenarioKey | "custom", { ending: number; noNewMoney: number; cashValue: number; marketEffect: number; appliedRate: number }>;
  }, [result, curve, monthly, years, customReturn]);

  const drop = (event: DragEvent) => { event.preventDefault(); setDragging(false); void handleFile(event.dataTransfer.files[0]); };
  const concentration = result ? result.largestWeight >= .3 ? "High" : result.largestWeight >= .18 ? "Medium" : "Lower" : "—";
  const endOf2026 = new Date("2026-12-31T23:59:59Z");
  const yearsTo2026 = Math.max(0, (endOf2026.getTime() - Date.now()) / (365.2425 * 86400000));
  const monthsTo2026 = yearsTo2026 * 12;
  const baseRate = result?.scenarioCurves["1"]?.realistic || 0;
  const dec2026NoAdds = result ? futureValue(result.totalValue, 0, yearsTo2026, baseRate) : 0;
  const dec2026WithAdds = result ? futureValue(result.totalValue, monthly, yearsTo2026, baseRate) : 0;
  const dec2026Cash = result ? result.totalValue + monthly * monthsTo2026 : 0;

  return <section className="workspace portfolio-workspace">
    <div className="portfolio-hero"><div><span className="eyebrow"><Sparkles/> Your portfolio, explained simply</span><h1>Upload your CSV. Get the whole picture.</h1><p>See allocation, portfolio-specific historical ranges, risk, diversification, and what several investment paths could mean in dollars.</p></div><div className="privacy-note"><ShieldCheck/><div><strong>Your CSV stays private</strong><span>The raw file is read in your browser and is not stored.</span></div></div></div>
    <div className="simple-steps"><span className={parsed ? "done" : "active"}><i>{parsed ? <Check/> : "1"}</i> Upload CSV</span><ArrowRight/><span className={loading ? "active" : result ? "done" : ""}><i>{result ? <Check/> : "2"}</i> Check market data</span><ArrowRight/><span className={result ? "active" : ""}><i>3</i> Read your snapshot</span></div>
    <label className={`upload-card ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}><input type="file" accept=".csv,text/csv" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])}/><span className="upload-icon">{loading ? <LoaderCircle className="spin"/> : <UploadCloud/>}</span><div><strong>{loading ? "Reading your portfolio and market history…" : fileName || "Drop your portfolio CSV here"}</strong><span>{parsed ? `${parsed.rowCount} rows · ${parsed.positions.length} positions found` : "Or click to choose a file. Robinhood-style transaction exports and basic holdings files are supported."}</span></div><Button type="button" variant="outline">Choose CSV</Button></label>
    {error && <div className="error-banner"><AlertTriangle/><div><strong>I couldn’t read that portfolio</strong><span>{error}</span></div></div>}
    {parsed?.transactionExport && <div className="plain-note"><FileSpreadsheet/><div><strong>This is a transaction-history file.</strong><span>The snapshot combines buys and sells inside the CSV. If the export is incomplete, the estimated holdings may also be incomplete.</span></div></div>}

    {result && projected && curve && <>
      <section className="plain-summary"><div className="summary-icon"><BriefcaseBusiness/></div><div><span>Your snapshot</span><h2>{money(result.totalValue)} estimated market value</h2><p>{result.positions.length} positions with market data as of {new Date(`${result.asOf}T00:00:00`).toLocaleDateString()}.</p></div><div className="summary-facts"><div><span>Largest holding</span><strong>{result.positions[0]?.ticker} · {pct(result.largestWeight)}</strong></div><div><span>Risk score</span><strong>{result.risk.score}/100 · {result.risk.label}</strong></div><div><span>Diversification</span><strong>{result.diversification.score}/100 · {result.diversification.label}</strong></div></div></section>

      <section className="explain-grid">
        <article className="panel allocation-card"><div className="panel-heading"><div><span>What you own</span><h2>Portfolio mix</h2><p>Bigger slices mean more of your balance depends on that holding.</p></div></div><div className="allocation-body"><div className="donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={result.positions.slice(0,8)} dataKey="marketValue" nameKey="ticker" innerRadius="62%" outerRadius="90%" paddingAngle={2}>{result.positions.slice(0,8).map((item,index)=><Cell key={item.ticker} fill={COLORS[index%COLORS.length]}/>)}</Pie><Tooltip formatter={(value)=>money(Number(value))} contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:10}}/></PieChart></ResponsiveContainer><div><strong>{result.positions.length}</strong><span>holdings</span></div></div><div className="allocation-list">{result.positions.slice(0,7).map((item,index)=><div key={item.ticker}><i style={{background:COLORS[index%COLORS.length]}}/><strong>{item.ticker}</strong><span>{pct(item.weight)}</span></div>)}</div></div></article>
        <article className="panel strategy-card"><div className="strategy-top"><span className="summary-icon"><Gauge/></span><div><span>What may fit new money</span><h2>{result.strategy.fit}</h2></div></div><p>{result.strategy.explanation}</p><div className="strategy-compare"><div className={result.strategy.recommended === "alwaysIn" ? "recommended" : ""}><strong>Always-In {result.strategy.recommended === "alwaysIn" && <b>Best fit</b>}</strong><span>Invest new cash immediately for maximum time in the market.</span></div><div className={result.strategy.recommended === "blend" ? "recommended" : ""}><strong>50/50 blend {result.strategy.recommended === "blend" && <b>Best fit</b>}</strong><span>Invest half now and phase the other half in during volatility.</span></div><div className={result.strategy.recommended === "dailyDca" ? "recommended" : ""}><strong>Daily DCA {result.strategy.recommended === "dailyDca" && <b>Best fit</b>}</strong><span>Spread purchases out to reduce single-day entry risk.</span></div></div><small>The fit uses allocation concentration, historical price swings, and diversification. It does not know your goals, taxes, or cash needs.</small></article>
      </section>

      <section className="panel risk-panel">
        <div className="panel-heading"><div><span>Risk & diversification</span><h2>Where portfolio risk is coming from</h2><p>Scores combine current weights, historical volatility, holding concentration, and sector spread.</p></div><Activity/></div>
        <div className="risk-layout"><div className="score-stack"><article><span>Risk</span><strong>{result.risk.score}<small>/100</small></strong><b>{result.risk.label}</b><div className="score-track"><i style={{width:`${result.risk.score}%`}}/></div></article><article><span>Diversification</span><strong>{result.diversification.score}<small>/100</small></strong><b>{result.diversification.label}</b><div className="score-track diversity"><i style={{width:`${result.diversification.score}%`}}/></div></article><p><strong>{result.diversification.effectiveHoldings.toFixed(1)} effective holdings.</strong> This adjusts the raw holding count for concentration; ten equally weighted holdings would equal 10.</p></div><div className="sector-list"><div className="sector-title"><Layers3/><div><strong>Allocation by sector</strong><span>{pct(result.diversification.knownSectorWeight)} classified by the market-data provider</span></div></div>{result.sectors.map((item,index)=><div className="sector-row" key={item.sector}><span>{item.sector}</span><div><i style={{width:`${item.weight*100}%`,background:COLORS[index%COLORS.length]}}/></div><strong>{pct(item.weight)}</strong></div>)}</div></div>
      </section>

      <section className="panel stress-panel">
        <div className="panel-heading"><div><span>Downside check</span><h2>If the market dropped today</h2><p>Move the slider for your own stress test, then compare it with a portfolio-specific downside estimate.</p></div><ArrowDown/></div>
        <div className="stress-layout"><div className="slider-card"><label><span>Drop percentage</span><strong>{downsideDrop}%</strong></label><input aria-label="Drop percentage" type="range" min="1" max="70" value={downsideDrop} onChange={(event)=>setDownsideDrop(Number(event.target.value))}/><div className="stress-result"><span>Your selected fall</span><strong className="negative">−{money(result.totalValue * downsideDrop / 100)}</strong><p>Estimated remaining balance <b>{money(result.totalValue * (1 - downsideDrop / 100))}</b></p></div></div><div className="downside-estimate"><span><Target/> Portfolio-based estimate</span><strong>{pct(result.risk.realisticDownside)} downside</strong><p>About <b>−{money(result.totalValue * result.risk.realisticDownside)}</b>, leaving roughly <b>{money(result.totalValue * (1-result.risk.realisticDownside))}</b>.</p><small>This is a planning stress estimate derived from the portfolio’s weighted volatility, concentration, and one-year bear range—not a guaranteed forecast or the worst possible loss.</small></div></div>
      </section>

      <section className="panel scenario-panel">
        <div className="panel-heading"><div><span>Long-term calculator</span><h2>Invested versus left as cash</h2><p>Every portfolio case now uses your current allocation and a rate calculated for the selected horizon.</p></div><div className="scenario-controls"><div className="year-presets"><span>Years</span>{[1,5,10,20,30,40,50].map((value)=><button className={years===value?"active":""} key={value} onClick={()=>setYears(value)}>{value}</button>)}</div><label><span>Or type years</span><Input aria-label="Projection years" type="number" min="1" max="50" value={years} onChange={(event)=>setYears(Math.min(50,Math.max(1,Number(event.target.value)||1)))}/></label><label><span>Add each month</span><Input type="number" min="0" step="50" value={monthly} onChange={(event)=>setMonthly(Math.max(0,Number(event.target.value)||0))}/></label></div></div>
        <div className="custom-rate"><label><span>Your custom expected return</span><strong>{customReturn}%/yr</strong></label><input aria-label="Custom expected annual return" type="range" min="-30" max="50" value={customReturn} onChange={(event)=>setCustomReturn(Number(event.target.value))}/></div>
        <div className="calculator-compare"><article><span>If the money stays invested</span><strong>{money(projected.realistic.ending)}</strong><p>Portfolio-tailored realistic case with {money(monthly)} added monthly.</p></article><article><span>If you leave the same dollars as cash</span><strong>{money(projected.realistic.cashValue)}</strong><p>No investment return: today’s balance plus the same monthly additions.</p></article><article><span>Difference from market movement</span><strong className={projected.realistic.marketEffect>=0?"positive":"negative"}>{projected.realistic.marketEffect>=0?"+":"−"}{money(Math.abs(projected.realistic.marketEffect))}</strong><p>Invested result minus the zero-return cash baseline.</p></article></div>
        <div className="projection-start"><span>Starting portfolio <strong>{money(result.totalValue)}</strong></span><span>Added over {years} years <strong>{money(monthly*years*12)}</strong></span><span>Scenario source <strong>{curve.source}{curve.samples?` · ${curve.samples} windows`:""}</strong></span></div>

        {yearsTo2026 > 0 && <div className="year-end-block"><div><span>December 31, 2026 outlook</span><h3>Portfolio-tailored realistic rate: {pct(baseRate)}/yr</h3><p>Uses the remaining {monthsTo2026.toFixed(1)} months and today’s allocation.</p></div><article><span>Keep current holdings, add nothing</span><strong>{money(dec2026NoAdds)}</strong></article><article><span>Keep investing {money(monthly)}/month</span><strong>{money(dec2026WithAdds)}</strong></article><article><span>Leave it as zero-return cash</span><strong>{money(dec2026Cash)}</strong></article></div>}

        <div className="scenario-grid">{[
          {key:"worst",label:"Worst historical range",help:"5th-percentile rolling result"}, {key:"bear",label:"Bear case",help:"25th-percentile rolling result"}, {key:"base",label:"Base case",help:"Median rolling result"}, {key:"bull",label:"Bull case",help:"75th-percentile rolling result"}, {key:"best",label:"Best historical range",help:"95th-percentile rolling result"}, {key:"average",label:"Average case",help:"Average rolling result"}, {key:"realistic",label:"Modern realistic case",help:"Median and average, tempered for concentration"}, {key:"custom",label:"Your custom case",help:`Your ${customReturn}% annual assumption`}
        ].map((item)=>{ const value=projected[item.key as ScenarioKey|"custom"]; return <article key={item.key} className={`scenario ${item.key}`}><span>{item.label}</span><strong>{money(value.ending)}</strong><em>With {money(monthly)}/month for {years} year{years===1?"":"s"}</em><dl><div><dt>Rate for this horizon</dt><dd>{pct(value.appliedRate)}/yr</dd></div><div><dt>No new contributions</dt><dd>{money(value.noNewMoney)}</dd></div><div><dt>Zero-return cash</dt><dd>{money(value.cashValue)}</dd></div><div><dt>Vs. cash</dt><dd className={value.marketEffect>=0?"positive":"negative"}>{value.marketEffect>=0?"+":"−"}{money(Math.abs(value.marketEffect))}</dd></div></dl><p>{item.help}</p></article>; })}</div>
        <div className="scenario-explainer"><AlertTriangle/><div><p><strong>Why the rate changes:</strong> a 1-year outcome uses one-year historical windows; a 5-year outcome uses rolling five-year annualized returns, and so on. If a holding does not have enough history for that horizon, the model uses its available history and narrows the uncertainty range over time.</p><p>Portfolio size changes the dollar outcome, while allocation and holding performance determine the percentage rate. These are planning ranges, not promises.</p></div></div>
      </section>

      <section className="panel history-panel"><div className="panel-heading"><div><span>Reconstructed history</span><h2>How today’s allocation would have changed</h2><p>This is a backward-looking reconstruction of the portfolio you hold now—not a claim that you owned these shares 2, 5, 10, or 20 years ago.</p></div><History/></div><div className="history-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={result.historicalReturns.filter((item)=>item.available).map((item)=>({...item,label:`${item.years}Y`,percent:(item.totalReturn||0)*100}))} margin={{top:20,right:20,left:0,bottom:0}}><defs><linearGradient id="returnBarPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#52e0c4"/><stop offset="100%" stopColor="#7ea6ff"/></linearGradient><linearGradient id="returnBarNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff8294"/><stop offset="100%" stopColor="#ff5274"/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--grid)"/><XAxis dataKey="label" tick={{fill:"var(--muted-foreground)",fontSize:12}} tickMargin={10}/><YAxis tickFormatter={(value)=>`${Math.round(value)}%`} tick={{fill:"var(--muted-foreground)",fontSize:11}} width={58}/><ReferenceLine y={0} stroke="var(--muted-foreground)" strokeWidth={2}/><Tooltip cursor={{fill:"var(--muted)",opacity:.4}} contentStyle={{background:"var(--popover)",border:"1px solid var(--border)",borderRadius:12}} formatter={(value)=>[`${Number(value).toFixed(1)}% total return`,"Reconstructed portfolio"]}/><Bar dataKey="percent" radius={[7,7,0,0]} maxBarSize={60}>{result.historicalReturns.filter((item)=>item.available).map((entry,index)=><Cell key={index} fill={(entry.totalReturn||0)>=0?"url(#returnBarPos)":"url(#returnBarNeg)"}/>)}</Bar></BarChart></ResponsiveContainer></div><div className="return-cards">{result.historicalReturns.map((item)=><div key={item.years} className={!item.available?"unavailable":""}><span>{item.years} year{item.years===1?"":"s"}</span>{item.available?<><strong className={(item.totalReturn||0)>=0?"positive":"negative"}>{pct(item.totalReturn||0)}</strong><small>{pct(item.annualizedReturn||0)}/yr · {pct(item.coverage)} coverage</small><small>Current balance equivalent: {money(item.hypotheticalValue||0)}</small></>:<><strong>Not enough history</strong><small>Less than 35% of today’s portfolio had a full record.</small></>}</div>)}</div></section>

      <section className="panel holdings-panel"><div className="panel-heading"><div><span>Your positions</span><h2>What each holding contributes</h2><p>“1-year move” is the adjusted-price return. “Next-year outlook” is a historical range and midpoint, not a price target.</p></div></div><Table><TableHeader><TableRow><TableHead>Holding</TableHead><TableHead>Shares</TableHead><TableHead>Latest price</TableHead><TableHead>Estimated value</TableHead><TableHead>Portfolio share</TableHead><TableHead>Sector</TableHead><TableHead>1-year move</TableHead><TableHead>Next-year outlook</TableHead><TableHead>Price swing</TableHead></TableRow></TableHeader><TableBody>{result.positions.map((item)=><TableRow key={item.ticker}><TableCell><strong>{item.ticker}</strong><span className="cell-sub">{item.name}</span></TableCell><TableCell>{item.quantity.toFixed(4)}</TableCell><TableCell>{money(item.latestPrice)}</TableCell><TableCell>{money(item.marketValue)}</TableCell><TableCell>{pct(item.weight)}</TableCell><TableCell>{item.sector}</TableCell><TableCell className={item.oneYearReturn>=0?"positive":"negative"}>{pct(item.oneYearReturn)}</TableCell><TableCell><strong className={item.nextYear.base>=0?"positive":"negative"}>{pct(item.nextYear.base)}</strong><span className="cell-sub">{pct(item.nextYear.low)} to {pct(item.nextYear.high)}</span></TableCell><TableCell>{item.volatility>=.4?"High":item.volatility>=.25?"Medium":"Lower"}</TableCell></TableRow>)}</TableBody></Table></section>

      <section className="panel news-panel"><div className="panel-heading"><div><span>What the market is talking about</span><h2>Recent news tied to your largest holdings</h2><p>Headline tone is a quick keyword scan. Open the story before drawing a conclusion.</p></div><Newspaper/></div><div className="news-grid">{result.news.length?result.news.map((item)=><a key={item.url} href={item.url} target="_blank" rel="noreferrer"><div><span>{item.ticker}</span><em className={item.sentiment}>{item.sentiment}</em></div><strong>{item.title}</strong><small>{item.publisher}{item.publishedAt?` · ${new Date(item.publishedAt).toLocaleDateString()}`:""}</small></a>):<div className="empty-news">No recent provider headlines were available for these tickers.</div>}</div></section>
      {result.unavailable.length>0 && <div className="plain-note"><AlertTriangle/><div><strong>{result.unavailable.length} holding{result.unavailable.length===1?" was":"s were"} excluded.</strong><span>{result.unavailable.map((item)=>item.ticker).join(", ")} did not return usable market history.</span></div></div>}
      <div className="method-note"><ShieldCheck/><p><strong>How this works:</strong> {result.methodology} For personal research and education only. It does not consider your income, taxes, debts, goals, or risk tolerance.</p></div>
    </>}
  </section>;
}
