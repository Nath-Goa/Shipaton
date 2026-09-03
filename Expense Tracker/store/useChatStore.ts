import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ChatMessage, ThreadKey } from '@/types/chat';

// Daily AI usage/quota tracking lives in store/useAiUsageStore.ts, shared
// across every AI feature — this store just holds the chat threads
// themselves.
type ChatState = {
  threads: Record<ThreadKey, ChatMessage[]>;
  getThread: (key: ThreadKey) => ChatMessage[];
  addMessage: (key: ThreadKey, message: ChatMessage) => void;
  clearThread: (key: ThreadKey) => void;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: {},
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
    }),
    {
      name: 'chat-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
