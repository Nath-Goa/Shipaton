import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { todayStr } from '@/utils/date';

// Tracks how many distinct stock detail pages have been opened today (for
// the Free-tier "5 stocks/day" gate) and a running lookup count (for the
// every-3rd-lookup simulated ad slot). Resets automatically when the date
// rolls over — checked lazily rather than on a timer.
type StockViewState = {
  date: string;
  viewedSymbols: string[];
  lookupCount: number;
  // Sticky, never reset by the daily rollover — unlike viewedSymbols/
  // lookupCount, which exist only for the Free-tier daily gate. Used where
  // "has this ever happened" is the right question (e.g. a course's
  // practice-step detection), not "happened today specifically".
  hasEverViewedAnyStock: boolean;
  recordView: (symbol: string) => { isNew: boolean; lookupCount: number; viewedTodayCount: number };
  viewedTodayCount: () => number;
  // Would opening `symbol` push a Free-tier user past `limit` distinct
  // stocks today? Already-viewed symbols are always a free re-view.
  wouldExceedLimit: (symbol: string, limit: number | null) => boolean;
};

export const useStockViewStore = create<StockViewState>()(
  persist(
    (set, get) => ({
      date: todayStr(),
      viewedSymbols: [],
      lookupCount: 0,
      hasEverViewedAnyStock: false,

      recordView: (symbol) => {
        const today = todayStr();
        const state = get();
        const stale = state.date !== today;
        const viewedSymbols = stale ? [] : state.viewedSymbols;
        const lookupCount = (stale ? 0 : state.lookupCount) + 1;
        const isNew = !viewedSymbols.includes(symbol);
        const nextViewed = isNew ? [...viewedSymbols, symbol] : viewedSymbols;

        set({ date: today, viewedSymbols: nextViewed, lookupCount, hasEverViewedAnyStock: true });
        return { isNew, lookupCount, viewedTodayCount: nextViewed.length };
      },

      viewedTodayCount: () => {
        const state = get();
        return state.date === todayStr() ? state.viewedSymbols.length : 0;
      },

      wouldExceedLimit: (symbol, limit) => {
        if (limit === null) return false;
        const state = get();
        const viewedToday = state.date === todayStr() ? state.viewedSymbols : [];
        if (viewedToday.includes(symbol)) return false;
        return viewedToday.length >= limit;
      },
    }),
    {
      name: 'stock-view-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
