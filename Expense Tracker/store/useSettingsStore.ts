import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Tier } from '@/constants/subscription';
import type { AiProvider } from '@/types/ai';

export type ThemeMode = 'light' | 'dark' | 'system';

type SettingsState = {
  themeMode: ThemeMode;
  tier: Tier;
  onboardingComplete: boolean;
  // Which provider's key to use — the key itself never lives in this
  // persisted store, only in SecureStore (see services/ai/apiKey.ts).
  aiProvider: AiProvider;
  setThemeMode: (mode: ThemeMode) => void;
  setTier: (tier: Tier) => void;
  completeOnboarding: () => void;
  setAiProvider: (provider: AiProvider) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      tier: 'basic',
      onboardingComplete: false,
      aiProvider: 'claude',
      setThemeMode: (themeMode) => set({ themeMode }),
      setTier: (tier) => set({ tier }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
