import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { badgeInfo } from '@/constants/badges';
import { tickerOf } from '@/constants/tickers';
import { getQuote } from '@/services/marketData/marketData';
import { useMistakeJournalStore } from '@/store/useMistakeJournalStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { RecurringFrequency } from '@/types/expense';
import { addDaysStr, addMonthsStr, todayStr } from '@/utils/date';
import { money } from '@/utils/money';
import { uid } from '@/utils/id';

function nextOccurrence(dateStr: string, freq: RecurringFrequency): string {
  return freq === 'weekly' ? addDaysStr(dateStr, 7) : addMonthsStr(dateStr, 1);
}

export const STARTING_CASH = 100_000;
// A sane ceiling regardless of tier — mainly to keep the switcher UI usable.
export const MAX_PORTFOLIOS = 5;
const DEFAULT_PORTFOLIO_ID = 'default';

export type Holding = { symbol: string; qty: number; avgCost: number };
export type Trade = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  total: number;
  date: number; // epoch ms
};
export type Dividend = { id: string; symbol: string; amount: number; date: number };
export type LimitOrder = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  // Buy fills at or below this price; sell fills at or above it.
  targetPrice: number;
  createdAt: number;
};
export type AutoInvest = {
  id: string;
  symbol: string;
  amount: number; // dollars per occurrence, not a share count
  frequency: RecurringFrequency;
  nextRunDate: string; // "YYYY-MM-DD" — the next date processAutoInvests will fill
  createdAt: number;
};

export type PortfolioData = {
  id: string;
  name: string;
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  // Lifetime dividend payouts, and the last quarterly payout date paid per
  // symbol — kept separate from `holdings` so a payout doesn't get
  // re-triggered just because qty/avgCost changed from a later trade.
  dividends: Dividend[];
  dividendCursor: Record<string, string>;
  // Pending limit orders — see processLimitOrders below.
  limitOrders: LimitOrder[];
  // Recurring dollar-cost-averaging plans — see processAutoInvests below.
  autoInvests: AutoInvest[];
};

const DIVERSIFIED_SECTOR_THRESHOLD = 4;
// A sane ceiling per portfolio — mainly to keep the pending-orders list
// usable, same spirit as MAX_PORTFOLIOS.
export const MAX_LIMIT_ORDERS = 10;
export const MAX_AUTO_INVESTS = 10;

type TradeResult = { ok: true; badgeEarned?: string } | { ok: false; message: string };
type PortfolioActionResult = { ok: true; id?: string } | { ok: false; message: string };
type LimitOrderResult = { ok: true; id: string } | { ok: false; message: string };
type AutoInvestResult = { ok: true; id: string } | { ok: false; message: string };

type PortfolioState = {
  portfolios: Record<string, PortfolioData>;
  activePortfolioId: string;
  // Shared across every portfolio — a watched stock is a standing interest,
  // not a position, so switching paper-trading strategies shouldn't reset it.
  watchlist: string[];
  buy: (symbol: string, qty: number, price: number) => TradeResult;
  sell: (symbol: string, qty: number, price: number) => TradeResult;
  toggleWatchlist: (symbol: string) => void;
  // Wipes the active portfolio only (used by "Regenerate market", where every
  // OTHER portfolio's holdings are equally stale against the new price
  // series — that call site resets all of them via resetAllPortfolios).
  resetActivePortfolio: () => void;
  resetAllPortfolios: () => void;
  createPortfolio: (name: string) => PortfolioActionResult;
  renamePortfolio: (id: string, name: string) => void;
  deletePortfolio: (id: string) => PortfolioActionResult;
  switchPortfolio: (id: string) => void;
  // Pays out quarterly dividends for every held symbol that has a
  // dividendYield configured, straight into that portfolio's cash.
  // Idempotent — safe to call on every app open (see dividendCursor).
  processDividends: () => void;
  // Places a pending order on the ACTIVE portfolio, filled later by
  // processLimitOrders once the price condition is met. Re-validated at
  // fill time, not reserved at placement time (see processLimitOrders).
  placeLimitOrder: (symbol: string, side: 'buy' | 'sell', qty: number, targetPrice: number) => LimitOrderResult;
  cancelLimitOrder: (orderId: string) => void;
  // Checks every pending limit order across ALL portfolios against a live
  // price lookup and fills whatever qualifies. Safe to call repeatedly —
  // components/markets/LimitOrderWatcher.tsx drives this from a quote poll.
  processLimitOrders: (priceFor: (symbol: string) => number | undefined) => void;
  // Creates a recurring dollar-cost-average plan on the ACTIVE portfolio —
  // a fixed dollar amount into `symbol` every week/month, filled by
  // processAutoInvests below.
  createAutoInvest: (symbol: string, amount: number, frequency: RecurringFrequency) => AutoInvestResult;
  cancelAutoInvest: (planId: string) => void;
  // Fills every due auto-invest plan across ALL portfolios at the given
  // symbol's current price. Idempotent — safe to call on every app open
  // (each plan's own nextRunDate tracks what's already been filled).
  processAutoInvests: () => void;
};

function freshPortfolio(id: string, name: string): PortfolioData {
  return {
    id,
    name,
    cash: STARTING_CASH,
    holdings: {},
    trades: [],
    dividends: [],
    dividendCursor: {},
    limitOrders: [],
    autoInvests: [],
  };
}

const initialState = {
  portfolios: { [DEFAULT_PORTFOLIO_ID]: freshPortfolio(DEFAULT_PORTFOLIO_ID, 'Main Portfolio') },
  activePortfolioId: DEFAULT_PORTFOLIO_ID,
  watchlist: [] as string[],
};

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      ...initialState,

      buy: (symbol, qty, price) => {
        if (qty <= 0) return { ok: false, message: 'Enter a quantity greater than 0.' };
        const cost = qty * price;
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        if (cost > active.cash) return { ok: false, message: "That's more than your available cash." };

        const existing = active.holdings[symbol];
        const newQty = (existing?.qty ?? 0) + qty;
        const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;

        const updated: PortfolioData = {
          ...active,
          cash: active.cash - cost,
          holdings: { ...active.holdings, [symbol]: { symbol, qty: newQty, avgCost: newAvgCost } },
          trades: [{ id: uid(), symbol, side: 'buy', qty, price, total: cost, date: Date.now() }, ...active.trades],
        };
        set({ portfolios: { ...portfolios, [activePortfolioId]: updated } });

        let badgeEarned: string | undefined;
        if (active.trades.length === 0) {
          badgeEarned = useStreakStore.getState().awardBadge('first_trade')[0];
        }
        if (!badgeEarned) {
          const sectors = new Set(Object.keys(updated.holdings).map((s) => tickerOf(s)?.sector).filter(Boolean));
          if (sectors.size >= DIVERSIFIED_SECTOR_THRESHOLD) {
            badgeEarned = useStreakStore.getState().awardBadge('diversified')[0];
          }
        }
        return { ok: true, badgeEarned };
      },

      sell: (symbol, qty, price) => {
        if (qty <= 0) return { ok: false, message: 'Enter a quantity greater than 0.' };
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        const existing = active.holdings[symbol];
        if (!existing || existing.qty < qty) return { ok: false, message: "You don't own that many shares." };

        const proceeds = qty * price;
        const remainingQty = existing.qty - qty;
        const nextHoldings = { ...active.holdings };
        const nextDividendCursor = active.dividendCursor;
        let dividendCursorChanged = false;
        if (remainingQty <= 0) {
          delete nextHoldings[symbol];
          // Fully closing a position clears its dividend cursor too — a
          // later re-buy should accrue from then, not resume a stale cursor
          // and pay for a stretch when this portfolio held nothing.
          if (symbol in nextDividendCursor) dividendCursorChanged = true;
        } else {
          nextHoldings[symbol] = { ...existing, qty: remainingQty };
        }

        const sellTrade: Trade = { id: uid(), symbol, side: 'sell', qty, price, total: proceeds, date: Date.now() };
        const updated: PortfolioData = {
          ...active,
          cash: active.cash + proceeds,
          holdings: nextHoldings,
          trades: [sellTrade, ...active.trades],
          dividendCursor: dividendCursorChanged
            ? Object.fromEntries(Object.entries(active.dividendCursor).filter(([s]) => s !== symbol))
            : active.dividendCursor,
        };
        set({ portfolios: { ...portfolios, [activePortfolioId]: updated } });
        // Synchronous, no AI call — just pattern detection. See
        // store/useMistakeJournalStore.ts for what "mistake" means here.
        useMistakeJournalStore.getState().recordIfMistake(sellTrade, updated.trades);
        return { ok: true };
      },

      toggleWatchlist: (symbol) => {
        set((state) => ({
          watchlist: state.watchlist.includes(symbol)
            ? state.watchlist.filter((s) => s !== symbol)
            : [...state.watchlist, symbol],
        }));
      },

      resetActivePortfolio: () => {
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        set({ portfolios: { ...portfolios, [activePortfolioId]: freshPortfolio(active.id, active.name) } });
      },

      resetAllPortfolios: () => {
        const { portfolios } = get();
        const next: Record<string, PortfolioData> = {};
        for (const p of Object.values(portfolios)) next[p.id] = freshPortfolio(p.id, p.name);
        set({ portfolios: next });
      },

      createPortfolio: (name) => {
        const { portfolios } = get();
        const ids = Object.keys(portfolios);
        if (ids.length >= MAX_PORTFOLIOS) return { ok: false, message: `You can have up to ${MAX_PORTFOLIOS} portfolios.` };
        const trimmed = name.trim();
        const id = uid();
        set({
          portfolios: { ...portfolios, [id]: freshPortfolio(id, trimmed || `Portfolio ${ids.length + 1}`) },
          activePortfolioId: id,
        });
        return { ok: true, id };
      },

      renamePortfolio: (id, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        set((state) => {
          const existing = state.portfolios[id];
          if (!existing) return state;
          return { portfolios: { ...state.portfolios, [id]: { ...existing, name: trimmed } } };
        });
      },

      deletePortfolio: (id) => {
        const { portfolios, activePortfolioId } = get();
        const ids = Object.keys(portfolios);
        if (ids.length <= 1) return { ok: false, message: 'You need at least one portfolio.' };
        if (!portfolios[id]) return { ok: false, message: 'Portfolio not found.' };
        const next = { ...portfolios };
        delete next[id];
        const nextActive = activePortfolioId === id ? Object.keys(next)[0] : activePortfolioId;
        set({ portfolios: next, activePortfolioId: nextActive });
        return { ok: true };
      },

      switchPortfolio: (id) => {
        if (!get().portfolios[id]) return;
        set({ activePortfolioId: id });
      },

      processDividends: () => {
        const today = todayStr();
        const { portfolios } = get();
        const nextPortfolios: Record<string, PortfolioData> = { ...portfolios };
        let anyPaid = false;
        let totalPaid = 0;

        for (const portfolio of Object.values(portfolios)) {
          let cash = portfolio.cash;
          const dividends = [...portfolio.dividends];
          const cursor = { ...portfolio.dividendCursor };
          let portfolioChanged = false;

          for (const [symbol, holding] of Object.entries(portfolio.holdings)) {
            const ticker = tickerOf(symbol);
            if (!ticker?.dividendYield || holding.qty <= 0) continue;

            // First time we ever see this holding, seed the cursor at today
            // rather than backdating — dividends start accruing going
            // forward only. `cursor[symbol]` tracks the last date already
            // paid through (or the seed), not the next due date, so a
            // reopen right after the due date still pays it exactly once.
            let paidThrough = cursor[symbol] ?? today;
            let guard = 0;
            while (guard < 8) {
              const due = addMonthsStr(paidThrough, 3);
              if (due > today) break;
              const price = getQuote(symbol).price;
              const amount = Math.round(price * (ticker.dividendYield / 4) * holding.qty * 100) / 100;
              if (amount > 0) {
                dividends.unshift({ id: uid(), symbol, amount, date: Date.now() });
                cash += amount;
                totalPaid += amount;
                portfolioChanged = true;
              }
              paidThrough = due;
              guard++;
            }
            cursor[symbol] = paidThrough;
          }

          if (portfolioChanged || Object.keys(cursor).length !== Object.keys(portfolio.dividendCursor).length) {
            nextPortfolios[portfolio.id] = { ...portfolio, cash, dividends, dividendCursor: cursor };
            anyPaid = anyPaid || portfolioChanged;
          }
        }

        if (Object.keys(nextPortfolios).some((id) => nextPortfolios[id] !== portfolios[id])) {
          set({ portfolios: nextPortfolios });
        }
        if (anyPaid) {
          useToastStore.getState().show(`💰 ${money(totalPaid)} in dividends received`);
        }
      },

      placeLimitOrder: (symbol, side, qty, targetPrice) => {
        if (qty <= 0) return { ok: false, message: 'Enter a quantity greater than 0.' };
        if (!(targetPrice > 0)) return { ok: false, message: 'Enter a valid target price.' };
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        if (active.limitOrders.length >= MAX_LIMIT_ORDERS) {
          return { ok: false, message: `You can have up to ${MAX_LIMIT_ORDERS} pending orders at once.` };
        }
        if (side === 'buy' && qty * targetPrice > active.cash) {
          return { ok: false, message: "That's more than your available cash." };
        }
        if (side === 'sell' && (active.holdings[symbol]?.qty ?? 0) < qty) {
          return { ok: false, message: "You don't own that many shares." };
        }
        const order: LimitOrder = { id: uid(), symbol, side, qty, targetPrice, createdAt: Date.now() };
        set({
          portfolios: {
            ...portfolios,
            [activePortfolioId]: { ...active, limitOrders: [order, ...active.limitOrders] },
          },
        });
        return { ok: true, id: order.id };
      },

      cancelLimitOrder: (orderId) => {
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        set({
          portfolios: {
            ...portfolios,
            [activePortfolioId]: { ...active, limitOrders: active.limitOrders.filter((o) => o.id !== orderId) },
          },
        });
      },

      processLimitOrders: (priceFor) => {
        const { portfolios } = get();
        const nextPortfolios: Record<string, PortfolioData> = { ...portfolios };
        const fills: { symbol: string; side: 'buy' | 'sell'; qty: number; price: number; badgeEarned?: string }[] = [];
        const cancellations: string[] = [];

        for (const portfolio of Object.values(portfolios)) {
          if (portfolio.limitOrders.length === 0) continue;
          let cash = portfolio.cash;
          const holdings = { ...portfolio.holdings };
          const trades = [...portfolio.trades];
          const dividendCursor = { ...portfolio.dividendCursor };
          const remaining: LimitOrder[] = [];
          let changed = false;
          // Mirrors buy()'s badge logic, applied the same way for a fill
          // that happens via a limit order instead of an immediate market
          // order — otherwise a limit-only trading history never earns them.
          let hasTraded = portfolio.trades.length > 0;

          for (const order of portfolio.limitOrders) {
            const price = priceFor(order.symbol);
            const triggered =
              price != null && (order.side === 'buy' ? price <= order.targetPrice : price >= order.targetPrice);
            if (!triggered) {
              remaining.push(order);
              continue;
            }

            // Re-validate against current state — cash/shares may have
            // moved since the order was placed.
            let badgeEarned: string | undefined;
            if (order.side === 'buy') {
              const cost = order.qty * price;
              if (cost > cash) {
                cancellations.push(order.symbol);
                changed = true;
                continue;
              }
              const existing = holdings[order.symbol];
              const newQty = (existing?.qty ?? 0) + order.qty;
              const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;
              cash -= cost;
              holdings[order.symbol] = { symbol: order.symbol, qty: newQty, avgCost: newAvgCost };
              trades.unshift({ id: uid(), symbol: order.symbol, side: 'buy', qty: order.qty, price, total: cost, date: Date.now() });

              if (!hasTraded) {
                badgeEarned = useStreakStore.getState().awardBadge('first_trade')[0];
              }
              hasTraded = true;
              if (!badgeEarned) {
                const sectors = new Set(Object.keys(holdings).map((s) => tickerOf(s)?.sector).filter(Boolean));
                if (sectors.size >= DIVERSIFIED_SECTOR_THRESHOLD) {
                  badgeEarned = useStreakStore.getState().awardBadge('diversified')[0];
                }
              }
            } else {
              const existing = holdings[order.symbol];
              if (!existing || existing.qty < order.qty) {
                cancellations.push(order.symbol);
                changed = true;
                continue;
              }
              const proceeds = order.qty * price;
              const remainingQty = existing.qty - order.qty;
              if (remainingQty <= 0) {
                delete holdings[order.symbol];
                // Same fix as sell(): closing a position fully clears its
                // dividend cursor so a later re-buy doesn't inherit a stale
                // one.
                delete dividendCursor[order.symbol];
              } else {
                holdings[order.symbol] = { ...existing, qty: remainingQty };
              }
              cash += proceeds;
              const sellTrade: Trade = { id: uid(), symbol: order.symbol, side: 'sell', qty: order.qty, price, total: proceeds, date: Date.now() };
              trades.unshift(sellTrade);
              // Synchronous, no AI call. Uses `trades` (already includes
              // this fill) so the pairing sees the full history so far.
              useMistakeJournalStore.getState().recordIfMistake(sellTrade, trades);
            }
            fills.push({ symbol: order.symbol, side: order.side, qty: order.qty, price, badgeEarned });
            changed = true;
          }

          if (changed) {
            nextPortfolios[portfolio.id] = { ...portfolio, cash, holdings, trades, dividendCursor, limitOrders: remaining };
          }
        }

        if (Object.keys(nextPortfolios).some((id) => nextPortfolios[id] !== portfolios[id])) {
          set({ portfolios: nextPortfolios });
        }
        for (const fill of fills) {
          const base = `✅ Limit order filled: ${fill.side === 'buy' ? 'Bought' : 'Sold'} ${fill.qty} ${fill.symbol} @ ${money(fill.price)}`;
          useToastStore.getState().show(fill.badgeEarned ? `${base} · 🏅 ${badgeInfo(fill.badgeEarned).label} badge earned!` : base);
        }
        for (const symbol of cancellations) {
          useToastStore.getState().show(`⚠️ A limit order for ${symbol} couldn't fill and was cancelled.`);
        }
      },

      createAutoInvest: (symbol, amount, frequency) => {
        if (!(amount > 0)) return { ok: false, message: 'Enter an amount greater than 0.' };
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        if (active.autoInvests.length >= MAX_AUTO_INVESTS) {
          return { ok: false, message: `You can have up to ${MAX_AUTO_INVESTS} auto-invest plans at once.` };
        }
        const plan: AutoInvest = {
          id: uid(),
          symbol,
          amount,
          frequency,
          // First contribution happens on the next cycle, not immediately —
          // matches a real recurring-investment plan you just set up today.
          nextRunDate: nextOccurrence(todayStr(), frequency),
          createdAt: Date.now(),
        };
        set({
          portfolios: {
            ...portfolios,
            [activePortfolioId]: { ...active, autoInvests: [plan, ...active.autoInvests] },
          },
        });
        return { ok: true, id: plan.id };
      },

      cancelAutoInvest: (planId) => {
        const { portfolios, activePortfolioId } = get();
        const active = portfolios[activePortfolioId];
        set({
          portfolios: {
            ...portfolios,
            [activePortfolioId]: { ...active, autoInvests: active.autoInvests.filter((p) => p.id !== planId) },
          },
        });
      },

      processAutoInvests: () => {
        const today = todayStr();
        const { portfolios } = get();
        const nextPortfolios: Record<string, PortfolioData> = { ...portfolios };
        const fills: { symbol: string; amount: number; qty: number; badgeEarned?: string }[] = [];
        const skippedSymbols = new Set<string>();

        for (const portfolio of Object.values(portfolios)) {
          if (portfolio.autoInvests.length === 0) continue;
          let cash = portfolio.cash;
          const holdings = { ...portfolio.holdings };
          const trades = [...portfolio.trades];
          const plans: AutoInvest[] = [];
          let changed = false;
          // Mirrors buy()'s badge logic — an auto-invest fill should earn
          // First Trade / Diversified exactly like a manual or limit-order
          // buy would.
          let hasTraded = portfolio.trades.length > 0;

          for (const plan of portfolio.autoInvests) {
            let nextRun = plan.nextRunDate;
            let guard = 0;
            // Caps catch-up at 12 cycles so a very stale install doesn't
            // dump a year of contributions in one go.
            while (guard < 12 && nextRun <= today) {
              const price = getQuote(plan.symbol).price;
              if (price > 0 && plan.amount <= cash) {
                // Dollar-cost averaging buys fractional shares by design —
                // a fixed dollar amount, not a fixed share count.
                const qty = Math.round((plan.amount / price) * 1000) / 1000;
                if (qty > 0) {
                  const existing = holdings[plan.symbol];
                  const newQty = (existing?.qty ?? 0) + qty;
                  const newAvgCost = existing ? (existing.avgCost * existing.qty + plan.amount) / newQty : price;
                  cash -= plan.amount;
                  holdings[plan.symbol] = { symbol: plan.symbol, qty: newQty, avgCost: newAvgCost };
                  trades.unshift({ id: uid(), symbol: plan.symbol, side: 'buy', qty, price, total: plan.amount, date: Date.now() });

                  let badgeEarned: string | undefined;
                  if (!hasTraded) badgeEarned = useStreakStore.getState().awardBadge('first_trade')[0];
                  hasTraded = true;
                  if (!badgeEarned) {
                    const sectors = new Set(Object.keys(holdings).map((s) => tickerOf(s)?.sector).filter(Boolean));
                    if (sectors.size >= DIVERSIFIED_SECTOR_THRESHOLD) {
                      badgeEarned = useStreakStore.getState().awardBadge('diversified')[0];
                    }
                  }
                  fills.push({ symbol: plan.symbol, amount: plan.amount, qty, badgeEarned });
                  changed = true;
                }
              } else {
                // Not enough cash this cycle — skip just this occurrence,
                // the plan itself stays active for the next one.
                skippedSymbols.add(plan.symbol);
                changed = true;
              }
              nextRun = nextOccurrence(nextRun, plan.frequency);
              guard++;
            }
            plans.push(nextRun === plan.nextRunDate ? plan : { ...plan, nextRunDate: nextRun });
          }

          if (changed) {
            nextPortfolios[portfolio.id] = { ...portfolio, cash, holdings, trades, autoInvests: plans };
          }
        }

        if (Object.keys(nextPortfolios).some((id) => nextPortfolios[id] !== portfolios[id])) {
          set({ portfolios: nextPortfolios });
        }
        for (const fill of fills) {
          const base = `💵 Auto-invested ${money(fill.amount)} into ${fill.symbol} (${fill.qty} sh)`;
          useToastStore.getState().show(fill.badgeEarned ? `${base} · 🏅 ${badgeInfo(fill.badgeEarned).label} badge earned!` : base);
        }
        for (const symbol of skippedSymbols) {
          useToastStore.getState().show(`⚠️ Not enough cash for the ${symbol} auto-invest this cycle — plan stays active.`);
        }
      },
    }),
    {
      name: 'portfolio-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 4,
      // v0 was a single flat portfolio: { cash, holdings, trades, watchlist }.
      // Wrap it into v1's { portfolios, activePortfolioId, watchlist } shape
      // as that user's one existing portfolio, rather than losing it. v2
      // added per-portfolio dividends/dividendCursor, v3 added limitOrders,
      // v4 added autoInvests — all backfilled below for anyone persisted
      // before that.
      migrate: (persisted: any) => {
        let state = persisted;
        if (state && typeof state === 'object' && !state.portfolios) {
          const { cash, holdings, trades, watchlist } = state;
          state = {
            watchlist: watchlist ?? [],
            activePortfolioId: DEFAULT_PORTFOLIO_ID,
            portfolios: {
              [DEFAULT_PORTFOLIO_ID]: {
                id: DEFAULT_PORTFOLIO_ID,
                name: 'Main Portfolio',
                cash: cash ?? STARTING_CASH,
                holdings: holdings ?? {},
                trades: trades ?? [],
              },
            },
          };
        }
        if (state?.portfolios) {
          const backfilled: Record<string, any> = {};
          for (const [id, p] of Object.entries<any>(state.portfolios)) {
            backfilled[id] = {
              ...p,
              dividends: p.dividends ?? [],
              dividendCursor: p.dividendCursor ?? {},
              limitOrders: p.limitOrders ?? [],
              autoInvests: p.autoInvests ?? [],
            };
          }
          state = { ...state, portfolios: backfilled };
        }
        return state;
      },
    }
  )
);

// Convenience selector for the common case of "just give me the current
// portfolio" — screens that need to create/rename/switch/delete still read
// `portfolios`/`activePortfolioId` from usePortfolioStore directly.
export function useActivePortfolio(): PortfolioData {
  return usePortfolioStore((s) => s.portfolios[s.activePortfolioId] ?? Object.values(s.portfolios)[0]);
}
