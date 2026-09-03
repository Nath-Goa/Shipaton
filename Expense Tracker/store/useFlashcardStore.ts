import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { FlashcardHistoryEntry } from '@/types/flashcard';

// A generous cap so a topic's saved history (mirrors the chat "threads"
// pattern in useChatStore) can't grow unbounded on a device used for years.
const MAX_HISTORY_PER_TOPIC = 200;

type FlashcardState = {
  // Indices into constants/flashcardBank.ts's per-topic card array that
  // this device has already been shown — once every index for a topic is
  // seen, the flashcards screen falls back to AI generation for that topic.
  seenBankIndices: Record<string, number[]>;
  // Saved reviewed cards per topic, newest last — the same shape as
  // useChatStore's `threads`, so a "Flashcard history" view works the same
  // way the Assistant's chat history does.
  history: Record<string, FlashcardHistoryEntry[]>;
  markBankSeen: (topic: string, index: number) => void;
  addHistoryEntry: (topic: string, entry: FlashcardHistoryEntry) => void;
  clearHistory: (topic: string) => void;
};

export const useFlashcardStore = create<FlashcardState>()(
  persist(
    (set) => ({
      seenBankIndices: {},
      history: {},

      markBankSeen: (topic, index) => {
        set((state) => {
          const seen = state.seenBankIndices[topic] ?? [];
          if (seen.includes(index)) return state;
          return { seenBankIndices: { ...state.seenBankIndices, [topic]: [...seen, index] } };
        });
      },

      addHistoryEntry: (topic, entry) => {
        set((state) => {
          const prior = state.history[topic] ?? [];
          const next = [...prior, entry].slice(-MAX_HISTORY_PER_TOPIC);
          return { history: { ...state.history, [topic]: next } };
        });
      },

      clearHistory: (topic) => {
        set((state) => {
          const next = { ...state.history };
          delete next[topic];
          return { history: next };
        });
      },
    }),
    {
      name: 'flashcard-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
