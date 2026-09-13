export type Sector =
  | 'Technology'
  | 'Consumer'
  | 'Financials'
  | 'Communication'
  | 'Consumer Staples'
  | 'Energy'
  | 'Industrials'
  | 'Healthcare';

export type Ticker = {
  symbol: string;
  name: string;
  sector: Sector;
  basePrice: number;
  // Daily volatility as a fraction of price (std dev of daily returns).
  volatility: number;
  // Annual dividend yield as a fraction of price (e.g. 0.03 = 3%/yr), paid
  // out quarterly by usePortfolioStore's processDividends. Omitted for
  // growth names that don't pay one in this simulation.
  dividendYield?: number;
};

// A fixed universe of real, well-known symbols with fictional simulated prices —
// this is the "mock stocks" engine: no live market data, no external API key.
export const TICKERS: Ticker[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', basePrice: 227.5, volatility: 0.016, dividendYield: 0.005 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology', basePrice: 425.2, volatility: 0.015, dividendYield: 0.007 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', basePrice: 175.8, volatility: 0.018 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer', basePrice: 185.4, volatility: 0.02 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology', basePrice: 135.9, volatility: 0.032 },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer', basePrice: 245.6, volatility: 0.04 },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', basePrice: 590.3, volatility: 0.024 },
  // Post 10-for-1 split (Nov 2025) — was 780.1 pre-split, badly wrong as a
  // mock-fallback seed once Netflix's real per-share price dropped ~90%.
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication', basePrice: 81.5, volatility: 0.026 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials', basePrice: 245.7, volatility: 0.014, dividendYield: 0.021 },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials', basePrice: 310.2, volatility: 0.013, dividendYield: 0.007 },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples', basePrice: 95.4, volatility: 0.011, dividendYield: 0.01 },
  { symbol: 'DIS', name: 'The Walt Disney Co.', sector: 'Communication', basePrice: 112.3, volatility: 0.019, dividendYield: 0.004 },
  { symbol: 'KO', name: 'The Coca-Cola Co.', sector: 'Consumer Staples', basePrice: 63.2, volatility: 0.009, dividendYield: 0.029 },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Staples', basePrice: 168.5, volatility: 0.01, dividendYield: 0.023 },
  { symbol: 'XOM', name: 'Exxon Mobil Corp.', sector: 'Energy', basePrice: 118.6, volatility: 0.017, dividendYield: 0.033 },
  { symbol: 'BA', name: 'The Boeing Co.', sector: 'Industrials', basePrice: 178.4, volatility: 0.028 },
  { symbol: 'NKE', name: 'Nike Inc.', sector: 'Consumer', basePrice: 78.3, volatility: 0.021, dividendYield: 0.017 },
  { symbol: 'SBUX', name: 'Starbucks Corp.', sector: 'Consumer', basePrice: 95.7, volatility: 0.018, dividendYield: 0.025 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', basePrice: 165.2, volatility: 0.034 },
  { symbol: 'INTC', name: 'Intel Corp.', sector: 'Technology', basePrice: 24.6, volatility: 0.03 },
  { symbol: 'PYPL', name: 'PayPal Holdings Inc.', sector: 'Technology', basePrice: 78.9, volatility: 0.025 },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', basePrice: 520.4, volatility: 0.02 },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', basePrice: 330.1, volatility: 0.022 },
  { symbol: 'UBER', name: 'Uber Technologies Inc.', sector: 'Industrials', basePrice: 72.4, volatility: 0.026 },
  { symbol: 'ORCL', name: 'Oracle Corp.', sector: 'Technology', basePrice: 195.3, volatility: 0.023, dividendYield: 0.009 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', basePrice: 158.2, volatility: 0.011, dividendYield: 0.03 },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', basePrice: 27.8, volatility: 0.017, dividendYield: 0.065 },
  { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Financials', basePrice: 525.0, volatility: 0.014, dividendYield: 0.006 },
  { symbol: 'BAC', name: 'Bank of America Corp.', sector: 'Financials', basePrice: 48.0, volatility: 0.019, dividendYield: 0.024 },
  { symbol: 'GS', name: 'The Goldman Sachs Group Inc.', sector: 'Financials', basePrice: 610.0, volatility: 0.018, dividendYield: 0.017 },
  { symbol: 'T', name: 'AT&T Inc.', sector: 'Communication', basePrice: 24.0, volatility: 0.014, dividendYield: 0.049 },
  { symbol: 'CMCSA', name: 'Comcast Corp.', sector: 'Communication', basePrice: 35.0, volatility: 0.016, dividendYield: 0.032 },
  { symbol: 'COST', name: 'Costco Wholesale Corp.', sector: 'Consumer Staples', basePrice: 980.0, volatility: 0.014, dividendYield: 0.005 },
  { symbol: 'MCD', name: "McDonald's Corp.", sector: 'Consumer Staples', basePrice: 295.0, volatility: 0.012, dividendYield: 0.023 },
  { symbol: 'CVX', name: 'Chevron Corp.', sector: 'Energy', basePrice: 160.0, volatility: 0.016, dividendYield: 0.038 },
  { symbol: 'CAT', name: 'Caterpillar Inc.', sector: 'Industrials', basePrice: 400.0, volatility: 0.021, dividendYield: 0.014 },
  { symbol: 'HON', name: 'Honeywell International Inc.', sector: 'Industrials', basePrice: 210.0, volatility: 0.015, dividendYield: 0.019 },
  { symbol: 'UNH', name: 'UnitedHealth Group Inc.', sector: 'Healthcare', basePrice: 330.0, volatility: 0.021, dividendYield: 0.028 },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare', basePrice: 190.0, volatility: 0.015, dividendYield: 0.034 },
  { symbol: 'MRK', name: 'Merck & Co. Inc.', sector: 'Healthcare', basePrice: 85.0, volatility: 0.017, dividendYield: 0.038 },
  // Second expansion pass, 40 -> 100 — same curated-real-symbol/fictional-
  // simulated-price approach as above, filling out every existing sector.
  { symbol: 'IBM', name: 'International Business Machines Corp.', sector: 'Technology', basePrice: 230.4, volatility: 0.013, dividendYield: 0.03 },
  { symbol: 'CSCO', name: 'Cisco Systems Inc.', sector: 'Technology', basePrice: 62.1, volatility: 0.014, dividendYield: 0.026 },
  { symbol: 'TXN', name: 'Texas Instruments Inc.', sector: 'Technology', basePrice: 195.7, volatility: 0.017, dividendYield: 0.028 },
  { symbol: 'QCOM', name: 'Qualcomm Inc.', sector: 'Technology', basePrice: 165.3, volatility: 0.021, dividendYield: 0.018 },
  { symbol: 'NOW', name: 'ServiceNow Inc.', sector: 'Technology', basePrice: 1005.2, volatility: 0.024 },
  { symbol: 'SHOP', name: 'Shopify Inc.', sector: 'Technology', basePrice: 105.6, volatility: 0.032 },
  { symbol: 'SNOW', name: 'Snowflake Inc.', sector: 'Technology', basePrice: 165.9, volatility: 0.035 },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.', sector: 'Technology', basePrice: 75.4, volatility: 0.045 },
  { symbol: 'AVGO', name: 'Broadcom Inc.', sector: 'Technology', basePrice: 250.8, volatility: 0.022, dividendYield: 0.01 },
  { symbol: 'MU', name: 'Micron Technology Inc.', sector: 'Technology', basePrice: 105.1, volatility: 0.033 },
  { symbol: 'SPOT', name: 'Spotify Technology S.A.', sector: 'Technology', basePrice: 480.3, volatility: 0.03 },
  { symbol: 'SQ', name: 'Block Inc.', sector: 'Technology', basePrice: 80.7, volatility: 0.034 },
  { symbol: 'HD', name: 'The Home Depot Inc.', sector: 'Consumer', basePrice: 400.5, volatility: 0.014, dividendYield: 0.023 },
  { symbol: 'LOW', name: "Lowe's Companies Inc.", sector: 'Consumer', basePrice: 260.4, volatility: 0.015, dividendYield: 0.018 },
  { symbol: 'TGT', name: 'Target Corp.', sector: 'Consumer', basePrice: 145.6, volatility: 0.02, dividendYield: 0.028 },
  { symbol: 'BKNG', name: 'Booking Holdings Inc.', sector: 'Consumer', basePrice: 4800.5, volatility: 0.019 },
  { symbol: 'ABNB', name: 'Airbnb Inc.', sector: 'Consumer', basePrice: 130.2, volatility: 0.028 },
  { symbol: 'MAR', name: 'Marriott International Inc.', sector: 'Consumer', basePrice: 260.9, volatility: 0.017, dividendYield: 0.008 },
  { symbol: 'LULU', name: 'Lululemon Athletica Inc.', sector: 'Consumer', basePrice: 280.3, volatility: 0.028 },
  { symbol: 'F', name: 'Ford Motor Co.', sector: 'Consumer', basePrice: 11.2, volatility: 0.024, dividendYield: 0.045 },
  { symbol: 'GM', name: 'General Motors Co.', sector: 'Consumer', basePrice: 55.4, volatility: 0.022, dividendYield: 0.011 },
  { symbol: 'WFC', name: 'Wells Fargo & Co.', sector: 'Financials', basePrice: 75.3, volatility: 0.017, dividendYield: 0.021 },
  { symbol: 'AXP', name: 'American Express Co.', sector: 'Financials', basePrice: 300.6, volatility: 0.016, dividendYield: 0.011 },
  { symbol: 'MS', name: 'Morgan Stanley', sector: 'Financials', basePrice: 135.4, volatility: 0.018, dividendYield: 0.028 },
  { symbol: 'C', name: 'Citigroup Inc.', sector: 'Financials', basePrice: 75.8, volatility: 0.019, dividendYield: 0.03 },
  { symbol: 'SCHW', name: 'The Charles Schwab Corp.', sector: 'Financials', basePrice: 80.2, volatility: 0.02, dividendYield: 0.012 },
  { symbol: 'BLK', name: 'BlackRock Inc.', sector: 'Financials', basePrice: 1050.4, volatility: 0.017, dividendYield: 0.019 },
  { symbol: 'VZ', name: 'Verizon Communications Inc.', sector: 'Communication', basePrice: 43.2, volatility: 0.012, dividendYield: 0.062 },
  { symbol: 'TMUS', name: 'T-Mobile US Inc.', sector: 'Communication', basePrice: 240.5, volatility: 0.015, dividendYield: 0.015 },
  { symbol: 'CHTR', name: 'Charter Communications Inc.', sector: 'Communication', basePrice: 320.7, volatility: 0.026 },
  { symbol: 'WBD', name: 'Warner Bros. Discovery Inc.', sector: 'Communication', basePrice: 12.3, volatility: 0.032 },
  { symbol: 'EA', name: 'Electronic Arts Inc.', sector: 'Communication', basePrice: 145.9, volatility: 0.019, dividendYield: 0.005 },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Staples', basePrice: 150.4, volatility: 0.011, dividendYield: 0.036 },
  { symbol: 'CL', name: 'Colgate-Palmolive Co.', sector: 'Consumer Staples', basePrice: 92.3, volatility: 0.011, dividendYield: 0.021 },
  { symbol: 'MO', name: 'Altria Group Inc.', sector: 'Consumer Staples', basePrice: 58.6, volatility: 0.014, dividendYield: 0.079 },
  { symbol: 'KMB', name: 'Kimberly-Clark Corp.', sector: 'Consumer Staples', basePrice: 135.2, volatility: 0.011, dividendYield: 0.037 },
  { symbol: 'MDLZ', name: 'Mondelez International Inc.', sector: 'Consumer Staples', basePrice: 65.4, volatility: 0.013, dividendYield: 0.025 },
  { symbol: 'KHC', name: 'Kraft Heinz Co.', sector: 'Consumer Staples', basePrice: 30.5, volatility: 0.015, dividendYield: 0.05 },
  { symbol: 'COP', name: 'ConocoPhillips', sector: 'Energy', basePrice: 95.6, volatility: 0.021, dividendYield: 0.032 },
  { symbol: 'SLB', name: 'SLB', sector: 'Energy', basePrice: 40.3, volatility: 0.024, dividendYield: 0.029 },
  { symbol: 'OXY', name: 'Occidental Petroleum Corp.', sector: 'Energy', basePrice: 48.7, volatility: 0.026, dividendYield: 0.017 },
  { symbol: 'PSX', name: 'Phillips 66', sector: 'Energy', basePrice: 130.5, volatility: 0.02, dividendYield: 0.035 },
  { symbol: 'EOG', name: 'EOG Resources Inc.', sector: 'Energy', basePrice: 120.4, volatility: 0.021, dividendYield: 0.03 },
  { symbol: 'GE', name: 'GE Aerospace', sector: 'Industrials', basePrice: 190.3, volatility: 0.019, dividendYield: 0.004 },
  { symbol: 'LMT', name: 'Lockheed Martin Corp.', sector: 'Industrials', basePrice: 480.6, volatility: 0.014, dividendYield: 0.026 },
  { symbol: 'RTX', name: 'RTX Corp.', sector: 'Industrials', basePrice: 120.8, volatility: 0.015, dividendYield: 0.021 },
  { symbol: 'UPS', name: 'United Parcel Service Inc.', sector: 'Industrials', basePrice: 130.4, volatility: 0.016, dividendYield: 0.05 },
  { symbol: 'DE', name: 'Deere & Co.', sector: 'Industrials', basePrice: 430.7, volatility: 0.019, dividendYield: 0.014 },
  { symbol: 'MMM', name: '3M Co.', sector: 'Industrials', basePrice: 135.5, volatility: 0.016, dividendYield: 0.021 },
  { symbol: 'FDX', name: 'FedEx Corp.', sector: 'Industrials', basePrice: 280.9, volatility: 0.019, dividendYield: 0.02 },
  { symbol: 'LLY', name: 'Eli Lilly and Co.', sector: 'Healthcare', basePrice: 800.4, volatility: 0.018, dividendYield: 0.006 },
  { symbol: 'ABT', name: 'Abbott Laboratories', sector: 'Healthcare', basePrice: 115.3, volatility: 0.012, dividendYield: 0.019 },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', sector: 'Healthcare', basePrice: 550.6, volatility: 0.016, dividendYield: 0.003 },
  { symbol: 'MRNA', name: 'Moderna Inc.', sector: 'Healthcare', basePrice: 35.4, volatility: 0.045 },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb Co.', sector: 'Healthcare', basePrice: 55.7, volatility: 0.017, dividendYield: 0.047 },
  { symbol: 'AMGN', name: 'Amgen Inc.', sector: 'Healthcare', basePrice: 290.5, volatility: 0.016, dividendYield: 0.03 },
  { symbol: 'GILD', name: 'Gilead Sciences Inc.', sector: 'Healthcare', basePrice: 105.8, volatility: 0.016, dividendYield: 0.032 },
  { symbol: 'CVS', name: 'CVS Health Corp.', sector: 'Healthcare', basePrice: 68.4, volatility: 0.021, dividendYield: 0.037 },
  { symbol: 'ISRG', name: 'Intuitive Surgical Inc.', sector: 'Healthcare', basePrice: 550.9, volatility: 0.021 },
  { symbol: 'VRTX', name: 'Vertex Pharmaceuticals Inc.', sector: 'Healthcare', basePrice: 470.3, volatility: 0.017 },
];

const TICKER_MAP = new Map(TICKERS.map((t) => [t.symbol, t]));

export function tickerOf(symbol: string): Ticker | undefined {
  return TICKER_MAP.get(symbol);
}

export const SECTOR_COLORS: Record<Sector, string> = {
  Technology: '#3b82f6',
  Consumer: '#ec4899',
  Financials: '#14b8a6',
  Communication: '#a855f7',
  'Consumer Staples': '#f5a524',
  Energy: '#ef4444',
  Industrials: '#6b7280',
  Healthcare: '#22c55e',
};
