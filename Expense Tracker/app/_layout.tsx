import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import { LimitOrderWatcher } from '@/components/markets/LimitOrderWatcher';
import { PriceAlertWatcher } from '@/components/markets/PriceAlertWatcher';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ReviewPromptModal } from '@/components/reviews/ReviewPromptModal';
import { AppLockGate } from '@/components/security/AppLockGate';
import { ToastHost } from '@/components/ui/ToastHost';
import { TIER_FEATURES } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import { disableAllReminders, refreshBillReminders, refreshStreakRiskReminder } from '@/services/notifications/notifications';
import { initSentry } from '@/services/monitoring/sentry';
import { configurePurchases, fetchCurrentTier, subscribeTierChanges } from '@/services/purchases/revenuecat';
import { computeUpcomingRecurring, useExpenseStore } from '@/store/useExpenseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useReviewStore } from '@/store/useReviewStore';
import { useSavingsGoalStore } from '@/store/useSavingsGoalStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { todayStr } from '@/utils/date';

// Real engagement signals only — never counted the moment onboarding
// finishes, since both are naturally still zero then.
const REVIEW_PROMPT_MIN_TRADES = 3;

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});
// As early as possible, before any component renders, so startup crashes
// are captured too — a no-op without EXPO_PUBLIC_SENTRY_DSN configured.
initSentry();

function RootLayout() {
  const setTier = useSettingsStore((s) => s.setTier);
  const tier = useSettingsStore((s) => s.tier);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const streakDays = useStreakStore((s) => s.streakDays);
  const lastActivityDate = useStreakStore((s) => s.lastActivityDate);
  const processDividends = usePortfolioStore((s) => s.processDividends);
  const processAutoInvests = usePortfolioStore((s) => s.processAutoInvests);
  const [portfolioHydrated, setPortfolioHydrated] = useState(usePortfolioStore.persist.hasHydrated());
  const processRecurringContributions = useSavingsGoalStore((s) => s.processRecurringContributions);
  const [savingsGoalHydrated, setSavingsGoalHydrated] = useState(useSavingsGoalStore.persist.hasHydrated());
  // Raw, referentially-stable store fields — computeUpcomingRecurring builds
  // the actual (fresh-array) result in a useMemo below, never inside a
  // selector itself (see LimitOrderWatcher for why that distinction matters).
  const expenses = useExpenseStore((s) => s.expenses);
  const seriesCursor = useExpenseStore((s) => s.seriesCursor);
  const upcomingRecurring = useMemo(() => computeUpcomingRecurring(expenses, seriesCursor), [expenses, seriesCursor]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // Waits for AsyncStorage rehydration before touching the portfolio store —
  // calling processDividends() before that would read (and could then get
  // silently overwritten by) the pre-rehydration default state.
  useEffect(() => {
    if (portfolioHydrated) return;
    return usePortfolioStore.persist.onFinishHydration(() => setPortfolioHydrated(true));
  }, [portfolioHydrated]);

  // Pays out any dividends due since last app open. Idempotent — safe to
  // run once per app open (see usePortfolioStore.processDividends).
  useEffect(() => {
    if (!portfolioHydrated) return;
    processDividends();
  }, [portfolioHydrated, processDividends]);

  // Fills any auto-invest contributions due since last app open. Same
  // hydration guard as processDividends above, and just as idempotent.
  useEffect(() => {
    if (!portfolioHydrated) return;
    processAutoInvests();
  }, [portfolioHydrated, processAutoInvests]);

  useEffect(() => {
    if (savingsGoalHydrated) return;
    return useSavingsGoalStore.persist.onFinishHydration(() => setSavingsGoalHydrated(true));
  }, [savingsGoalHydrated]);

  // Fills any recurring goal contributions due since last app open. Same
  // hydration guard and idempotency as processAutoInvests above.
  useEffect(() => {
    if (!savingsGoalHydrated) return;
    processRecurringContributions();
  }, [savingsGoalHydrated, processRecurringContributions]);

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
    refreshBillReminders(upcomingRecurring);
  }, [tier, notificationsEnabled, streakDays, lastActivityDate, upcomingRecurring, setNotificationsEnabled]);

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

export default Sentry.wrap(RootLayout);

function RootLayoutNav() {
  const { scheme, colors } = useTheme();
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const badgeCount = useStreakStore((s) => s.badges.length);
  const tradeCount = usePortfolioStore((s) =>
    Object.values(s.portfolios).reduce((total, p) => total + p.trades.length, 0)
  );
  const hasPrompted = useReviewStore((s) => s.hasPrompted);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  // hasPrompted starts false until AsyncStorage finishes rehydrating it, so
  // gating on this too (not just hasPrompted) stops a returning user who
  // already reviewed from briefly re-qualifying before their prior answer
  // has loaded back in.
  const [reviewStoreHydrated, setReviewStoreHydrated] = useState(useReviewStore.persist.hasHydrated());

  useEffect(() => {
    if (reviewStoreHydrated) return;
    return useReviewStore.persist.onFinishHydration(() => setReviewStoreHydrated(true));
  }, [reviewStoreHydrated]);

  // Ask once, only after the person has actually done something — a badge
  // earned (Learn/Markets) or a few trades (Portfolio) — rather than
  // nagging on first open.
  useEffect(() => {
    if (!onboardingComplete || !reviewStoreHydrated || hasPrompted) return;
    if (badgeCount >= 1 || tradeCount >= REVIEW_PROMPT_MIN_TRADES) setReviewModalVisible(true);
  }, [onboardingComplete, reviewStoreHydrated, hasPrompted, badgeCount, tradeCount]);

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {onboardingComplete ? (
        <AppLockGate>
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
          </Stack>
        </AppLockGate>
      ) : (
        <OnboardingScreen />
      )}
      {onboardingComplete ? (
        <>
          <PriceAlertWatcher />
          <LimitOrderWatcher />
        </>
      ) : null}
      <ToastHost />
      <ReviewPromptModal visible={reviewModalVisible} onClose={() => setReviewModalVisible(false)} />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
