"use client"; // Marks this module as a Client Component for Next.js

// Import necessary React functionality: Fragment, lifecycle, refs, state, events.
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
// Import Recharts for rendering the cash flow bar charts.
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Import various Lucide icons for UI enhancements.
import { Download, Search, LoaderCircle, Building2, ExternalLink } from "lucide-react";
// Import a custom tooltip component for Recharts.
import { FinancialChartTooltip } from "@/components/financial-chart-tooltip";
// Import basic UI components.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Import the data definitions and keys for standard cash flow properties.
import { cashFlowRows, type Financials } from "@/lib/financials";

// Type defining a company search result
type Company = { cik_str: number; ticker: string; title: string };

// Helper to determine CSS class names for styling positive/negative financial values.
const valueTone = (value: number | null | undefined) => value == null || value === 0 ? "" : value > 0 ? "positive" : "negative";

// Helper to format large financial numbers into compact strings (e.g. 1.2B)
const compact = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);

// Main component for the SEC Financials viewer
export function CompanyFinancials() {
  // State for the user's current search input text
  const [query, setQuery] = useState("");
  // Array of search results (matching companies)
  const [companies, setCompanies] = useState<Company[]>([]);
  // Tracks if a search has been completed
  const [searched, setSearched] = useState(false);
  // Holds the detailed financial data for the selected company
  const [data, setData] = useState<Financials | null>(null);
  // Loading state boolean
  const [busy, setBusy] = useState(false);
  // Holds error messages if fetching fails
  const [error, setError] = useState("");
  // Manages the currently active UI tab (overview vs cash)
  const [tab, setTab] = useState("cash");
  // The selected lookback period (5 years, 10 years, all)
  const [years, setYears] = useState("5");
  // Toggle for showing full granular cash flow vs a summary
  const [detailed, setDetailed] = useState(false);
  
  // Reference to abort controller to cancel in-flight requests when re-triggering searches
  const request = useRef<AbortController | null>(null);
  // Cleanup effect to abort any active fetch if the component unmounts
  useEffect(() => () => request.current?.abort(), []);

  // Primary function to fetch data. If 'search' is true, it searches by name/ticker.
  // If 'search' is false, it fetches the actual financial statements for the ticker.
  async function load(value: string, search = false) {
    // Abort the previous request if there's one ongoing
    request.current?.abort();
    const controller = new AbortController(); 
    request.current = controller;
    
    // Reset state before starting the new request
    setBusy(true); setError(""); setCompanies([]); setSearched(false); setData(null);
    try {
      // Build API URL based on whether we are searching or loading a specific ticker
      const response = await fetch(`/api/financials?${search ? "q" : "ticker"}=${encodeURIComponent(value)}`, { signal: controller.signal });
      const payload = await response.json();
      
      if (!response.ok) throw new Error(payload.error || "Financials could not be loaded.");
      if (controller.signal.aborted) return; // Ignore if request was aborted
      
      if (search) { 
        // We performed a company search, store the list of results
        setCompanies(payload.companies); 
        setSearched(true); 
      } else { 
        // We loaded financials for a specific company, store the payload and update the search bar
        setData(payload); 
        setQuery(payload.ticker); 
      }
    } catch (cause) { 
      // Handle non-abort errors
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Financials could not be loaded."); 
    } finally { 
      if (!controller.signal.aborted) setBusy(false); 
    }
  }

  // Handle form submission from the search bar
  function submit(event: FormEvent) { 
    event.preventDefault(); 
    if (query.trim()) void load(query.trim(), true); 
  }
  
  // Prepare the periods to display based on the 'years' dropdown setting
  const periods = data?.periods.slice(0, years === "all" ? undefined : Number(years)) || [];
  const latest = data?.periods[0]; // The most recent reporting period
  
  // Prepare the dataset for the BarChart, reversing the periods to be chronological left-to-right
  const chartData = [...periods].reverse().map(p => ({ 
    date: p.end, 
    // Convert to billions for the chart y-axis
    operating: p.values.operating === null ? null : p.values.operating / 1e9, 
    free: p.values.free === null ? null : p.values.free / 1e9 
  }));
  
  // General formatter for table cell values
  const format = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(value);
  
  // Function to create and download a CSV of the displayed cash flow statement
  function exportCsv() {
    if (!data) return;
    // Build the rows array for CSV generation. First header row, then data rows, then footer.
    const rows = [
      ["Cash flow item (USD, unscaled)", ...periods.map(p => p.end)], 
      ...cashFlowRows.map(row => [row.label, ...periods.map(p => p.values[row.key] ?? "")]), 
      ["Source filing accession", ...periods.map(p => p.accession)]
    ];
    // Convert the 2D array to a CSV string format
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    // Generate a downloadable link via an Object URL
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${data.ticker}-annual-cash-flow.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="workspace financials-workspace">
    {/* Page Header */}
    <div className="page-heading">
      <div><span className="eyebrow"><Building2 /> Company financials</span><h1>Follow the cash, year by year.</h1><p>Explore how a company earns, invests, and returns cash. Search a U.S. company to read its annual cash flow history.</p></div>
      <span className="financials-source">SEC filings · Annual · USD</span>
    </div>

    {/* Search Panel */}
    <section className="panel financials-search">
      <form onSubmit={submit}>
        <label htmlFor="company-search">Company name or stock ticker</label>
        <div className="search-box">
          <Search />
          <Input id="company-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Apple, Microsoft, NVDA…" maxLength={80}/>
          <Button disabled={!query.trim()} type="submit">Search</Button>
        </div>
      </form>
      {/* Quick shortcuts to popular tickers */}
      <div className="financials-shortcuts">
        <span>Explore</span>
        {["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA"].map(ticker => <Button key={ticker} size="sm" variant="outline" onClick={() => void load(ticker)}>{ticker}</Button>)}
      </div>
    </section>

    {/* Dynamic Status / Results Messages */}
    <div aria-live="polite">
      {busy && <div className="financials-empty"><LoaderCircle className="spin"/><p>Loading SEC financial data…</p></div>}
      {error && <div className="error-banner" role="alert"><div><strong>Could not load financials</strong><span>{error}</span></div></div>}
      {searched && <section className="panel financials-results">
        <h2>{companies.length ? "Select a company" : "No matching companies"}</h2>
        {companies.length ? companies.map(company => <button key={company.ticker} onClick={() => void load(company.ticker)}><strong>{company.ticker}</strong><span>{company.title}</span><span>View financials →</span></button>) : <p>Try a U.S. stock ticker or another company name. Funds and ETFs do not report company cash flow statements.</p>}
      </section>}
    </div>
    
    {/* Default empty state */}
    {!data && !busy && !searched && !error && <div className="financials-empty"><Building2/><h2>A closer look behind the stock.</h2><p>Choose a company above to see operating cash flow, capital spending, dividends, buybacks, and free cash flow across available years.</p></div>}
    
    {/* Financial Data View */}
    {data && <>
      <div className="financials-company">
        <div><span className="eyebrow">{data.ticker} · Company overview</span><h2>{data.name}</h2><p>{data.periods.length ? `${data.periods.length} annual periods available · Latest year ended ${latest?.end}` : "No supported annual cash flow data available"}</p></div>
        <a href={`https://www.sec.gov/edgar/browse/?CIK=${data.cik}&owner=exclude`} target="_blank" rel="noreferrer">SEC filings <ExternalLink size={14}/></a>
      </div>
      
      {/* Condition if a ticker exists but has no supported annual periods */}
      {!latest ? <div className="plain-note"><p>This company has no supported USD / U.S. GAAP annual cash flow statements in the SEC dataset. Foreign issuers, company-specific accounting tags, and funds may not be covered. Try another company or open its filings.</p></div> : <>
        
        {/* Navigation Tabs */}
        <nav className="financials-tabs" aria-label="Company sections">
          <button aria-pressed={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
          <button aria-pressed={tab === "cash"} onClick={() => setTab("cash")}>Financials · Cash flow</button>
        </nav>
        
        {/* Key latest-year stats grid */}
        <div className="stats-grid financials-stats">
          {[["income", "Net income / loss"], ["operating", "Cash from Operating Activities"], ["investing", "Cash from Investing Activities"], ["financing", "Cash from Financing Activities"], ["free", "Free cash flow"]].map(([key, label]) => 
            <article className="stat-card" key={key}><p>{label}</p><strong className={valueTone(latest.values[key])}>{compact(latest.values[key])}</strong><span>USD · Year ended {latest.end}</span></article>
          )}
        </div>
        
        {/* Controls for the chart & table scope */}
        <div className="financials-controls">
          <label>History
            <select value={years} onChange={e => setYears(e.target.value)}>
              <option value="5">Last 5 years</option>
              <option value="10">Last 10 years</option>
              <option value="all">All available years</option>
            </select>
          </label>
        </div>
        
        {/* Recharts Bar Chart Section */}
        <section className="panel financials-chart">
          <div className="panel-heading"><div><span>Cash generation</span><h2>The story behind the numbers</h2><p>Annual cash flow · USD billions</p></div><div className="cash-chart-key"><span><i/>Operating</span><span><i/>Free cash flow</span></div></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={5} margin={{ top: 20, right: 20, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--grid)" strokeDasharray="4 8" vertical={false}/>
                <XAxis dataKey="date" tickFormatter={value => String(value).slice(0,4)} axisLine={false} tickLine={false} tickMargin={12} stroke="var(--muted-foreground)" tick={{ fontSize: 12 }}/>
                <YAxis axisLine={false} tickLine={false} tickMargin={10} tickFormatter={value => `${value}B`} stroke="var(--muted-foreground)" tick={{ fontSize: 12 }}/>
                <ReferenceLine y={0} stroke="var(--border)"/>
                <Tooltip content={<FinancialChartTooltip billions/>} cursor={false}/>
                <Bar dataKey="operating" name="Cash from Operating Activities" maxBarSize={38} radius={[6,6,0,0]}>{chartData.map(p => <Cell key={p.date} fill={(p.operating ?? 0) < 0 ? "var(--negative)" : "var(--positive)"}/>)}</Bar>
                <Bar dataKey="free" name="Free cash flow" maxBarSize={38} radius={[6,6,0,0]}>{chartData.map(p => <Cell key={p.date} fill={(p.free ?? 0) < 0 ? "var(--negative-soft)" : "var(--positive-soft)"} stroke={(p.free ?? 0) < 0 ? "var(--negative)" : "var(--positive)"} strokeWidth={1}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote"><span className="positive">● Positive cash flow</span><span className="negative">● Negative cash flow</span><span>Hover for exact fiscal period and values</span></div>
        </section>
        
        {/* Tab Content Display */}
        {tab === "overview" ? <div className="financials-explain">
          <article className="panel"><h3>Operating cash flow</h3><p>Cash generated or used by day-to-day business operations, after noncash adjustments and changes in working capital.</p></article>
          <article className="panel"><h3>Free cash flow</h3><p>Operating cash flow minus purchases of property, plant, and equipment. This calculated measure can differ from a company’s own definition.</p></article>
          <article className="panel"><h3>Investing & financing</h3><p>Investing includes assets and acquisitions. Financing includes borrowing, repaying debt, dividends, and share repurchases.</p></article>
        </div> :
        <section className="panel table-panel financials-table">
          <div className="panel-heading">
            <div><span>Financials / Cash flow</span><h2>Annual cash flow statement</h2><p>Green: positive · Red: negative · Cash outflows are not necessarily losses</p></div>
            {/* Table controls */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <Button variant="outline" size="sm" onClick={() => setDetailed(!detailed)}>{detailed ? "Show summary" : "Show detailed"}</Button>
              <Button variant="outline" size="sm" onClick={exportCsv}><Download/> Export CSV</Button>
            </div>
          </div>
          {/* Scrollable table container */}
          <div className="financials-table-scroll" tabIndex={0} role="region" aria-label="Annual cash flow statement, scroll horizontally for earlier years">
            <table>
              <thead><tr><th scope="col">Fiscal period ended</th>{periods.map(p => <th scope="col" key={p.end}>{p.end}</th>)}</tr></thead>
              <tbody>
                {cashFlowRows.filter(row => detailed || "total" in row).map((row, i, arr) => <Fragment key={row.key}>
                  {/* Insert grouping headers when the group changes */}
                  {(detailed && (i === 0 || row.group !== arr[i-1].group)) && <tr className="financials-group"><th colSpan={periods.length+1}>{row.group}</th></tr>}
                  {/* Data Row */}
                  <tr className={"total" in row ? "financials-total" : ""}>
                    <th scope="row">{row.label}</th>
                    {periods.map(p => <td key={p.end} className={valueTone(p.values[row.key])}>{format(p.values[row.key])}</td>)}
                  </tr>
                </Fragment>)}
                {/* Source link footer row */}
                <tr><th scope="row">Source filing</th>{periods.map(p => <td key={p.end}><a href={`https://www.sec.gov/Archives/edgar/data/${data.cik}/${p.accession.replaceAll("-", "")}/${p.accession}-index.html`} target="_blank" rel="noreferrer">{p.filed} ↗</a></td>)}</tr>
              </tbody>
            </table>
          </div>
        </section>}
        
        {/* Disclaimers */}
        <div className="method-note"><p><strong>About these figures.</strong> Selected standardized cash flow lines from SEC annual filings, not a complete reproduction of every company’s statement. Available components may not sum to totals. Each period uses the most recently filed annual operating cash flow and matching facts from that filing, including comparative restatements. A dash means unavailable, never zero. Free cash flow = operating cash flow − capital expenditure. Periods follow each company’s fiscal calendar; quarterly and international statements are not included. <a href={data.source} target="_blank" rel="noreferrer">View source data ↗</a></p></div>
      </>}
    </>}
  </section>;
}
