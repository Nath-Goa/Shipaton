import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AccentColor } from '@/constants/theme';
import type { FontOption, TextScale } from '@/constants/fonts';
import type { Tier } from '@/constants/subscription';
import type { AiProvider } from '@/types/ai';
import { clearStoredPin, type BiometricType } from '@/services/security/appLock';

export type ThemeMode = 'light' | 'dark' | 'system';
export type TutorPersona = 'coach' | 'professor' | 'casual';
export type StudyWindow = 'morning' | 'afternoon' | 'evening' | 'night';
export type LearnerLevel = 'beginner' | 'intermediate' | 'advanced';

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
  // Set when a personal key's last attempt failed with "invalid_key" —
  // services/ai/client.ts silently falls back to the shared key when this
  // happens rather than erroring out, and the UI shows a small, non-blocking
  // notice (not an alert/toast) rather than interrupting the user. Cleared
  // automatically the next time that provider's personal key succeeds.
  brokenKeyProviders: Partial<Record<AiProvider, boolean>>;
  // User's intent, not proof of OS permission — the actual scheduling in
  // services/notifications/notifications.ts also checks/requests permission.
  notificationsEnabled: boolean;
  // App lock: requires PIN or Face ID/Fingerprint
  appLockEnabled: boolean;
  biometricLockEnabled: boolean; // Kept in sync with appLockEnabled for backwards compatibility
  pinLength: 4 | 6;
  hasConfiguredPin: boolean;
  useBiometrics: boolean;
  biometricType: BiometricType;
  // Learning Environment (Settings) — typography.
  fontOption: FontOption;
  textScale: TextScale;
  // The Assistant chat's tone only — never threaded into the strict-JSON
  // quiz/pattern/narrative prompts. See services/ai/prompts.ts.
  tutorPersona: TutorPersona;
  // Smart study-time nudges (store/useUsageStore.ts + services/notifications).
  // Independent of tier/pushAlerts — a core engagement feature, not a perk.
  smartNudgesEnabled: boolean;
  preferredStudyWindow: StudyWindow | null;
  // Whether the price predictor may log its own calls on this device and
  // train on how they turn out (store/usePredictorStore.ts). Off means the
  // model still runs, but stays exactly as shipped — nothing is recorded and
  // nothing adapts. Opt-in is collected during onboarding.
  predictorDataCollection: boolean;
  arenaTutorialSeen: boolean;
  // Learn tab's first-visit "what's your level?" gate. selectedLevel is
  // stored for future personalization but currently has no effect — every
  // learner's course/quiz progress starts at Beginner regardless.
  levelSelected: boolean;
  selectedLevel: LearnerLevel | null;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setTier: (tier: Tier) => void;
  completeOnboarding: () => void;
  setAiProvider: (provider: AiProvider) => void;
  setCustomModel: (provider: AiProvider, model: string) => void;
  markKeyBroken: (provider: AiProvider) => void;
  clearKeyBroken: (provider: AiProvider) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAppLockEnabled: (enabled: boolean) => void;
  setBiometricLockEnabled: (enabled: boolean) => void;
  setPinConfig: (config: { pinLength: 4 | 6; hasConfiguredPin: boolean }) => void;
  setUseBiometrics: (use: boolean) => void;
  setBiometricType: (type: BiometricType) => void;
  disableAppLock: () => void;
  lockTrigger: number;
  lockAppNow: () => void;
  setFontOption: (font: FontOption) => void;
  setTextScale: (scale: TextScale) => void;
  setTutorPersona: (persona: TutorPersona) => void;
  setSmartNudgesEnabled: (enabled: boolean) => void;
  setPredictorDataCollection: (enabled: boolean) => void;
  setArenaTutorialSeen: () => void;
  setPreferredStudyWindow: (window: StudyWindow | null) => void;
  selectLevel: (level: LearnerLevel) => void;
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
      brokenKeyProviders: {},
      notificationsEnabled: false,
      appLockEnabled: false,
      biometricLockEnabled: false,
      pinLength: 4,
      hasConfiguredPin: false,
      useBiometrics: true,
      biometricType: 'none',
      fontOption: 'system',
      textScale: 1,
      tutorPersona: 'coach',
      smartNudgesEnabled: true,
      preferredStudyWindow: null,
      predictorDataCollection: true,
      arenaTutorialSeen: false,
      levelSelected: false,
      selectedLevel: null,
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setTier: (tier) => set({ tier }),
      completeOnboarding: () => set({ onboardingComplete: true }),
      setAiProvider: (aiProvider) => set({ aiProvider }),
      setCustomModel: (provider, model) =>
        set((s) => ({ customModelByProvider: { ...s.customModelByProvider, [provider]: model.trim() } })),
      markKeyBroken: (provider) => set((s) => ({ brokenKeyProviders: { ...s.brokenKeyProviders, [provider]: true } })),
      clearKeyBroken: (provider) =>
        set((s) => {
          if (!s.brokenKeyProviders[provider]) return s;
          const next = { ...s.brokenKeyProviders };
          delete next[provider];
          return { brokenKeyProviders: next };
        }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setAppLockEnabled: (appLockEnabled) =>
        set({ appLockEnabled, biometricLockEnabled: appLockEnabled }),
      setBiometricLockEnabled: (biometricLockEnabled) =>
        set({ biometricLockEnabled, appLockEnabled: biometricLockEnabled }),
      setPinConfig: ({ pinLength, hasConfiguredPin }) => set({ pinLength, hasConfiguredPin }),
      setUseBiometrics: (useBiometrics) => set({ useBiometrics }),
      setBiometricType: (biometricType) => set({ biometricType }),
      lockTrigger: 0,
      lockAppNow: () => set((s) => ({ lockTrigger: s.lockTrigger + 1 })),
      disableAppLock: () => {
        clearStoredPin();
        set({ appLockEnabled: false, biometricLockEnabled: false, hasConfiguredPin: false });
      },
      setFontOption: (fontOption) => set({ fontOption }),
      setTextScale: (textScale) => set({ textScale }),
      setTutorPersona: (tutorPersona) => set({ tutorPersona }),
      setSmartNudgesEnabled: (smartNudgesEnabled) => set({ smartNudgesEnabled }),
      setPredictorDataCollection: (predictorDataCollection) => set({ predictorDataCollection }),
      setArenaTutorialSeen: () => set({ arenaTutorialSeen: true }),
      setPreferredStudyWindow: (preferredStudyWindow) => set({ preferredStudyWindow }),
      // Every learner currently starts at Beginner regardless of the answer —
      // see the `selectedLevel` field doc comment above.
      selectLevel: (selectedLevel) => set({ selectedLevel, levelSelected: true }),
    }),
    {
      name: 'settings-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
