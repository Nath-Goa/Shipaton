import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AccentColor } from '@/constants/theme';
import type { Tier } from '@/constants/subscription';
import type { AiProvider } from '@/types/ai';

export type ThemeMode = 'light' | 'dark' | 'system';

type SettingsState = {
  themeMode: ThemeMode;
  accentColor: AccentColor;
  tier: Tier;
  onboardingComplete: boolean;
  // Which provider's key to use — the key itself never lives in this
  // persisted store, only in SecureStore (see services/ai/apiKey.ts).
  aiProvider: AiProvider;
  // Per-provider model override, only meaningful (and only offered in the
  // UI) once a user has their own key for that provider — see
  // services/ai/client.ts's resolveKey, which never applies these when
  // falling back to the shared free-tier key, so that key's cost/behavior
  // stays fixed to DEFAULT_AI_MODEL regardless of any device's overrides.
  customModelByProvider: Partial<Record<AiProvider, string>>;
  // User's intent, not proof of OS permission — the actual scheduling in
  // services/notifications/notifications.ts also checks/requests permission.
  notificationsEnabled: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setTier: (tier: Tier) => void;
  completeOnboarding: () => void;
  setAiProvider: (provider: AiProvider) => void;
  setCustomModel: (provider: AiProvider, model: string) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeMode: 'system',
      accentColor: 'purple',
      tier: 'free',
      onboardingComplete: false,
      aiProvider: 'claude',
      customModelByProvider: {},
      notificationsEnabled: false,
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setTier: (tier) => set({ tier }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setCustomModel: (provider, model) =>
        set((s) => ({ customModelByProvider: { ...s.customModelByProvider, [provider]: model.trim() } })),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
