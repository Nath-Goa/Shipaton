import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ToastHost } from '@/components/ui/ToastHost';
import { TIER_FEATURES } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import { disableAllReminders, refreshStreakRiskReminder } from '@/services/notifications/notifications';
import { configurePurchases, fetchCurrentTier, subscribeTierChanges } from '@/services/purchases/revenuecat';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { todayStr } from '@/utils/date';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const setTier = useSettingsStore((s) => s.setTier);
  const tier = useSettingsStore((s) => s.tier);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const streakDays = useStreakStore((s) => s.streakDays);
  const lastActivityDate = useStreakStore((s) => s.lastActivityDate);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Re-evaluates on every app open and whenever the streak changes (a quiz
  // or challenge completed elsewhere in the app), so the same-day nudge
  // stays in sync without every screen that touches the streak needing to
  // know about notifications at all. Also the single place that walks back
  // a stale "enabled" flag if the user's tier no longer includes pushAlerts
  // (e.g. a subscription lapsed).
  useEffect(() => {
    if (!TIER_FEATURES[tier].pushAlerts) {
      if (notificationsEnabled) {
        setNotificationsEnabled(false);
        disableAllReminders();
      }
      return;
    }
    if (!notificationsEnabled) return;
    refreshStreakRiskReminder({ streakDays, activityDoneToday: lastActivityDate === todayStr() });
  }, [tier, notificationsEnabled, streakDays, lastActivityDate, setNotificationsEnabled]);

  // RevenueCat is the source of truth for entitlement state: configure once
  // at app start, adopt whatever tier the store already reports for this
  // customer, then keep it live-synced for the rest of the session (a
  // purchase, restore, renewal, or expiration all flow through this same
  // listener). A no-op on web or when no API key is configured yet — see
  // services/purchases/revenuecat.ts.
  useEffect(() => {
    if (!configurePurchases()) return;
    let alive = true;
    fetchCurrentTier().then((tier) => {
      if (alive && tier) setTier(tier);
    });
    const unsubscribe = subscribeTierChanges((tier) => setTier(tier));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [setTier]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootLayoutNav />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { scheme, colors } = useTheme();
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {onboardingComplete ? (
        <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <OnboardingScreen />
      )}
      <ToastHost />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
