import type { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import type { ComponentProps } from 'react';

import { AI_FEATURE_DAILY_LIMIT, type Tier } from '@/constants/subscription';

// The "try it out" list on the post-purchase celebration screen
// (app/purchase-success.tsx). Each entry is something the tier actually
// unlocks in TIER_FEATURES, paired with the screen where it can be tried
// straight away. Keep it in step with TIER_FEATURE_COPY when a tier's
// features change: this list is the short, tappable version of that copy.
export type TierBenefit = {
  key: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  // null for a perk that has no screen of its own (e.g. no ads) — it renders
  // as already-active instead of as a link.
  route: Href | null;
};

const PRO_BENEFITS: TierBenefit[] = [
  {
    key: 'stock-insights',
    icon: 'analytics',
    title: 'Forecasts, live sentiment & AI patterns',
    description: '7- and 30-day price ranges, real-time headlines and deep pattern analysis on every stock.',
    route: '/markets/AAPL',
  },
  {
    key: 'lookups',
    icon: 'search',
    title: 'Unlimited stock lookups',
    description: 'Open as many stock pages as you like, every day.',
    route: '/markets',
  },
  {
    key: 'scanner',
    icon: 'scan',
    title: 'Product scanner',
    description: 'Point your camera at a product and find the company behind it.',
    route: '/scanner',
  },
  {
    key: 'receipts',
    icon: 'receipt',
    title: 'Receipt auto-fill',
    description: 'Snap a receipt and let AI fill in the expense for you.',
    route: '/expenses/add',
  },
  {
    key: 'spending-insights',
    icon: 'bulb',
    title: 'AI spending insights',
    description: 'A plain-English read on where your money is going.',
    route: '/expenses',
  },
  {
    key: 'visual-lessons',
    icon: 'play-circle',
    title: 'Visual lessons',
    description: 'Every course gets a hand-picked video and a real chart.',
    route: '/learn',
  },
  {
    key: 'ai-pro',
    icon: 'sparkles',
    title: `${AI_FEATURE_DAILY_LIMIT.pro} AI actions a day`,
    description: 'Chat, quizzes and challenges on the built-in key, or unlimited with your own.',
    route: '/assistant',
  },
  {
    key: 'toolkit-pro',
    icon: 'calculator',
    title: '8 advanced calculators',
    description: 'Growth, valuation and risk tools in the Investor Toolkit.',
    route: '/toolkit',
  },
  {
    key: 'no-ads',
    icon: 'eye-off',
    title: 'No ads',
    description: 'Every ad slot in the app is gone.',
    route: null,
  },
];

const MAX_BENEFITS: TierBenefit[] = [
  {
    key: 'backtesting',
    icon: 'time',
    title: 'Historical backtesting',
    description: 'See how the direction-call algorithm would have done on past data.',
    route: '/markets/backtest',
  },
  {
    key: 'portfolios',
    icon: 'layers',
    // Keep in sync with MAX_PORTFOLIOS in store/usePortfolioStore.ts.
    title: 'Up to 5 portfolios',
    description: 'Run separate strategies side by side.',
    route: '/markets/portfolio/manage',
  },
  {
    key: 'limit-orders',
    icon: 'flag',
    title: 'Limit orders',
    description: 'Buy or sell automatically once a stock hits your target price.',
    route: '/markets/portfolio/trade/AAPL',
  },
  {
    key: 'ai-max',
    icon: 'sparkles',
    title: `${AI_FEATURE_DAILY_LIMIT.max} AI actions a day`,
    description: 'Chat, quizzes and challenges on the built-in key, or unlimited with your own.',
    route: '/assistant',
  },
  {
    key: 'toolkit-max',
    icon: 'calculator',
    title: '4 professional calculators',
    description: 'Optimization and planning tools, on top of all the Pro ones.',
    route: '/toolkit',
  },
];

// Pro entries that Max's own list already replaces with a bigger version.
const SUPERSEDED_BY_MAX = new Set(['ai-pro', 'toolkit-pro']);

export type BenefitSection = { title: string; benefits: TierBenefit[] };

export function benefitSectionsFor(tier: Exclude<Tier, 'free'>): BenefitSection[] {
  if (tier === 'pro') return [{ title: 'Try out your new perks', benefits: PRO_BENEFITS }];
  return [
    { title: 'Try out your new perks', benefits: MAX_BENEFITS },
    { title: 'Plus everything in Pro', benefits: PRO_BENEFITS.filter((b) => !SUPERSEDED_BY_MAX.has(b.key)) },
  ];
}
