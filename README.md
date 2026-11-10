# Portfolio Lab

Portfolio Lab is a web application to help understand your stock holdings and experiment with.

Import your holdings from a CSV file, compare different buying patterns, look up

company cashflows and see how inflation will affect your money or a spending budget.

It is designed to give insight and estimates and does not perform any trading.

## Features

| Component/Tool | Functionality |

| --- | --- |

| My Portfolio | Reads holdings and gives an estimated value, showing a breakdown of your holdings, concentration, historical volatility measures, news and future scenarios. |

| Stock Research | Compare different buying patterns (daily, weekly, monthly) and a strategy that holds cash for dips.

| Financials | Search for U.S. companies and see the annual cashflow figures.

| Inflation Calculator | Estimate how much an amount or spending budget will change due to inflation.

| Withdrawal Planner | See how your starting balance could change with regular withdrawals.

The inflation and withdrawal tools are within the Portfolio section and there is an

optional option to link an investment account using Plaid.

## Technical Overview

There are 3 main components:

1. This is the frontend showing the different sections and reading the CSV file selected. It performs the investment and planning calculations.

2. The Next.js backend listens for requests from the frontend, retrieves external data and calculates the portfolio and company financials.

3. Data Providers - Give the prices, company filings or linked account holdings values.

The frontend code can be found inside ```mermaid

flowchart TD

subgraph Browser["In the browser"]

Screens["Screens and controls"]

CSV["CSV reader"]

Calculations["Investment and planning calculations"]

Screens --> CSV

Screens --> Calculations

end

CSV --> API["Next.js API routes and server helpers"]

Screens --> API

API --> Yahoo["Yahoo Finance"]

API --> SEC["SEC company filings"]

API --> Plaid["Plaid optional account connection"]

API --> Screens

```

. This includes the components for the sections and reusable elements. The calculations, parsing, common data structures and helpers for data providers are inside lib/. The API endpoints for the backend can be found inside app/API/.

This version of the application does not have a database or user accounts system. The CSV file is read in the browser but not stored on the device. The parsed holdings are passed to the portfolio API to analyse.

## Import Portfolio

The Portfolio section reads the CSV and the lib/portfolio-import.ts parses the rows. The buy and sell rows are grouped by ticker and passed to /API/portfolio.

The backend then gets the prices and market information for the holdings, calculates statistics and summary information. The Portfolio section will then display the charts, tables, volatility summary and scenarios.

The current importer supports common column names however it is quite lenient in it's validation. Some rows may be ignored if they aren't supported. Some odd number formats may also get misinterpreted. Always double check the holdings match the CSV file. Net cash invested does not equal cost basis.

## Compare Buying Patterns

On the Stock Research section you can select a ticker, date range, budget and buying pattern. The /API/market endpoint will get the daily prices from Yahoo Finance.

The different buying patterns are calculated in lib/DCA-core.mjs. The results will show how many shares, average cost, profit and final value there would be. The research helpers can also be used to download the results as CSV files.

DCA means dollar cost averaging. The investment budget is split into scheduled purchases. The comparison is based on the number of tradable days from the returned price history.

## Company Cashflows

The Financials section will search for a company and send the request to /API/financials. The backend will look for matching companies from the SEC. When a company is selected the facts will be retrieved.

From lib/financials.ts the annual periods are selected, kept with the corresponding filing and the cashflow rows are prepared for the charts and tables. Any missing data will remain empty.

Only free cashflow will be calculated if there is enough operating cashflow and capital expenditure data.

## Inflation and Withdrawal Planning

The inflation and withdrawal tools perform calculations in the browser. The inflation will be calculated based on the selected annual rate. The withdrawal planner will calculate, month by month, how much you would have left after making a withdrawal based on the assumed growth for the month. The results will show how much you would have, shortfalls and how much capital is needed to start with for the selected plan.

The assumptions will be fixed for the run. The planner does not simulate random good and bad years.

## Running Locally

You'll need to install Node.js (version 22.13+) and npm. The code has been written to use Node.js version 24.

Open your terminal and navigate to the extracted StockComparison folder. Enter:

```sh

npm ci

npm run dev

```

This will open http://localhost:3000.

npm ci will install the correct versions of dependencies from the lockfile. npm run dev will start the development server locally. As you edit your project the page will automatically update.

You can run the app without Plaid details. To get the historical prices and company filings you will need internet access and the data providers will need to be available.

## Commands

| Command | Description |

| --- | --- |

| npm run dev | Starts the development server. |

| npm run lint | Lints the source code. |

| npm run typecheck | Checks the TypeScript data and function types. |

| npm test | Runs all 5 test files. |

| npm run check | Runs the lint, typecheck and tests in sequence. |

| npm run build | Builds the production version of the app. |

| npm run start | Runs an already built production version. Run the build command first. |

There are currently 41 tests. These test the deterministic calculations, normalised financials, CSV aggregation and browser storage subscription. They do not confirm that the external data providers are available or that all interactions with the browser will work.

## File Guide

There are 56 files in the source code. All files are covered in the tables below. Folders such as node_modules/ and .next/ will be created once installed or built and are not contained in the source code.

## Project Setup and Instructions

| File | Description |

| --- | --- |

| README.md | This guide explaining what the app does, how the components work together, how to run and where the code can be found. |

| package.json | Lists dependencies, supported Node.js version and commands (dev/test/build). |

| package-lock.json | Locks the exact versions of dependencies and integrity information. |

| tsconfig.json | Sets the TypeScript rules and file scope. Imports starting with @/ will point to the root of the project. |

| next.config.ts | Configuration for Next.js. Adds headers to the responses including frame restrictions and browser permissions. |

| eslint.config.mjs | Sets up the lint rules. Excludes generated files. |

| postcss.config.mjs | Links the CSS build to Tailwind. |

| components.json | Sets up the style, aliases and folders for the UI component generator. Development tooling. |

| vercel.json | Tells Vercel what framework to use, what command to install and what command to build. |

| .gitignore | Ignores dependencies, generated files, caches, env files and local tooling. |

| .gitattributes | Ensures text files have consistent line endings when moved between operating systems. |

| AGENTS.md | Optional instructions for coding assistants. Tells them to read the installed Next.js documentation before editing. |

| CLAUDE.md | Short instructions for Claude Code. Includes @AGENTS.md to pull in the instructions from the AGENTS.md file. |

## App Entry Points and Styling

| File | Description |

| --- | --- |

| app/layout.tsx | Wraps all pages with the common HTML layout. Loads the stylesheets, sets title and fav icon. |

| app/page.tsx | The main page. Switches between the Portfolio, Stock Research and Financials sections. Manages the research inputs, outputs, charts, tables and exports. |

| app/globals.CSS | Contains the main styles for the app. Colors, light/dark mode, page layout, charts, tables and responsive styles. |

| app/design-system.CSS | Extra common styles and tokens. Includes chart colors and tooltip styles. Loaded after the main stylesheet. |

## API Endpoints

API Routes are URLs that will run server code. For example, app/API/market/route.ts will respond to requests to /API/market.

| File | Description |

| --- | --- |

| app/API/market/route.ts | Validates the requested ticker and date range before requesting from the market data provider. Returns the historical prices or an error. |

| app/API/portfolio/route.ts | Takes the holdings, gets the market data and calculates the values, breakdown, historical returns, volatility summary, news and future scenarios. |

| app/API/financials/route.ts | Handles company searches and gets the normalised SEC financials for the selected company. |

| app/API/plaid/create-link-token/route.ts | Creates the temporary token to open the Plaid account linking interface. |

| app/API/plaid/exchange-token/route.ts | Exchanges the public token from the completed Plaid link. Gets the investment holdings, merges duplicate tickers and returns the results. |

| app/API/plaid/holdings/route.ts | Gets the current investment holdings from the account using the stored Plaid access token. Merges the holdings. |

## Components

Components are reusable parts of the screen. The whole dashboard can be a component or just a button.

| File | Description |

| --- | --- |

| components/portfolio-dashboard.tsx | Portfolio section. Uploads CSV, optionally links to a brokerage, displays holdings summary, charts, volatility, news and planning. |

| components/company-financials.tsx | Company search and financials section. Displays charts, annual figures and links to the supporting filings. |

| components/inflation-calculator.tsx | Inflation form and results. Converts the selected inputs into estimates for future spending or purchasing power. |

| components/withdrawal-planner.tsx | Withdrawal form, chart, summary and annual table. Calls the withdrawal calculation module. |

| components/research-details.tsx | Common elements for the stock research section. Cards for statistics, formatted monthly table cells and chart tooltip. |

| components/financial-chart-tooltip.tsx | Formatted values for when hovering over the portfolio or financials charts. |

| components/UI/button.tsx | Common button styles, sizes and variations. |

| components/UI/input.tsx | Common text and numerical input styles. |

| components/UI/select.tsx | Reusable dropdowns. Common menu and selection styles. |

| components/UI/sheet.tsx | Slide out panel for extra information. |

| components/UI/table.tsx | Reusable table, header, row and cell components. |

## Calculations, Data Processing and Common Helpers

These files contain the calculations. They have been separated from the display to make it easier to validate the calculations without running the whole application.

| File | Description |

| --- | --- |

| lib/portfolio-import.ts | Parses the CSV text, identifies supported headers, merges buy and sell quantities and returns the holdings and import information. |

| lib/portfolio-types.ts | Sets the expected format for the holdings, responses, scenarios and import results. This is not calculations, just TypeScript descriptions. |

| lib/portfolio-analysis.ts | Calculate volatility, drawdown, historical returns and forecast scenarios. Gets ticker context and news for use in the portfolio route. |

| lib/portfolio-projections.ts | Calculates the future value based on a starting amount, monthly contributions, time period and assumed annual return. |

| lib/brokerage-token-store.ts | Reads if a stored token exists for the brokerage. Notifies React when there is a change to the browser storage state. Tokens are not encrypted or stored on the server. |

| lib/market-data.ts | Sets the common price format and provides the Yahoo Finance provider. Gets, cleans, de-duplicates and sorts the historical daily price data. |

| lib/SEC-data.ts | Searches the SEC company list. Gets the Company Facts data. Sets timeout and caching for requests. |

| lib/financials.ts | Takes the reported facts from SEC and formats them into consistent annual cashflow periods. Maintains the filing date and accession number. |

| lib/DCA-core.mjs | Performs the calculations for daily, weekly, monthly and dip strategies. Uses the available historical pricing data. |

| lib/DCA-core.d.mts | Provides the input and output arguments for DCA-core.mjs. Describes what the JavaScript module does. |

| lib/withdrawal-plan.mjs | Performs the monthly withdrawal simulation. Calculates how much capital is needed, how much you would have, total withdrawals, shortfalls and when the account would be emptied. |

| lib/withdrawal-plan.d.mts | Provides the input and output arguments for the withdrawal module. |

| lib/research-utils.ts | Common date and number formatting, research table types and CSV download helper in the browser. |

| lib/utils.ts | Merges CSS classes and resolves conflicting Tailwind classes in the common UI components. |

## Testing

| File | Description |

| --- | --- |

| tests/DCA.test.mjs | Tests monthly budgets, number of shares, daily/weekly buying, dip thresholds, selected buying days, holidays and partial date ranges. |

| tests/financials.test.mjs | Tests annual period selection, consistent restatements, missing data, true zeros and unusual fiscal year lengths. |

| tests/portfolio-core.test.mjs | Tests the real portfolio modules. CSV aggregation, contribution projections, historical statistics, forecasts and stored token subscriptions. |

| tests/portfolio.test.mjs | 2 stand alone formula tests. Long term growth limit and percentage return. Does not test the portfolio API. |

| tests/withdrawal.test.mjs | Tests inflation timing, withdrawals, emptied balances, capital required and invalid input assumptions. |

## Static Files and Third Party

| File | Description |

| --- | --- |

| public/favicon.svg | Small icon in the browser tab. |

| vendor/shadcn-tailwind-4.13.0.CSS | Bundled stylesheet. Imported into the main stylesheet. |

| vendor/shadcn-tailwind-4.13.0.LICENSE.md | License notice for the bundled third party stylesheet. Should be kept with the file. |

## AGENTS.md and CLAUDE.md

These are not required to install, build or run Portfolio Lab. They are development instructions for coding assistants.

Within this repository the AGENTS.md file reminds the user to read the documentation that comes with the installed version of Next.js. The CLAUDE.md file just includes @AGENTS.md to tell Claude Code to read the file. This is not a cloud hosting setup.

There is no cloud.md file in the source code.

It is useful to leave them in as coding assistants will be working on the project. Removing them does not remove any functionality from the app. The version of Next.js installed can generate these instruction files during development if it detects a coding agent and the managed rules are not present.

## Optional Provider Configuration

| Environment Variable | Used For |

| --- | --- |

| PLAID_CLIENT_ID | Id of the Plaid application set up. |

| PLAID_SECRET | Used to authenticate requests to Plaid. Should not be stored in source. |

| PLAID_ENV | Sets the Plaid environment. Default in routes is sandbox. |

| SEC_USER_AGENT | Overrides the header used to identify the request to the SEC. Default is set in the code. |

These can be set using your local environment or on the hosting platform. Do not include real values in a shared source.

The Plaid flow currently stores the access token in the browser and sends it back to the server when the holdings need refreshing. This would need a different storage and authentication method to be used as a public brokerage app. The invested amounts and dates from Plaid are estimates based on the holdings data and are not a full transaction history.

## Getting Started

Open app/page.tsx. This shows how the 3 sections are selected. Choose a workflow:

- Portfolio: components/portfolio-dashboard.tsx, lib/portfolio-import.ts, app/API/portfolio/route.ts, lib/portfolio-analysis.ts.

- Stock Research: app/page.tsx, app/API/market/route.ts, lib/market-data.ts, lib/DCA-core.mjs.

- Company Financials: components/company-financials.tsx, app/API/financials/route.ts, lib/SEC-data.ts, lib/financials.ts.

- Withdrawal Planner: components/withdrawal-planner.tsx, lib/withdrawal-plan.mjs.

A great next step is to look at the test file. This shows what inputs are provided and what outputs are expected.

## Some Key Terms

| Term | Description |

| --- | --- |

| Ticker | Trading symbol for a stock or fund. |

| Holding/Position | Security and number of shares. |

| Frontend | The section of the app shown in the browser. |

| Backend | The server side of the app. Handles requests and retrieves external data. |

| API | A defined way of passing data between the browser, server or external service. |

| Type | A description used by TypeScript to validate the data shape. |

| Dependency | A package used within the project. E.g. React or Recharts. |

| Build | A version of the application ready to be used by the production server. |

## Limitations

The historical results are based on the returned price history and do not guarantee future returns. The scenarios in the portfolio are based on assumptions. The volatility shown in the portfolio is an estimate based on weighting the volatility of the holdings and not a covariance calculation. The inflation and withdrawal runs are based on fixed annual rates and do not include tax or fees.

