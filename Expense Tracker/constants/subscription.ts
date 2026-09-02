export type Tier = 'basic' | 'pro' | 'max';

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
};

export const TIER_FEATURES: Record<Tier, FeatureFlags> = {
  basic: {
    tier: 'basic',
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
  },
};

export const TIER_LABELS: Record<Tier, string> = {
  basic: 'Basic',
  pro: 'Pro',
  max: 'Max',
};

export const TIER_PRICE: Record<Tier, string> = {
  basic: 'Free',
  pro: '$6.99/mo',
  max: '$12.99/mo',
};

export const TIER_HEADLINE: Record<Tier, string> = {
  basic: 'Get started with mock trading and the essentials.',
  pro: 'Full forecasts, live sentiment, and an unlimited analyst.',
  max: 'Everything in Pro, plus early access to what comes next.',
};

export const TIER_FEATURE_COPY: Record<Tier, string[]> = {
  basic: [
    'Unlimited mock trading with paper money',
    'Direction call only (up / down / flat)',
    '5 stock detail lookups/day',
    'Ask the analyst — 3 messages/day',
    '24h-delayed sentiment score',
    '3 quizzes/day, 1 daily challenge/day',
    'Expense tracker with photo receipts',
  ],
  pro: [
    'Everything in Basic',
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
    // Placeholder — final Max-only feature set is still being decided.
    'More Max-only features coming soon',
  ],
};

// Features that exist in the plan but are not wired up yet (no payment
// processor is integrated in this build — this is a local, demo entitlement
// switch only).
// TODO: wire to RevenueCat (react-native-purchases) for real purchases/ads.
export const MAX_COMING_SOON: string[] = [
  'Advanced backtesting against historical mock data',
  'Multiple portfolios',
  'Priority support',
];
