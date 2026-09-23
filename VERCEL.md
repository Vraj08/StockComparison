# Complete Step-by-Step Guide: Hosting DCA Research Lab on Vercel

This Next.js application is fully optimized for **Vercel** with Turbopack, zero environment variable requirements for core features, and hardened HTTP headers.

---

## Method 1: Deploy with Git & Vercel Dashboard (Recommended)

This method connects your repository to Vercel so every git commit/push automatically deploys.

### Step 1: Initialize Git & Commit Your Code
Open your terminal (PowerShell or Bash) in this project directory:

```powershell
git add .
git commit -m "feat: dynamic cumulative returns, cleanup, and vercel deployment setup"
```

### Step 2: Push to GitHub / GitLab / Bitbucket
1. Go to [github.com/new](https://github.com/new) and create a new repository (e.g. `dca-research-lab`). Keep it **Public** or **Private** as you prefer.
2. Link your local project to GitHub and push:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/dca-research-lab.git
git branch -M main
git push -u origin main
```

### Step 3: Import Project into Vercel
1. Go to [vercel.com](https://vercel.com) and log in (or sign up with your GitHub account).
2. In your Vercel Dashboard, click the **Add New...** button and select **Project**.
3. Under **Import Git Repository**, find your `dca-research-lab` repo and click **Import**.
4. Configure the project settings:
   - **Framework Preset**: `Next.js` (automatically detected)
   - **Root Directory**: `./` (leave default)
   - **Build and Output Settings**:
     - Build Command: `npm run build`
     - Output Directory: Next.js manages it (leave blank)
     - Install Command: `npm ci`
   - **Environment Variables**: None required.
5. Click **Deploy**.

Within 1–2 minutes, Vercel will build and assign you a live HTTPS URL (e.g., `https://dca-research-lab.vercel.app`).

---

## Method 2: Deploy Directly via Vercel CLI (No Git Required)

If you want to deploy directly from your local terminal right now:

### Step 1: Install Vercel CLI
```powershell
npm install -g vercel
```

### Step 2: Login to Vercel
```powershell
vercel login
```
Follow the browser prompt to authenticate.

### Step 3: Run the Deploy Command
From the project folder:
```powershell
vercel
```
The CLI will ask a few setup questions:
- *Set up and deploy?* **Y**
- *Which scope do you want to deploy to?* (Select your personal account)
- *Link to existing project?* **N**
- *What's your project's name?* `dca-research-lab`
- *In which directory is your code located?* `./`
- *Want to modify settings?* **N**

This generates a **Preview Deployment** link.

### Step 4: Publish to Production
Once you test the preview URL and confirm everything looks good:
```powershell
vercel --prod
```
Your app is now live in production!

---

## How the Architecture Works on Vercel

- **Static Pages**: The home interface (`/`) is pre-rendered at the edge for blazing-fast load times.
- **Serverless API Functions**:
  - `/api/market`: Serverless function that fetches historical stock/ETF prices securely from Yahoo Finance with automated caching (`Cache-Control: public, max-age=900, s-maxage=21600`).
  - `/api/portfolio`: Serverless function that parses portfolio positions, calculates historical volatility, drawdown, and computes holding-by-holding multi-horizon forecasts up to 50 years.
- **Security Headers**: HSTS, anti-clickjacking (`X-Frame-Options: DENY`), MIME sniffing protection (`nosniff`), and strict referrer policies are configured in `next.config.ts`.
- **Zero Database Dependency**: All CSV files are processed in-memory in the browser and passed to stateless API routes; no external database is needed.

---

## Verifying Your Live Deployment

Once deployed:
1. Open your live Vercel URL.
2. Under **DCA Research Lab**, type `NVDA` or `SPY` and click **Analyze Monthly DCA**.
3. Under **Portfolio Dashboard**, drag and drop your brokerage CSV or test holding file.
4. Move the **Years** slider to 10, 20, 30, or 50 years and observe:
   - The **Annual Rate (%/year)**.
   - The **Total Cumulative Return (% in total, added up)**.
   - The **Historical Track Record Pace** comparison.
