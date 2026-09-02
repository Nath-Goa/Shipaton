import * as Sentry from '@sentry/react-native';

// Crash/error reporting only — no performance tracing or session replay, to
// keep this scoped to what was asked for and avoid extra native surface.
// Requires your own free Sentry account + DSN (Settings > Projects > Client
// Keys in the Sentry dashboard) — see .env.example. Without one this is a
// no-op, so the app behaves exactly as before if you skip it.
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
  });
}

export function isSentryConfigured(): boolean {
  return !!DSN;
}
