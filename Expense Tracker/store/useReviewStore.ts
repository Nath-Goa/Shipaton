import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ReviewState = {
  // Whether the in-app review prompt has ever been shown/dismissed — it
  // only ever asks once per install.
  hasPrompted: boolean;
  rating: number | null;
  feedback: string | null;
  submittedAt: number | null;
  submitReview: (rating: number, feedback: string) => void;
  dismissReview: () => void;
};

export const useReviewStore = create<ReviewState>()(
  persist(
    (set) => ({
      hasPrompted: false,
      rating: null,
      feedback: null,
      submittedAt: null,
      submitReview: (rating, feedback) =>
        set({ hasPrompted: true, rating, feedback: feedback.trim() || null, submittedAt: Date.now() }),
      dismissReview: () => set({ hasPrompted: true }),
    }),
    {
      name: 'review-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
