import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ageBandFor, permissionsFor } from '@/constants/ageCompliance';
import { useSettingsStore } from '@/store/useSettingsStore';

// The declared date of birth never leaves the device. It is not sent to
// Supabase, to an AI provider, to Sentry, or to RevenueCat — it exists only
// so constants/ageCompliance.ts can decide which rules apply. That is what
// makes asking for it safe under COPPA even from an under-13: an age screen
// that stores nothing remotely is not collection.
//
// There is deliberately no "change my date of birth" action. The FTC's
// guidance on neutral age screens is that a user rejected by one must not be
// able to walk straight back and try a more convenient answer, so the only
// way out of a wrong entry is reinstalling the app — the age gate screen
// says so plainly rather than leaving someone stuck with no explanation.
type AgeState = {
  /** YYYY-MM-DD. Null until the age gate has been answered. */
  birthDate: string | null;
  verifiedAt: number | null;
  /**
   * Minors only. Null means "not asked yet" and is what the age gate's
   * consent step keys off — distinct from false, which is a real refusal
   * that must be honoured rather than re-prompted.
   */
  aiDataConsent: boolean | null;
  /**
   * TEMPORARY, hackathon judging only — see constants/judgeMode.ts. Null
   * means the "Are you a judge?" prompt hasn't been answered yet; true
   * treats the account as 18+ and makes subscriptions free. Setting it back
   * to false is what Settings' "Exit judge mode" does, which drops straight
   * into the real age gate since birthDate is still null.
   */
  judgeMode: boolean | null;
  setBirthDate: (birthDate: string) => void;
  setAiDataConsent: (granted: boolean) => void;
  setJudgeMode: (isJudge: boolean) => void;
};

export const useAgeStore = create<AgeState>()(
  persist(
    (set) => ({
      birthDate: null,
      verifiedAt: null,
      aiDataConsent: null,
      judgeMode: null,
      setBirthDate: (birthDate) => {
        set({ birthDate, verifiedAt: Date.now() });
        // Privacy by default: on-device behavioural training starts off for a
        // minor rather than being forced off forever — it stays switchable in
        // Settings, it just never begins switched on. Applied once here at
        // gate time rather than checked at every read, so that turning it on
        // later actually sticks. Cross-store getState() call is the
        // established pattern in this codebase (CLAUDE.md §5.2).
        if (!permissionsFor(ageBandFor(birthDate)).behavioralLearning) {
          useSettingsStore.getState().setPredictorDataCollection(false);
        }
      },
      setAiDataConsent: (aiDataConsent) => set({ aiDataConsent }),
      setJudgeMode: (judgeMode) => set({ judgeMode }),
    }),
    {
      name: 'age-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
