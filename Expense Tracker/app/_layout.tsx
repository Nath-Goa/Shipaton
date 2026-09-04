import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import { LimitOrderWatcher } from '@/components/markets/LimitOrderWatcher';
import { PriceAlertWatcher } from '@/components/markets/PriceAlertWatcher';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ReviewPromptModal } from '@/components/reviews/ReviewPromptModal';
import { AppLockGate } from '@/components/security/AppLockGate';
import { ToastHost } from '@/components/ui/ToastHost';
import { TIER_FEATURES } from '@/constants/subscription';
import { CUSTOM_FONTS_TO_LOAD } from '@/constants/fonts';
import { useTheme } from '@/hooks/useTheme';
import { disableAllReminders, refreshBillReminders, refreshStreakRiskReminder } from '@/services/notifications/notifications';
import { refreshStudyNudge, STUDY_NUDGE_ID } from '@/services/notifications/studyNudge';
import { initSentry } from '@/services/monitoring/sentry';
import { configurePurchases, fetchCurrentTier, subscribeTierChanges } from '@/services/purchases/revenuecat';
import { computeUpcomingRecurring, useExpenseStore } from '@/store/useExpenseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useReviewStore } from '@/store/useReviewStore';
import { useSavingsGoalStore } from '@/store/useSavingsGoalStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useUsageStore } from '@/store/useUsageStore';
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
  const [fontsLoaded, fontsError] = useFonts(CUSTOM_FONTS_TO_LOAD);
  const setTier = useSettingsStore((s) => s.setTier);
  const tier = useSettingsStore((s) => s.tier);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const smartNudgesEnabled = useSettingsStore((s) => s.smartNudgesEnabled);
  const preferredStudyWindow = useSettingsStore((s) => s.preferredStudyWindow);
  const recordAppOpen = useUsageStore((s) => s.recordAppOpen);
  const getSuggestedHour = useUsageStore((s) => s.getSuggestedHour);
  const streakDays = useStreakStore((s) => s.streakDays);
  const lastActivityDate = useStreakStore((s) => s.lastActivityDate);
  const processDividends = usePortfolioStore((s) => s.processDividends);
  const processAutoInvests = usePortfolioStore((s) => s.processAutoInvests);
  const [portfolioHydrated, setPortfolioHydrated] = useState(usePortfolioStore.persist.hasHydrated());
  const processRecurringContributions = useSavingsGoalStore((s) => s.processRecurringContributions);
  const [savingsGoalHydrated, setSavingsGoalHydrated] = useState(useSavingsGoalStore.persist.hasHydrated());
  const [settingsHydrated, setSettingsHydrated] = useState(useSettingsStore.persist.hasHydrated());

  useEffect(() => {
    if (settingsHydrated) return;
    return useSettingsStore.persist.onFinishHydration(() => setSettingsHydrated(true));
  }, [settingsHydrated]);

  // Raw, referentially-stable store fields — computeUpcomingRecurring builds
  // the actual (fresh-array) result in a useMemo below, never inside a
  // selector itself (see LimitOrderWatcher for why that distinction matters).
  const expenses = useExpenseStore((s) => s.expenses);
  const seriesCursor = useExpenseStore((s) => s.seriesCursor);
  const upcomingRecurring = useMemo(() => computeUpcomingRecurring(expenses, seriesCursor), [expenses, seriesCursor]);

  useEffect(() => {
    if ((!fontsLoaded && !fontsError) || !settingsHydrated) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontsError, settingsHydrated]);

  // Once per app open — builds store/useUsageStore's hour-of-day histogram
  // that the smart study-nudge suggestion (below) is derived from.
  useEffect(() => {
    recordAppOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tapping the study-nudge notification deep-links straight into a bite-
  // sized focus session rather than just foregrounding the app.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.identifier === STUDY_NUDGE_ID) {
        router.push('/learn/focus-session');
      }
    });
    return () => subscription.remove();
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
    if (!notificationsEnabled) return;
    refreshStreakRiskReminder({ streakDays, activityDoneToday: lastActivityDate === todayStr() });
    refreshBillReminders(upcomingRecurring);
  }, [notificationsEnabled, streakDays, lastActivityDate, upcomingRecurring]);

  // Smart study-time nudge: independent of the pushAlerts tier gate above
  // (it's a core engagement feature, not a paid perk) and of the OS
  // permission toggle used by the other reminders — its own on/off switch
  // lives in Settings › Learning Environment. Re-evaluated once per app
  // open against whatever the usage histogram currently suggests.
  useEffect(() => {
    if (!smartNudgesEnabled) return;
    refreshStudyNudge({ suggestedHour: getSuggestedHour(preferredStudyWindow), enabled: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smartNudgesEnabled, preferredStudyWindow]);

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
        <RootLayoutNav ready={settingsHydrated} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

function RootLayoutNav({ ready }: { ready: boolean }) {
  const { scheme, colors } = useTheme();
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const badgeCount = useStreakStore((s) => s.badges.length);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const tradeCount = useMemo(
    () => Object.values(portfolios).reduce((total, p) => total + p.trades.length, 0),
    [portfolios]
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
    if (!ready || !onboardingComplete || !reviewStoreHydrated || hasPrompted) return;
    if (badgeCount >= 1 || tradeCount >= REVIEW_PROMPT_MIN_TRADES) setReviewModalVisible(true);
  }, [ready, onboardingComplete, reviewStoreHydrated, hasPrompted, badgeCount, tradeCount]);

  if (!ready) {
    return (
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    );
  }

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
