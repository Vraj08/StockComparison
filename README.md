# DCA Research Lab

A Next.js portfolio and dollar-cost-averaging research dashboard. It reads portfolio CSV files in the browser, requests market history from server-side API routes, and displays portfolio-specific allocation, risk, historical scenarios, forward estimates, and current holding news.

## Local development

Requirements: Node.js 22.13 or newer and npm.

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

```powershell
npm test
npm run build
```

## Main structure

- `app/` — pages, styles, metadata, and API routes
- `components/portfolio-dashboard.tsx` — portfolio CSV analysis interface
- `components/ui/` — shared interface components
- `lib/market-data.ts` — Yahoo Finance market-data adapter
- `lib/dca-core.mjs` — DCA calculation engine
- `tests/` — calculation tests
- `public/` — public assets

## Data and security

- Uploaded CSV contents are parsed in the browser and are not persisted by this application.
- Only summarized ticker, quantity, cost, and first-investment-date fields are sent to the same-origin portfolio API for calculation.
- Market history and news are fetched server-side from Yahoo Finance. Review its terms and rate limits before operating a high-traffic public service.
- Forecasts are estimates for research and education, not guarantees or personalized financial advice.
- No API keys or environment variables are required by the current implementation.

See [VERCEL.md](./VERCEL.md) for deployment instructions.
