export type Tier = 'free' | 'pro' | 'max';

export type FeatureFlags = {
  tier: Tier;
  forecastBand: boolean;
  liveSentiment: boolean;
  receiptAutoFill: boolean;
  adsEnabled: boolean;
  pushAlerts: boolean;
  // Learn tab gates
  stockDetailDailyLimit: number | null; // distinct stock detail pages/day — unrelated to AI usage
  patternDetection: boolean; // AI-powered "deep pattern analysis" on a stock
  backtesting: boolean; // historical accuracy backtest of the direction-call algorithm
  multiplePortfolios: boolean; // create/switch between more than one paper portfolio
  limitOrders: boolean; // place buy/sell orders that fill automatically at a target price
  savedChartLimit: number; // how many named/saved expense pie charts a user can keep
  productScanner: boolean; // camera scan a product -> AI-guessed company/companies, deep-linked to its stock
  duelTimeSkip: boolean; // vote to end a duel early once every participant agrees, instead of waiting out ends_at
};

export const TIER_FEATURES: Record<Tier, FeatureFlags> = {
  free: {
    tier: 'free',
    forecastBand: false,
    liveSentiment: false,
    receiptAutoFill: false,
    adsEnabled: true,
    pushAlerts: true,
    productScanner: false,
    stockDetailDailyLimit: 5,
    patternDetection: false,
    backtesting: false,
    multiplePortfolios: false,
    limitOrders: false,
    savedChartLimit: 5,
    duelTimeSkip: false,
  },
  pro: {
    tier: 'pro',
    forecastBand: true,
    liveSentiment: true,
    receiptAutoFill: true,
    adsEnabled: false,
    pushAlerts: true,
    productScanner: true,
    stockDetailDailyLimit: null,
    patternDetection: true,
    backtesting: false,
    multiplePortfolios: false,
    limitOrders: false,
    savedChartLimit: 20,
    duelTimeSkip: true,
  },
  max: {
    tier: 'max',
    forecastBand: true,
    liveSentiment: true,
    receiptAutoFill: true,
    adsEnabled: false,
    pushAlerts: true,
    productScanner: true,
    stockDetailDailyLimit: null,
    patternDetection: true,
    backtesting: true,
    multiplePortfolios: true,
    limitOrders: true,
    savedChartLimit: 100,
    duelTimeSkip: true,
  },
};

// Every AI feature — chat, quizzes, daily challenges, pattern detection,
// receipt auto-fill, spending insights — draws from ONE daily pool per tier,
// but ONLY while running on the shared free-tier key (services/ai/client.ts
// never checks this against a working personal key, which is unlimited).
// Kept deliberately well under the shared Gemini key's own ~1500 msgs/day
// cap even at Max, so no single device can starve everyone else on it.
export const AI_FEATURE_DAILY_LIMIT: Record<Tier, number> = {
  free: 10,
  pro: 50,
  max: 250,
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
  pro: { monthly: '$5/mo', yearly: '$49.99/yr', lifetime: '$129.99' },
  max: { monthly: '$15/mo', yearly: '$139.99/yr', lifetime: '$349.99' },
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
    `${AI_FEATURE_DAILY_LIMIT.free} AI actions/day (chat, quizzes, challenges) on the built-in key — unlimited with your own API key`,
    '24h-delayed sentiment score',
    'Expense tracker with photo receipts',
    'Up to 5 saved spending-breakdown charts',
  ],
  pro: [
    'Everything in Free',
    'Unlimited stock lookups',
    'Full 7-day & 30-day price-range forecasts',
    'Real-time sentiment score + top headlines',
    `${AI_FEATURE_DAILY_LIMIT.pro} AI actions/day on the built-in key — unlimited with your own API key`,
    'AI-powered deep pattern analysis',
    'Scan a product with your camera to find its stock',
    'Vote to end a friend or family duel early once everyone agrees',
    'Receipt "Auto-fill with AI"',
    'AI spending insights on your expenses',
    'Up to 20 saved spending-breakdown charts',
    'Zero ads',
  ],
  max: [
    'Everything in Pro',
    `${AI_FEATURE_DAILY_LIMIT.max} AI actions/day on the built-in key — unlimited with your own API key`,
    'Historical backtesting — test the direction-call algorithm against past mock data and see its hit rate',
    // Keep this number in sync with MAX_PORTFOLIOS in store/usePortfolioStore.ts.
    'Up to 5 paper-trading portfolios, so you can run separate strategies side by side',
    'Limit orders — buy or sell automatically once a stock hits your target price',
    'Up to 100 saved spending-breakdown charts',
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
