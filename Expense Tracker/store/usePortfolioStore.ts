import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uid } from '@/utils/id';

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

export type PortfolioData = {
  id: string;
  name: string;
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
};

type TradeResult = { ok: true } | { ok: false; message: string };
type PortfolioActionResult = { ok: true; id?: string } | { ok: false; message: string };

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
};

function freshPortfolio(id: string, name: string): PortfolioData {
  return { id, name, cash: STARTING_CASH, holdings: {}, trades: [] };
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
        return { ok: true };
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
        if (remainingQty <= 0) delete nextHoldings[symbol];
        else nextHoldings[symbol] = { ...existing, qty: remainingQty };

        const updated: PortfolioData = {
          ...active,
          cash: active.cash + proceeds,
          holdings: nextHoldings,
          trades: [{ id: uid(), symbol, side: 'sell', qty, price, total: proceeds, date: Date.now() }, ...active.trades],
        };
        set({ portfolios: { ...portfolios, [activePortfolioId]: updated } });
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
    }),
    {
      name: 'portfolio-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v0 was a single flat portfolio: { cash, holdings, trades, watchlist }.
      // Wrap it into v1's { portfolios, activePortfolioId, watchlist } shape
      // as that user's one existing portfolio, rather than losing it.
      migrate: (persisted: any) => {
        if (persisted && typeof persisted === 'object' && !persisted.portfolios) {
          const { cash, holdings, trades, watchlist } = persisted;
          return {
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
        return persisted;
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
