export type Tier = 'free' | 'pro' | 'max';

export type FeatureFlags = {
  tier: Tier;
  assistantDailyLimit: number | null; // null = unlimited
  forecastBand: boolean;
  liveSentiment: boolean;
  receiptAutoFill: boolean;
  adsEnabled: boolean;
  pushAlerts: boolean;
  // Learn tab gates
  stockDetailDailyLimit: number | null; // distinct stock detail pages/day
  quizDailyLimit: number | null;
  narrativeDailyLimit: number | null;
  patternDetection: boolean; // AI-powered "deep pattern analysis" on a stock
  backtesting: boolean; // historical accuracy backtest of the direction-call algorithm
  multiplePortfolios: boolean; // create/switch between more than one paper portfolio
};

export const TIER_FEATURES: Record<Tier, FeatureFlags> = {
  free: {
    tier: 'free',
    assistantDailyLimit: 3,
    forecastBand: false,
    liveSentiment: false,
    receiptAutoFill: false,
    adsEnabled: true,
    pushAlerts: false,
    stockDetailDailyLimit: 5,
    quizDailyLimit: 3,
    narrativeDailyLimit: 1,
    patternDetection: false,
    backtesting: false,
    multiplePortfolios: false,
  },
  pro: {
    tier: 'pro',
    assistantDailyLimit: null,
    forecastBand: true,
    liveSentiment: true,
    receiptAutoFill: true,
    adsEnabled: false,
    pushAlerts: true,
    stockDetailDailyLimit: null,
    quizDailyLimit: null,
    narrativeDailyLimit: null,
    patternDetection: true,
    backtesting: false,
    multiplePortfolios: false,
  },
  max: {
    tier: 'max',
    assistantDailyLimit: null,
    forecastBand: true,
    liveSentiment: true,
    receiptAutoFill: true,
    adsEnabled: false,
    pushAlerts: true,
    stockDetailDailyLimit: null,
    quizDailyLimit: null,
    narrativeDailyLimit: null,
    patternDetection: true,
    backtesting: true,
    multiplePortfolios: true,
  },
};

export const TIER_LABELS: Record<Tier, string> = {
  free: 'Free',
  pro: 'Pro',
  max: 'Max',
};

export const TIER_PRICE: Record<Tier, string> = {
  free: 'Free',
  pro: '$6.99/mo',
  max: '$12.99/mo',
};

export const TIER_HEADLINE: Record<Tier, string> = {
  free: 'Get started with mock trading and the essentials.',
  pro: 'Full forecasts, live sentiment, and an unlimited analyst.',
  max: 'Everything in Pro, plus historical backtesting.',
};

export const TIER_FEATURE_COPY: Record<Tier, string[]> = {
  free: [
    'Unlimited mock trading with paper money',
    'Direction call only (up / down / flat)',
    '5 stock detail lookups/day',
    'Ask the analyst — 3 messages/day',
    '24h-delayed sentiment score',
    '3 quizzes/day, 1 daily challenge/day',
    'Expense tracker with photo receipts',
  ],
  pro: [
    'Everything in Free',
    'Unlimited stock lookups',
    'Full 7-day & 30-day price-range forecasts',
    'Real-time sentiment score + top headlines',
    'Unlimited analyst chat',
    'AI-powered deep pattern analysis',
    'Unlimited quizzes & daily challenges',
    'Receipt "Auto-fill with AI"',
    'Zero ads',
  ],
  max: [
    'Everything in Pro',
    'Historical backtesting — test the direction-call algorithm against past mock data and see its hit rate',
    // Keep this number in sync with MAX_PORTFOLIOS in store/usePortfolioStore.ts.
    'Up to 5 paper-trading portfolios, so you can run separate strategies side by side',
  ],
};

// RevenueCat entitlement identifiers. These must match the entitlements
// configured in the RevenueCat dashboard exactly (Project > Entitlements).
// A customer holding the "max" entitlement is treated as Max even if they
// don't also hold "pro" — configure your Max product to grant both
// entitlements in RevenueCat, or adjust services/purchases/revenuecat.ts if
// you'd rather keep them mutually exclusive.
export const ENTITLEMENT_PRO = 'pro';
export const ENTITLEMENT_MAX = 'max';
