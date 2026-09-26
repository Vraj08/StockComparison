"use client"; // Specifies that this component runs on the client side in a Next.js environment

// Import React hooks for memoization and state management
import { useMemo, useState } from "react";
// Import Recharts components for rendering the interactive area chart
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
// Import custom tooltip component for the financial chart
import { FinancialChartTooltip } from "@/components/financial-chart-tooltip";
// Import custom UI input component
import { Input } from "@/components/ui/input";
// Import custom UI table components
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// Import the core calculation logic for the withdrawal plan
import { calculateWithdrawalPlan } from "@/lib/withdrawal-plan.mjs";

/**
 * Utility function to format numbers as US dollars with no decimal places.
 * @param value The number to format.
 * @returns A formatted currency string (e.g., "$10,000").
 */
const money = (value: number) => 
  new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency: "USD", 
    maximumFractionDigits: 0 
  }).format(value);

/**
 * WithdrawalPlanner component
 * Provides an interactive UI to simulate retirement withdrawals,
 * adjusting for inflation and portfolio returns over a specified age range.
 */
export function WithdrawalPlanner() {
  // State for all the form inputs. Values are stored as strings for native input handling.
  const [values, setValues] = useState({ 
    balance: "10000000",        // Starting portfolio balance
    monthlySpending: "10000",   // Target monthly spending in today's dollars
    currentAge: "24",           // User's current age
    startAge: "55",             // Age when withdrawals will begin
    endAge: "75",               // Age when the plan ends (exclusive)
    inflation: "4",             // Expected annual inflation rate (%)
    annualReturn: "0"           // Expected annual portfolio return (%)
  });
  
  // Array defining the input fields to render, including their keys, labels, and validation boundaries
  const fields = [
    { key: "balance", label: "Portfolio balance at withdrawal start ($)", min: 0, max: 1e15, step: "any" },
    { key: "monthlySpending", label: "Monthly spending in today’s dollars ($)", min: 0, max: 1e12, step: "any" },
    { key: "currentAge", label: "Your age today", min: 0, max: 119, step: "1" },
    { key: "startAge", label: "Start withdrawals at age", min: 0, max: 119, step: "1" },
    { key: "endAge", label: "Plan until age (exclusive)", min: 1, max: 120, step: "1" },
    { key: "inflation", label: "Yearly inflation (%)", min: 3, max: 6, step: "0.1" },
    { key: "annualReturn", label: "Annual portfolio return during withdrawals (%)", min: -50, max: 30, step: "0.1" },
  ] as const;

  // Memoized calculation of the withdrawal plan based on current input values.
  // Recalculates only when 'values' change.
  const plan = useMemo(() => {
    // Extensive validation: ensure no empty strings, validate finite numbers, and check boundaries
    if (
      Object.values(values).some(v => !v.trim() || !Number.isFinite(Number(v))) || 
      Number(values.inflation) < 3 || Number(values.inflation) > 6 || 
      Number(values.annualReturn) < -50 || Number(values.annualReturn) > 30 || 
      Number(values.balance) > 1e15 || 
      Number(values.monthlySpending) > 1e12
    ) {
      return null; // Return null if validation fails, preventing calculation errors
    }
    
    try { 
      // Execute the business logic function to generate the plan payload
      return calculateWithdrawalPlan({ 
        balance: Number(values.balance), 
        monthlySpending: Number(values.monthlySpending), 
        currentAge: Number(values.currentAge), 
        startAge: Number(values.startAge), 
        endAge: Number(values.endAge), 
        // Convert percentages to decimals for the calculation
        inflation: Number(values.inflation) / 100, 
        annualReturn: Number(values.annualReturn) / 100 
      }); 
    } catch { 
      // Catch any unexpected mathematical errors in the core logic
      return null; 
    }
  }, [values]);

  return (
    <section className="panel inflation-panel withdrawal-panel" aria-labelledby="withdrawal-title">
      {/* Header section describing the tool's purpose */}
      <div className="panel-heading">
        <div>
          <span>Your portfolio as income</span>
          <h2 id="withdrawal-title">Inflation-adjusted withdrawal planner</h2>
          <p>Enter the portfolio value you expect when withdrawals begin. See the income needed each year to maintain today’s lifestyle.</p>
        </div>
      </div>
      
      {/* Render the grid of input fields dynamically based on the 'fields' configuration */}
      <div className="inflation-inputs">
        {fields.map(field => (
          <label key={field.key} htmlFor={`withdrawal-${field.key}`}>
            {field.label}
            <Input 
              id={`withdrawal-${field.key}`} 
              type="number" 
              min={field.min} 
              max={field.max} 
              step={field.step} 
              value={values[field.key]} 
              onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      
      {/* Disclaimer regarding how calculations model inflation and withdrawals */}
      <p className="inflation-note">
        The balance is in future dollars at your starting age; it is not grown again before withdrawals. Spending is in today’s dollars and increases with inflation from your current age. Age 55 to 75 means 20 years of withdrawals, from age 55 through 74.
      </p>
      
      {/* Conditional rendering based on whether a valid plan was generated */}
      {!plan ? (
        // Validation error message if the plan is null
        <p className="inflation-note" role="alert">
          Enter nonnegative dollar amounts, whole ages with current age ≤ start age &lt; end age ≤ 120, inflation from 3% to 6%, and portfolio return from −50% to 30%. Maximum balance: $1 quadrillion; maximum monthly spending: $1 trillion.
        </p>
      ) : (
        // The plan was successfully generated; display the analytical insights, chart, and table
        <>
          {/* High-level summary articles comparing calculated metrics */}
          <div className="calculator-compare" aria-live="polite">
            
            {/* Article 1: Details on the first monthly withdrawal adjusted for inflation */}
            <article>
              <span>Monthly withdrawal at age {values.startAge}</span>
              <strong>{money(plan.firstMonthly)}</strong>
              <p>
                {money(Number(values.monthlySpending))} in today’s monthly spending becomes {money(plan.firstMonthly)} after {Number(values.startAge) - Number(values.currentAge)} years of inflation. 
                At age {Number(values.startAge) + 1}: <b>{money(plan.nextMonthly)}/month</b>, up {money(plan.nextMonthly - plan.firstMonthly)}.
              </p>
            </article>
            
            {/* Article 2: Evaluates whether the portfolio is depleted before the end age */}
            <article>
              <span>Will the portfolio last?</span>
              <strong className={plan.depletionMonth === null ? "positive" : "negative"}>
                {plan.depletionMonth === null 
                  ? `Funded through age ${Number(values.endAge) - 1}` 
                  : `Depleted at age ${Number(values.startAge) + Math.floor(plan.depletionMonth / 12)}, month ${plan.depletionMonth % 12 + 1}`}
              </strong>
              <p>
                Balance at age {values.endAge}: <b>{money(plan.endingBalance)}</b>. 
                {plan.totalShortfall > .01 ? ` ${money(plan.totalShortfall)} of planned spending cannot be paid from this portfolio.` : " All planned withdrawals are covered under these assumptions."} 
                Depletion is checked only within your selected period.
              </p>
            </article>
            
            {/* Article 3: Back-calculates the required starting balance to fully fund the plan */}
            <article>
              <span>Portfolio needed at age {values.startAge}</span>
              <strong>{money(plan.requiredBalance)}</strong>
              <p>
                The starting balance needed to fund all {Number(values.endAge) - Number(values.startAge)} years at your chosen return. 
                {plan.additionalNeeded > .01 ? ` You would need ${money(plan.additionalNeeded)} more by that age.` : " Your entered balance meets this target."}
              </p>
            </article>
            
            {/* Article 4: Total planned versus actual funded withdrawals */}
            <article>
              <span>Total planned withdrawals</span>
              <strong>{money(plan.totalPlanned)}</strong>
              <p>
                Actual funded withdrawals: {money(plan.totalWithdrawn)}. 
                Totals combine the future dollars withdrawn each year.
              </p>
            </article>
          </div>
          
          {/* Chart Section: Visualizing the portfolio balance trajectory over time */}
          <div className="retirement-visual">
            <div className="panel-heading">
              <div>
                <span>Your income runway</span>
                <h2>See how your balance changes</h2>
                <p>Remaining portfolio at each age · Under your current assumptions</p>
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  // Construct chart data by combining the starting point with the closing balances of each year
                  data={[
                    { age: Number(values.startAge), balance: Number(values.balance) }, 
                    ...plan.rows.map(row => ({ age: row.age + 1, balance: row.closingBalance }))
                  ]} 
                  margin={{ top: 15, right: 25, left: 10, bottom: 5 }}
                >
                  <defs>
                    {/* Define the gradient used for filling the area chart */}
                    <linearGradient id="withdrawalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={.24}/>
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={.01}/>
                    </linearGradient>
                  </defs>
                  {/* Subtle horizontal grid lines */}
                  <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="3 6"/>
                  {/* X-Axis displaying ages */}
                  <XAxis 
                    dataKey="age" 
                    tickFormatter={value => `Age ${value}`} 
                    axisLine={false} 
                    tickLine={false} 
                    minTickGap={30} 
                    tickMargin={12} 
                    tick={{ fill:"var(--muted-foreground)", fontSize: 12 }}
                  />
                  {/* Y-Axis displaying balances in compact currency format (e.g., "$10M") */}
                  <YAxis 
                    tickFormatter={value => new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD" }).format(Number(value))} 
                    axisLine={false} 
                    tickLine={false} 
                    tickMargin={10} 
                    tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  />
                  {/* Custom tooltip rendering on hover */}
                  <Tooltip content={<FinancialChartTooltip/>}/>
                  {/* Area geometry mapping the balance curve */}
                  <Area 
                    name="Remaining balance" 
                    dataKey="balance" 
                    type="monotone" 
                    stroke="var(--chart-2)" 
                    strokeWidth={3} 
                    fill="url(#withdrawalFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Tabular Data Section: A detailed year-by-year breakdown of the plan */}
          <div className="panel-heading">
            <div>
              <h3>Year-by-year breakdown</h3>
              <p>Monthly withdrawals increase once each year by {values.inflation}%. The table continues after depletion to show any unfunded spending.</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {/* Dynamically render table headers */}
                {["Age (year starting)", "Starting balance", "Monthly needed", "Yearly needed", "Actually withdrawn", "Portfolio growth", "Unfunded spending", "Ending balance"].map(label => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Map each row from the generated plan into table cells */}
              {plan.rows.map(row => (
                <TableRow key={row.age}>
                  <TableCell>{row.age}–{row.age + 1}</TableCell>
                  <TableCell>{money(row.openingBalance)}</TableCell>
                  <TableCell>{money(row.monthly)}</TableCell>
                  <TableCell>{money(row.annual)}</TableCell>
                  <TableCell>{money(row.withdrawn)}</TableCell>
                  {/* Color code growth based on whether it is positive or negative */}
                  <TableCell className={row.growth > 0 ? "positive" : row.growth < 0 ? "negative" : ""}>
                    {money(row.growth)}
                  </TableCell>
                  {/* Highlight shortfalls in red (negative class) */}
                  <TableCell className={row.shortfall > .01 ? "negative" : ""}>
                    {money(row.shortfall)}
                  </TableCell>
                  <TableCell>{money(row.closingBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {/* General assumptions and disclaimers for the user */}
          <p className="inflation-note">
            Assumptions: withdrawals at the start of each month; remaining funds grow monthly at the equivalent of your annual return. Return is nominal (before inflation), after any fees or taxes you include in your assumption. No new contributions or other income. Constant inflation and returns are a scenario, not a guarantee; actual market swings can change when money runs out. Values are rounded for display.
          </p>
        </>
      )}
    </section>
  );
}
