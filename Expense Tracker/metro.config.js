const { getSentryExpoConfig } = require('@sentry/react-native/metro');

// Sentry's Metro config wraps Expo's default config to add source maps and
// auto-wrap expo-router's ErrorBoundary — see services/monitoring/sentry.ts
// for the runtime side. Safe with no Sentry account configured: it just
// prepares the bundle for it.
module.exports = getSentryExpoConfig(__dirname, {
  autoWrapExpoRouterErrorBoundary: true,
});
