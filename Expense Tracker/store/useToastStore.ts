import { create } from 'zustand';

type ToastState = {
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void }) => void;
  hide: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  actionLabel: undefined,
  onAction: undefined,
  show: (message, opts) => set({ message, actionLabel: opts?.actionLabel, onAction: opts?.onAction }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined }),
}));
