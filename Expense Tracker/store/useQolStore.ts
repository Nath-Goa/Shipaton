import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LoadingGame = 'flappy' | 'market-match';
export type RecentActivity = { label: string; href: string; icon: string };

type QolState = {
  hapticsEnabled: boolean;
  soundsEnabled: boolean;
  reducedMotion: boolean;
  hideBalances: boolean;
  loadingGamesEnabled: boolean;
  loadingGame: LoadingGame;
  rememberScroll: boolean;
  recentStocks: string[];
  lastActivity: RecentActivity | null;
  scrollPositions: Record<string, number>;
  lastReselectedTab: string | null;
  tabReselectEpoch: number;
  setHapticsEnabled: (enabled: boolean) => void;
  setSoundsEnabled: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setHideBalances: (hidden: boolean) => void;
  setLoadingGamesEnabled: (enabled: boolean) => void;
  setLoadingGame: (game: LoadingGame) => void;
  setRememberScroll: (enabled: boolean) => void;
  recordStock: (symbol: string) => void;
  setLastActivity: (activity: RecentActivity) => void;
  saveScrollPosition: (key: string, y: number) => void;
  reselectTab: (key: string) => void;
};

export const useQolStore = create<QolState>()(
  persist(
    (set) => ({
      hapticsEnabled: true,
      soundsEnabled: true,
      reducedMotion: false,
      hideBalances: false,
      loadingGamesEnabled: true,
      loadingGame: 'flappy',
      rememberScroll: true,
      recentStocks: [],
      lastActivity: null,
      scrollPositions: {},
      lastReselectedTab: null,
      tabReselectEpoch: 0,
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setSoundsEnabled: (soundsEnabled) => set({ soundsEnabled }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setHideBalances: (hideBalances) => set({ hideBalances }),
      setLoadingGamesEnabled: (loadingGamesEnabled) => set({ loadingGamesEnabled }),
      setLoadingGame: (loadingGame) => set({ loadingGame }),
      setRememberScroll: (rememberScroll) => set({ rememberScroll }),
      recordStock: (symbol) => set((state) => ({ recentStocks: [symbol, ...state.recentStocks.filter((item) => item !== symbol)].slice(0, 5) })),
      setLastActivity: (lastActivity) => set({ lastActivity }),
      saveScrollPosition: (key, y) => set((state) => ({ scrollPositions: { ...state.scrollPositions, [key]: y } })),
      reselectTab: (lastReselectedTab) => set((state) => ({ lastReselectedTab, tabReselectEpoch: state.tabReselectEpoch + 1 })),
    }),
    { name: 'qol-store', storage: createJSONStorage(() => AsyncStorage) }
  )
);
