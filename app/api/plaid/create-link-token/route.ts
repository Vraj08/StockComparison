import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';
import { NextResponse } from 'next/server';

export async function POST() {
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
    
    const request = {
      user: { client_user_id: 'dca-research-user' },
      client_name: 'DCA Research Lab',
      products: [Products.Investments],
      country_codes: [CountryCode.Us],
      language: 'en',
    };
    
    const response = await client.linkTokenCreate(request);
    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Plaid link token error:", error);
    return NextResponse.json({ error: "Failed to create link token" }, { status: 500 });
  }
}
