export type QuizTopic = {
  id: string;
  label: string;
  category: 'valuation' | 'technical' | 'fundamentals' | 'strategy' | 'practical';
};

export const QUIZ_TOPICS: QuizTopic[] = [
  { id: 'pe_ratio', label: 'P/E Ratio', category: 'valuation' },
  { id: 'market_cap', label: 'Market Capitalization', category: 'valuation' },
  { id: 'dividend_yield', label: 'Dividend Yield', category: 'valuation' },
  { id: 'eps', label: 'Earnings Per Share', category: 'valuation' },
  { id: 'moving_averages', label: 'Moving Averages', category: 'technical' },
  { id: 'rsi_oversold', label: 'RSI: Overbought & Oversold', category: 'technical' },
  { id: 'volume_analysis', label: 'Trading Volume', category: 'technical' },
  { id: 'support_resistance', label: 'Support & Resistance', category: 'technical' },
  { id: 'candlestick_basics', label: 'Candlestick Charts', category: 'technical' },
  { id: 'volatility', label: 'Volatility', category: 'fundamentals' },
  { id: 'market_cap_categories', label: 'Small vs. Large Cap', category: 'fundamentals' },
  { id: 'sectors', label: 'Market Sectors', category: 'fundamentals' },
  { id: 'bull_bear_markets', label: 'Bull & Bear Markets', category: 'fundamentals' },
  { id: 'diversification', label: 'Diversification', category: 'strategy' },
  { id: 'stop_loss_discipline', label: 'Stop-Loss Orders', category: 'strategy' },
  { id: 'position_sizing', label: 'Position Sizing', category: 'strategy' },
  { id: 'dollar_cost_averaging', label: 'Dollar-Cost Averaging', category: 'strategy' },
  { id: 'risk_management', label: 'Risk Management', category: 'strategy' },
  { id: 'brokerage_accounts', label: 'Brokerage Accounts', category: 'practical' },
  { id: 'etfs_index_funds', label: 'ETFs & Index Funds', category: 'practical' },
  { id: 'capital_gains_tax', label: 'Capital Gains Tax', category: 'practical' },
  { id: 'financial_statements', label: 'Financial Statements', category: 'practical' },
  { id: 'options_basics', label: 'Options Basics', category: 'practical' },
  { id: 'behavioral_biases', label: 'Investing Psychology & Biases', category: 'practical' },
];

const TOPIC_MAP = new Map(QUIZ_TOPICS.map((t) => [t.id, t]));

export function quizTopicOf(id: string): QuizTopic | undefined {
  return TOPIC_MAP.get(id);
}
