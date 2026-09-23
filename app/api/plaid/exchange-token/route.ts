import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    return NextResponse.json({ error: "Plaid credentials not configured in .env.local" }, { status: 500 });
  }

  try {
    const configuration = new Configuration({
      basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    
    const client = new PlaidApi(configuration);
    
    const { public_token } = await request.json();
    if (!public_token) {
      return NextResponse.json({ error: "Missing public_token" }, { status: 400 });
    }

    // Exchange the public token for an access token
    const tokenResponse = await client.itemPublicTokenExchange({ public_token });
    const access_token = tokenResponse.data.access_token;
    
    // Fetch investments/holdings
    const holdingsResponse = await client.investmentsHoldingsGet({ access_token });
    const { holdings, securities } = holdingsResponse.data;
    
    // Map securities so we can look up tickers
    const securityMap = new Map();
    for (const sec of securities) {
      securityMap.set(sec.security_id, sec);
    }
    
    // Format into our ParsedPosition format
    const positions = [];
    for (const holding of holdings) {
      const security = securityMap.get(holding.security_id);
      if (security && security.ticker_symbol && holding.quantity > 0) {
        positions.push({
          ticker: security.ticker_symbol.toUpperCase(),
          quantity: holding.quantity,
          netInvested: holding.institution_price * holding.quantity, // Cost basis approximation
          firstInvestmentDate: holding.institution_price_as_of ? new Date(holding.institution_price_as_of).toISOString().slice(0, 10) : null,
        });
      }
    }
    
    if (positions.length === 0) {
      return NextResponse.json({ error: "No active stock/ETF holdings found in this account." }, { status: 422 });
    }
    
    // Consolidate duplicates (if same ticker is in multiple accounts/lots)
    const map = new Map();
    for (const pos of positions) {
      const current = map.get(pos.ticker) || { ticker: pos.ticker, quantity: 0, netInvested: 0, firstInvestmentDate: null };
      current.quantity += pos.quantity;
      current.netInvested += pos.netInvested;
      if (pos.firstInvestmentDate && (!current.firstInvestmentDate || pos.firstInvestmentDate < current.firstInvestmentDate)) {
        current.firstInvestmentDate = pos.firstInvestmentDate;
      }
      map.set(pos.ticker, current);
    }
    
    const consolidatedPositions = [...map.values()].sort((a, b) => b.netInvested - a.netInvested);
    
    return NextResponse.json({ positions: consolidatedPositions, access_token });
  } catch (error) {
    console.error("Plaid token exchange or holdings error:", error);
    return NextResponse.json({ error: "Failed to securely connect and fetch holdings from the brokerage." }, { status: 500 });
  }
}
