import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabase } from '@/services/social/supabaseClient';

// Session state only — Supabase's own client (services/social/supabaseClient.ts)
// already persists the session to AsyncStorage and handles token refresh, so
// this store is NOT itself `persist`-backed like the rest of the app; it just
// mirrors whatever Supabase's auth listener reports, kept as a single source
// of truth for the rest of the app to read (e.g. app/_layout.tsx's auth gate).

type AuthResult = { ok: true } | { ok: false; message: string };

type AuthState = {
  session: Session | null;
  initializing: boolean;
  init: () => void;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return 'Something went wrong. Please try again.';
}

let listenerStarted = false;

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  initializing: true,

  init: () => {
    if (!isSupabaseConfigured()) {
      set({ initializing: false });
      return;
    }
    supabase.auth.getSession().then(({ data }) => set({ session: data.session, initializing: false }));
    if (!listenerStarted) {
      listenerStarted = true;
      supabase.auth.onAuthStateChange((_event, session) => set({ session }));
    }
  },

  // "Confirm email" is turned OFF in the Supabase dashboard (Authentication >
  // Providers > Email) for this project, so signUp logs the user in
  // immediately — no verification email, no SMTP setup needed. If that
  // toggle is ever turned back on, this call still succeeds but the
  // resulting session will be null until the user clicks a confirmation
  // link Supabase emails via its default template.
  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, message: errorMessage(error) };
    return { ok: true };
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: errorMessage(error) };
    return { ok: true };
  },

  signOut: async () => {
    await supabase.auth.signOut();
  },
}));
