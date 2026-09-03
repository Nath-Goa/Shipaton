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
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication', basePrice: 780.1, volatility: 0.026 },
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
