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
  verifyEmailCode: (email: string, code: string) => Promise<AuthResult>;
  resendCode: (email: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
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

  // signUp sends Supabase's own confirmation email. The project's Auth
  // template must be switched from the default magic-link to the OTP/code
  // template (Supabase dashboard > Authentication > Email Templates) for
  // that email to contain a 6-digit code instead of a link — a dashboard
  // setting, not something this client controls.
  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) return { ok: false, message: errorMessage(error) };
    return { ok: true };
  },

  verifyEmailCode: async (email, code) => {
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) return { ok: false, message: errorMessage(error) };
    return { ok: true };
  },

  resendCode: async (email) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
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

  // Emails a reset link (Supabase's password-recovery flow is link-based,
  // not code-based, even with the OTP signup template enabled) that deep-
  // links back into the app via mockstocktrainer:// (app.json's existing
  // scheme) to app/auth/reset-password.tsx.
  requestPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'mockstocktrainer://auth/reset-password',
    });
    if (error) return { ok: false, message: errorMessage(error) };
    return { ok: true };
  },
}));
