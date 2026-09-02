import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatMessage, ThreadKey } from '@/types/chat';
import { todayStr } from '@/utils/date';

type ChatState = {
  threads: Record<ThreadKey, ChatMessage[]>;
  dailyUsage: { date: string; count: number };
  getThread: (key: ThreadKey) => ChatMessage[];
  addMessage: (key: ThreadKey, message: ChatMessage) => void;
  clearThread: (key: ThreadKey) => void;
  remainingToday: (limit: number | null) => number | null;
  recordUsage: () => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: {},
      dailyUsage: { date: todayStr(), count: 0 },
      getThread: (key) => get().threads[key] ?? [],
      addMessage: (key, message) => {
        set((state) => ({
          threads: { ...state.threads, [key]: [...(state.threads[key] ?? []), message] },
        }));
      },
      clearThread: (key) => {
        set((state) => {
          const next = { ...state.threads };
          delete next[key];
          return { threads: next };
        });
      },
      remainingToday: (limit) => {
        if (limit === null) return null;
        const usage = get().dailyUsage;
        const count = usage.date === todayStr() ? usage.count : 0;
        return Math.max(0, limit - count);
      },
      recordUsage: () => {
        set((state) => {
          const isToday = state.dailyUsage.date === todayStr();
          return { dailyUsage: { date: todayStr(), count: (isToday ? state.dailyUsage.count : 0) + 1 } };
        });
      },
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
