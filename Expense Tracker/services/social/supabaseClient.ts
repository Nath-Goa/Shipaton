import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Only applied on native: the web platform already has a real URL/
// URLSearchParams implementation, and forcing this polyfill's global patch
// on top of it broke the web preview outright (blank page, load failure)
// rather than degrading gracefully.
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto');
}

// The only place this app talks to Supabase directly — every social feature
// (auth, families, friends, duels) goes through this client or the stores
// built on it, never a raw createClient call elsewhere. AsyncStorage session
// persistence matches every other store in this app (persist +
// createJSONStorage(() => AsyncStorage)); the anon key below is safe to ship
// client-side by design (see .env.example) — Row Level Security policies on
// each table are the real access control.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export function isSupabaseConfigured(): boolean {
  return !!url && !!anonKey;
}

// A no-op-safe placeholder when unconfigured so importing this file never
// crashes an install with no Supabase project set up yet — every call site
// must check isSupabaseConfigured() first regardless.
//
// Expo Router's web output does an initial server-side render pass (plain
// Node, no `window`) before the browser ever loads the page. Supabase's
// client tries to read/write session storage the moment it's constructed —
// harmless in a real browser, but reaching into AsyncStorage's web backend
// with no `window` there crashed the whole dev/render process outright
// (not just a caught error). persistSession/autoRefreshToken are only
// enabled once `window` actually exists, i.e. never during that server pass.
const isServer = typeof window === 'undefined';

export const supabase: SupabaseClient = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: {
    storage: isServer ? undefined : AsyncStorage,
    autoRefreshToken: !isServer,
    persistSession: !isServer,
    detectSessionInUrl: false,
  },
});
