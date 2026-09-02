import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ToastHost } from '@/components/ui/ToastHost';
import { useTheme } from '@/hooks/useTheme';
import { configurePurchases, fetchCurrentTier, subscribeTierChanges } from '@/services/purchases/revenuecat';
import { useSettingsStore } from '@/store/useSettingsStore';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const setTier = useSettingsStore((s) => s.setTier);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

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
