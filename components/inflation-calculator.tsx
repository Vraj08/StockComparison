"use client"; // Indicates this module is executed on the client-side in a Next.js environment

// Import necessary hooks from React
import { useState } from "react";
// Import customized Input component from UI library
import { Input } from "@/components/ui/input";

/**
 * Formats a given number into a standard US currency string.
 * @param value The numerical amount to format.
 * @returns A formatted string (e.g., "$10,000.00").
 */
const money = (value: number) => 
  new Intl.NumberFormat("en-US", { 
    style: "currency", 
    currency: "USD", 
    maximumFractionDigits: 2 
  }).format(value);

/**
 * InflationCalculator component
 * A user interface to calculate the future value of today's spending amount 
 * adjusted for annual inflation over a specific time horizon.
 */
export function InflationCalculator() {
  // State for the initial spending amount in today's dollars
  const [amount, setAmount] = useState("10000");
  
  // State for the spending frequency (e.g., "month" or "year")
  const [period, setPeriod] = useState("month");
  
  // State for the assumed annual inflation rate (as a percentage, e.g., "3.2")
  const [rate, setRate] = useState("3.2");
  
  // State for the calculation mode: either "age" (using current and target age) or "years" (direct duration)
  const [mode, setMode] = useState("age");
  
  // State for the user's current age (used if mode is "age")
  const [age, setAge] = useState("24");
  
  // State for the user's target age (used if mode is "age")
  const [targetAge, setTargetAge] = useState("55");
  
  // State for the explicit number of years (used if mode is "years")
  const [years, setYears] = useState("31");
  
  // Calculate the time horizon in years based on the selected mode
  const horizon = mode === "age" 
    ? Number(targetAge) - Number(age) // Difference between target and current age
    : Number(years); // Explicit years provided by the user

  // Validation logic to ensure all inputs are structurally sound and logically correct
  const valid = 
    amount.trim() !== "" && // Amount cannot be empty
    Number.isFinite(Number(amount)) && // Amount must be a finite number
    Number(amount) >= 0 && // Amount must be non-negative
    rate.trim() !== "" && // Rate cannot be empty
    Number(rate) >= 3 && // Minimum allowed inflation rate is 3%
    Number(rate) <= 6 && // Maximum allowed inflation rate is 6%
    Number.isInteger(horizon) && // Horizon must be a whole number of years
    horizon >= 0 && // Horizon cannot be negative
    horizon <= 100 && // Horizon capped at 100 years
    (mode === "age" 
      ? age !== "" && targetAge !== "" && // Ages cannot be empty if mode is "age"
        Number.isInteger(Number(age)) && // Current age must be an integer
        Number.isInteger(Number(targetAge)) && // Target age must be an integer
        Number(age) >= 0 && // Current age must be non-negative
        Number(targetAge) <= 120 // Target age cannot exceed 120
      : years !== ""); // Years cannot be empty if mode is "years"

  // Compound interest factor formula: (1 + r)^t
  // rate is divided by 100 to convert percentage to decimal
  const factor = (1 + Number(rate) / 100) ** horizon;
  
  // The future value is the initial amount multiplied by the compound factor
  const future = Number(amount) * factor;

  // Render the calculator UI
  return (
    <section className="panel inflation-panel" aria-labelledby="inflation-title">
      {/* Header section explaining the calculator's purpose */}
      <div className="panel-heading">
        <div>
          <span>Plan for rising prices</span>
          <h2 id="inflation-title">Inflation calculator</h2>
          <p>What will today’s spending amount look like in the future? No portfolio upload needed.</p>
        </div>
      </div>
      
      {/* Input controls container */}
      <div className="inflation-inputs">
        {/* Input for the current spending amount */}
        <label>
          Today’s amount ($)
          <Input type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)}/>
        </label>
        
        {/* Dropdown for selecting spending frequency */}
        <label>
          Spending frequency
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="month">Per month</option>
            <option value="year">Per year</option>
          </select>
        </label>
        
        {/* Input and slider for the annual inflation rate */}
        <label>
          Annual inflation (%)
          <Input type="number" min="3" max="6" step="0.1" value={rate} onChange={e => setRate(e.target.value)}/>
          <input aria-label="Annual inflation slider" type="range" min="3" max="6" step="0.1" value={Number(rate) || 3} onChange={e => setRate(e.target.value)}/>
        </label>
        
        {/* Dropdown for selecting the timeframe calculation mode */}
        <label>
          Choose timeframe
          <select value={mode} onChange={e => setMode(e.target.value)}>
            <option value="age">By age</option>
            <option value="years">Number of years</option>
          </select>
        </label>
        
        {/* Conditional inputs based on the selected mode */}
        {mode === "age" ? (
          <>
            {/* Current age input */}
            <label>
              Current age
              <Input type="number" min="0" max="120" step="1" value={age} onChange={e => setAge(e.target.value)}/>
            </label>
            {/* Target age input */}
            <label>
              Target age
              <Input type="number" min={age || 0} max="120" step="1" value={targetAge} onChange={e => setTargetAge(e.target.value)}/>
            </label>
          </>
        ) : (
          /* Explicit years input */
          <label>
            Years from now
            <Input type="number" min="0" max="100" step="1" value={years} onChange={e => setYears(e.target.value)}/>
          </label>
        )}
      </div>
      
      {/* Results section - only displayed if inputs are valid */}
      {valid ? (
        <>
          <div className="calculator-compare" aria-live="polite">
            {/* Display the projected future amount required */}
            <article>
              <span>Amount needed {mode === "age" ? `at age ${targetAge}` : `in ${horizon} years`}</span>
              <strong>{money(future)} / {period}</strong>
              <p>To buy what {money(Number(amount))} per {period} buys today, after {horizon} years of {rate}% annual inflation.</p>
            </article>
            {/* Display the eroded purchasing power if the amount is not adjusted */}
            <article>
              <span>If your amount stays unchanged</span>
              <strong>{money(Number(amount) / factor)} / {period}</strong>
              <p>Your unchanged {money(Number(amount))} per {period} would have this purchasing power in today’s dollars.</p>
            </article>
          </div>
          {/* Detailed note explaining the math and assumptions */}
          <p className="inflation-note">
            Prices increase by {((factor - 1) * 100).toFixed(1)}% over this period. Formula: today’s amount × (1 + inflation rate)<sup>years</sup>. Assumes constant annual inflation; this models spending needs, not investment growth or accumulated deposits.
          </p>
        </>
      ) : (
        /* Error message displayed if inputs fail validation */
        <p className="inflation-note" role="alert">
          Enter a nonnegative amount, inflation from 3% to 6%, and a whole-year timeframe from 0 to 100 years. Target age must be at least your current age and no more than 120.
        </p>
      )}
    </section>
  );
}
