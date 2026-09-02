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

// Each paid tier is purchasable on three billing periods — matches the
// "monthly" / "yearly" / "lifetime" package identifiers configured per tier
// offering in the RevenueCat dashboard (see services/purchases/revenuecat.ts).
export type BillingPeriod = 'monthly' | 'yearly' | 'lifetime';

export const BILLING_PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  lifetime: 'Lifetime',
};

// Demo-mode / glance pricing only — once RevenueCat is configured, the
// paywall always shows real store-localized prices instead of these.
export const TIER_PERIOD_PRICE: Record<Exclude<Tier, 'free'>, Record<BillingPeriod, string>> = {
  pro: { monthly: '$6.99/mo', yearly: '$59.99/yr', lifetime: '$149.99' },
  max: { monthly: '$12.99/mo', yearly: '$109.99/yr', lifetime: '$299.99' },
};

export const TIER_PRICE: Record<Tier, string> = {
  free: 'Free',
  pro: TIER_PERIOD_PRICE.pro.monthly,
  max: TIER_PERIOD_PRICE.max.monthly,
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
// Umbrella "any paid access" entitlement, named after the app — RevenueCat's
// own default suggestion for a project that hasn't set up granular
// per-tier entitlements yet. Treated as equivalent to ENTITLEMENT_PRO (the
// base paid tier) in tierFromCustomerInfo, so the app keeps working exactly
// the same whether your dashboard grants "pro"/"max" specifically or just
// this one — Max still needs its own entitlement to unlock Max-only
// features.
export const ENTITLEMENT_APP = 'stock_market_predictor_and_tutor';
