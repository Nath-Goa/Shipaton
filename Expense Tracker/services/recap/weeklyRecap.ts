import { Ionicons } from '@expo/vector-icons';

import { categoryOf } from '@/constants/categories';
import { tickerOf, TICKERS } from '@/constants/tickers';
import { getAllQuotes, getFullHistory } from '@/services/marketData/marketData';
import { useExpenseStore } from '@/store/useExpenseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useSavingsGoalStore } from '@/store/useSavingsGoalStore';
import { useStreakStore } from '@/store/useStreakStore';
import { daysAgo } from '@/utils/date';
import { money, signedMoney, signedPct } from '@/utils/money';
import { computeNetWorthHistory, summarizePortfolio } from '@/utils/portfolioMath';

// Builds the "Wrapped"-style weekly recap deck entirely from local state —
// deliberately no AI call in this path. The deck has to render instantly
// and reliably for a first-ever open with zero history, and an AI round
// trip (network, a key, shared-quota limits) is exactly the kind of thing
// that can't be allowed to gate that. Every card below is conditional on
// having real data except the three guaranteed ones (intro, stock
// spotlight, outro) — those three alone are enough for a brand-new user
// with no trades, no expenses, and a day-0 streak to still get a real,
// non-empty recap.

export type RecapTone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

export type RecapCard = {
  key: string;
  tone: RecapTone;
  icon: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  stat?: string;
  statSub?: string;
  body?: string;
  bullets?: string[];
};

const MAX_FOLLOWED = 12;

function followedSymbols(): string[] {
  const state = usePortfolioStore.getState();
  const active = state.portfolios[state.activePortfolioId] ?? Object.values(state.portfolios)[0];
  const held = active ? Object.keys(active.holdings ?? {}) : [];
  return [...new Set([...held, ...(state.watchlist ?? [])])].slice(0, MAX_FOLLOWED);
}

// Change over the last 7 calendar days from cached price bars, not the
// quote's own changePct (that's a single day's move) — bars are chronological
// ascending, so the last one with a date on/before the cutoff is the closest
// available baseline a week back. Falls back to the oldest bar on hand when
// history doesn't reach that far, rather than refusing to answer.
function weeklyChangePct(symbol: string): number | null {
  const bars = getFullHistory(symbol);
  if (bars.length < 2) return null;
  const cutoff = daysAgo(7);
  let baseline = bars[0];
  for (const bar of bars) {
    if (bar.date <= cutoff) baseline = bar;
    else break;
  }
  const last = bars[bars.length - 1];
  if (!baseline.close) return null;
  return ((last.close - baseline.close) / baseline.close) * 100;
}

type Mover = { symbol: string; name: string; pct: number };

function biggestWeeklyMover(symbols: string[]): Mover | null {
  let best: Mover | null = null;
  for (const symbol of symbols) {
    const pct = weeklyChangePct(symbol);
    if (pct === null) continue;
    if (!best || Math.abs(pct) > Math.abs(best.pct)) {
      best = { symbol, name: tickerOf(symbol)?.name ?? symbol, pct };
    }
  }
  return best;
}

function averageWeeklyChangePct(symbols: string[]): number | null {
  const values = symbols.map(weeklyChangePct).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function toneForChange(pct: number): RecapTone {
  if (pct > 0.05) return 'success';
  if (pct < -0.05) return 'danger';
  return 'neutral';
}

export function buildWeeklyRecapCards(): RecapCard[] {
  const cards: RecapCard[] = [];
  const since = daysAgo(6);

  cards.push({
    key: 'intro',
    tone: 'accent',
    icon: 'sparkles',
    eyebrow: 'YOUR WEEK',
    title: 'Your week in the markets',
    body: 'Everything that moved — your stocks, your money, your streak — in one quick recap.',
  });

  // The stock portion of the recap: symbols the user actually holds or
  // watches if there are any, otherwise the whole tracked universe — this
  // is the fallback the feature was explicitly asked for, not an edge case
  // being tolerated.
  const followed = followedSymbols();
  const usingGeneralMarket = followed.length === 0;
  const universe = usingGeneralMarket ? TICKERS.map((t) => t.symbol) : followed;

  const mover = biggestWeeklyMover(universe);
  if (mover) {
    cards.push({
      key: 'mover',
      tone: toneForChange(mover.pct),
      icon: mover.pct >= 0 ? 'trending-up' : 'trending-down',
      eyebrow: usingGeneralMarket ? "THIS WEEK'S BIGGEST MOVER" : 'BIGGEST MOVE IN YOUR STOCKS',
      title: mover.name,
      stat: signedPct(mover.pct),
      statSub: usingGeneralMarket
        ? `${mover.symbol} led the whole market this week`
        : `${mover.symbol} moved the most out of your ${followed.length} tracked stock${followed.length === 1 ? '' : 's'}`,
    });
  }

  const avgPct = averageWeeklyChangePct(universe);
  if (avgPct !== null) {
    cards.push({
      key: 'pulse',
      tone: toneForChange(avgPct),
      icon: 'pulse',
      eyebrow: usingGeneralMarket ? 'MARKET PULSE' : 'YOUR STOCKS, ON AVERAGE',
      title: usingGeneralMarket ? 'The market this week' : 'Your watchlist this week',
      stat: signedPct(avgPct),
      statSub: usingGeneralMarket
        ? `Average move across all ${universe.length} tracked stocks`
        : `Average move across the ${universe.length} stock${universe.length === 1 ? '' : 's'} you're following`,
    });
  }

  // Only for someone who has actually traded — computeNetWorthHistory
  // returns [] with zero trades, which doubles as the "skip this card"
  // signal for a pure watcher or a brand-new user.
  const portfolioState = usePortfolioStore.getState();
  const portfolio = portfolioState.portfolios[portfolioState.activePortfolioId] ?? Object.values(portfolioState.portfolios)[0];
  const history = portfolio ? computeNetWorthHistory(portfolio, 8) : [];
  if (history.length >= 2) {
    const quotes = new Map(getAllQuotes().map((q) => [q.symbol, q]));
    const summary = summarizePortfolio(portfolio.cash, portfolio.holdings, quotes);
    const change = summary.netWorth - history[0].netWorth;
    const changePct = history[0].netWorth ? (change / history[0].netWorth) * 100 : 0;
    cards.push({
      key: 'portfolio',
      tone: toneForChange(change),
      icon: change >= 0 ? 'trending-up' : 'trending-down',
      eyebrow: 'YOUR PORTFOLIO',
      title: 'Net worth this week',
      stat: signedMoney(change),
      statSub: `${signedPct(changePct)} · now worth ${money(summary.netWorth)}`,
    });
  }

  const expenses = useExpenseStore.getState().expenses.filter((e) => e.date >= since);
  if (expenses.length > 0) {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = new Map<string, number>();
    for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    cards.push({
      key: 'expenses',
      tone: 'warning',
      icon: 'receipt',
      eyebrow: 'YOU SPENT',
      title: money(total),
      statSub: `Across ${expenses.length} expense${expenses.length === 1 ? '' : 's'}${top ? ` · most on ${categoryOf(top[0]).label}` : ''}`,
    });
  }

  const goals = useSavingsGoalStore.getState().goals;
  if (goals.length > 0) {
    const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
    const reached = goals.filter((g) => g.completedAt).length;
    cards.push({
      key: 'goals',
      tone: 'success',
      icon: 'flag',
      eyebrow: 'SAVINGS GOALS',
      title: money(totalSaved),
      statSub: `Saved across ${goals.length} goal${goals.length === 1 ? '' : 's'}${reached > 0 ? ` · ${reached} reached` : ''}`,
    });
  }

  const streak = useStreakStore.getState();
  cards.push({
    key: 'streak',
    tone: 'accent',
    icon: 'flame',
    eyebrow: 'YOUR STREAK',
    title: streak.streakDays > 0 ? `${streak.streakDays} day${streak.streakDays === 1 ? '' : 's'}` : 'Just getting started',
    statSub:
      streak.badges.length > 0
        ? `${streak.badges.length} badge${streak.badges.length === 1 ? '' : 's'} earned · best streak ${streak.bestStreakDays} day${streak.bestStreakDays === 1 ? '' : 's'}`
        : "Come back tomorrow to start one",
  });

  cards.push({
    key: 'outro',
    tone: 'accent',
    icon: 'checkmark-circle',
    eyebrow: 'THAT\'S A WRAP',
    title: 'See you next week',
    body: 'Keep trading, tracking, and learning — next week\'s recap picks up right where this one left off.',
  });

  return cards;
}
