import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Trade } from '@/store/usePortfolioStore';
import { pairSellWithPriorBuy } from '@/utils/tradeReflection';

// "Loss" here is a heuristic (most-recent-prior-buy pairing, not real
// cost-basis accounting) — good enough for an educational nudge, not a
// financial record. See utils/tradeReflection.ts.
const PANIC_SELL_MAX_HOLD_MS = 24 * 60 * 60 * 1000;
const PANIC_SELL_MIN_LOSS_PCT = -2;

export type MistakePattern = 'panic_sell';

export type MistakeEntry = {
  id: string;
  tradeId: string;
  symbol: string;
  pattern: MistakePattern;
  gainPct: number;
  heldMs: number;
  createdAt: number;
  reflection: string | null;
  dismissed: boolean;
};

type MistakeJournalState = {
  entries: MistakeEntry[];
  // Called right after a sell executes — synchronous, no AI call. Detects
  // and records a mistake pattern if one applies; a no-op otherwise. Dedups
  // per tradeId so re-processing the same trade never double-logs it.
  recordIfMistake: (sellTrade: Trade, allTrades: Trade[]) => void;
  setReflection: (id: string, reflection: string) => void;
  dismiss: (id: string) => void;
};

export const useMistakeJournalStore = create<MistakeJournalState>()(
  persist(
    (set, get) => ({
      entries: [],

      recordIfMistake: (sellTrade, allTrades) => {
        if (get().entries.some((e) => e.tradeId === sellTrade.id)) return;
        const paired = pairSellWithPriorBuy(sellTrade, allTrades);
        if (!paired) return;
        if (paired.heldMs > PANIC_SELL_MAX_HOLD_MS || paired.gainPct > PANIC_SELL_MIN_LOSS_PCT) return;

        const entry: MistakeEntry = {
          id: sellTrade.id,
          tradeId: sellTrade.id,
          symbol: sellTrade.symbol,
          pattern: 'panic_sell',
          gainPct: paired.gainPct,
          heldMs: paired.heldMs,
          createdAt: Date.now(),
          reflection: null,
          dismissed: false,
        };
        set((state) => ({ entries: [entry, ...state.entries].slice(0, 50) }));
      },

      setReflection: (id, reflection) => {
        set((state) => ({ entries: state.entries.map((e) => (e.id === id ? { ...e, reflection } : e)) }));
      },

      dismiss: (id) => {
        set((state) => ({ entries: state.entries.map((e) => (e.id === id ? { ...e, dismissed: true } : e)) }));
      },
    }),
    {
      name: 'mistake-journal-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
