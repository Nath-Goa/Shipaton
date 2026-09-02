import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { uid } from '@/utils/id';

export const STARTING_CASH = 100_000;

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

type TradeResult = { ok: true } | { ok: false; message: string };

type PortfolioState = {
  cash: number;
  holdings: Record<string, Holding>;
  trades: Trade[];
  watchlist: string[];
  buy: (symbol: string, qty: number, price: number) => TradeResult;
  sell: (symbol: string, qty: number, price: number) => TradeResult;
  toggleWatchlist: (symbol: string) => void;
  resetPortfolio: () => void;
};

const initialState = {
  cash: STARTING_CASH,
  holdings: {} as Record<string, Holding>,
  trades: [] as Trade[],
  watchlist: [] as string[],
};

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      ...initialState,
      buy: (symbol, qty, price) => {
        if (qty <= 0) return { ok: false, message: 'Enter a quantity greater than 0.' };
        const cost = qty * price;
        const { cash, holdings, trades } = get();
        if (cost > cash) return { ok: false, message: "That's more than your available cash." };

        const existing = holdings[symbol];
        const newQty = (existing?.qty ?? 0) + qty;
        const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;

        set({
          cash: cash - cost,
          holdings: { ...holdings, [symbol]: { symbol, qty: newQty, avgCost: newAvgCost } },
          trades: [{ id: uid(), symbol, side: 'buy', qty, price, total: cost, date: Date.now() }, ...trades],
        });
        return { ok: true };
      },
      sell: (symbol, qty, price) => {
        if (qty <= 0) return { ok: false, message: 'Enter a quantity greater than 0.' };
        const { cash, holdings, trades } = get();
        const existing = holdings[symbol];
        if (!existing || existing.qty < qty) return { ok: false, message: "You don't own that many shares." };

        const proceeds = qty * price;
        const remainingQty = existing.qty - qty;
        const nextHoldings = { ...holdings };
        if (remainingQty <= 0) delete nextHoldings[symbol];
        else nextHoldings[symbol] = { ...existing, qty: remainingQty };

        set({
          cash: cash + proceeds,
          holdings: nextHoldings,
          trades: [{ id: uid(), symbol, side: 'sell', qty, price, total: proceeds, date: Date.now() }, ...trades],
        });
        return { ok: true };
      },
      toggleWatchlist: (symbol) => {
        set((state) => ({
          watchlist: state.watchlist.includes(symbol)
            ? state.watchlist.filter((s) => s !== symbol)
            : [...state.watchlist, symbol],
        }));
      },
      resetPortfolio: () => set({ ...initialState }),
    }),
    {
      name: 'portfolio-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
