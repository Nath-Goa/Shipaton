import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// A bump in `epoch` re-seeds every mock stock's simulated price history (see
// services/marketData/mockMarketData.ts, which mixes this into its per-symbol
// seed). Read outside React via useMarketStore.getState().epoch.
type MarketState = {
  epoch: number;
  bumpEpoch: () => void;
};

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      epoch: 0,
      bumpEpoch: () => set((s) => ({ epoch: s.epoch + 1 })),
    }),
    {
      name: 'market-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
