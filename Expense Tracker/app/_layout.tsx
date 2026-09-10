import * as Sentry from '@sentry/react-native';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

import { LimitOrderWatcher } from '@/components/markets/LimitOrderWatcher';
import { PriceAlertWatcher } from '@/components/markets/PriceAlertWatcher';
import { AgeGateScreen } from '@/components/onboarding/AgeGateScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { ReviewPromptModal } from '@/components/reviews/ReviewPromptModal';
import { AppLockGate } from '@/components/security/AppLockGate';
import { ToastHost } from '@/components/ui/ToastHost';
import { NetworkStatusBanner } from '@/components/ui/NetworkStatusBanner';
import { TIER_FEATURES, type Tier } from '@/constants/subscription';
import { CUSTOM_FONTS_TO_LOAD } from '@/constants/fonts';
import { useAgeGateStage, useAgePermissions, useIsJudgeMode } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import {
  cancelStreakRiskReminder,
  disableAllReminders,
  refreshBillReminders,
  refreshStreakRiskReminder,
} from '@/services/notifications/notifications';
import { refreshStudyNudge, STUDY_NUDGE_ID } from '@/services/notifications/studyNudge';
import { runStartupScan } from '@/services/predictor/startupScan';
import { cleanupProductPhotoCache, cleanupUnreferencedReceiptFiles } from '@/services/images/storedImageFiles';
import { initSentry } from '@/services/monitoring/sentry';
import {
  configurePurchases,
  fetchCurrentTier,
  identifyAsJudge,
  subscribeTierChanges,
} from '@/services/purchases/revenuecat';
import { useAgeStore } from '@/store/useAgeStore';
import { computeUpcomingRecurring, useExpenseStore } from '@/store/useExpenseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { usePredictorStore } from '@/store/usePredictorStore';
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
  const learningRewardExpiresAt = useSettingsStore((s) => s.learningRewardExpiresAt);
  const refreshLearningReward = useSettingsStore((s) => s.refreshLearningReward);
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
  // Gates rendering alongside settings: without it, birthDate reads null for
  // the first frame and an already-verified user is flashed the age gate.
  const [ageHydrated, setAgeHydrated] = useState(useAgeStore.persist.hasHydrated());
  const agePermissions = useAgePermissions();
  const isJudge = useIsJudgeMode();

  useEffect(() => {
    if (settingsHydrated) return;
    return useSettingsStore.persist.onFinishHydration(() => setSettingsHydrated(true));
  }, [settingsHydrated]);

  useEffect(() => {
    if (ageHydrated) return;
    return useAgeStore.persist.onFinishHydration(() => setAgeHydrated(true));
  }, [ageHydrated]);

  useEffect(() => {
    if (!settingsHydrated) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function refreshAndSchedule() {
      if (cancelled) return;
      refreshLearningReward();
      const expiresAt = useSettingsStore.getState().learningRewardExpiresAt;
      if (!expiresAt) return;
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        refreshLearningReward();
        return;
      }
      // Long rewards can exceed the platform's safe timeout range. Recheck
      // every six hours, then schedule close to the deadline when it nears.
      timer = setTimeout(refreshAndSchedule, Math.min(remaining + 250, 6 * 60 * 60 * 1_000));
    }

    refreshAndSchedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [settingsHydrated, learningRewardExpiresAt, refreshLearningReward]);

  // Raw, referentially-stable store fields — computeUpcomingRecurring builds
  // the actual (fresh-array) result in a useMemo below, never inside a
  // selector itself (see LimitOrderWatcher for why that distinction matters).
  const expenses = useExpenseStore((s) => s.expenses);
  const seriesCursor = useExpenseStore((s) => s.seriesCursor);
  const [expenseHydrated, setExpenseHydrated] = useState(useExpenseStore.persist.hasHydrated());
  const cleanedReceiptFiles = useRef(false);
  const upcomingRecurring = useMemo(() => computeUpcomingRecurring(expenses, seriesCursor), [expenses, seriesCursor]);

  useEffect(() => {
    if (expenseHydrated) return;
    return useExpenseStore.persist.onFinishHydration(() => setExpenseHydrated(true));
  }, [expenseHydrated]);

  useEffect(() => {
    if (!expenseHydrated || cleanedReceiptFiles.current) return;
    cleanedReceiptFiles.current = true;
    cleanupUnreferencedReceiptFiles(new Set(expenses.flatMap((expense) => expense.photoUri ? [expense.photoUri] : [])));
  }, [expenseHydrated, expenses]);

  useEffect(() => {
    if ((!fontsLoaded && !fontsError) || !settingsHydrated || !ageHydrated) return;
    SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontsError, settingsHydrated, ageHydrated]);

  // Once per app open — builds store/useUsageStore's hour-of-day histogram
  // that the smart study-nudge suggestion (below) is derived from.
  useEffect(() => {
    recordAppOpen();
  }, [recordAppOpen]);

  useEffect(() => {
    cleanupProductPhotoCache();
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
  //
  // Split by age band, not just by the toggle: a minor gets bill reminders
  // (a reminder they set up themselves) but never the streak nudge, whose
  // whole job is to pull them back into the app. Both calls cancel before
  // they schedule, so a user who was an adult on a previous version and has
  // since declared a minor date of birth has the streak nudge actively
  // cleared here rather than left scheduled forever.
  useEffect(() => {
    if (!notificationsEnabled) return;
    if (agePermissions.engagementNudges) {
      refreshStreakRiskReminder({ streakDays, activityDoneToday: lastActivityDate === todayStr() });
    } else {
      cancelStreakRiskReminder();
    }
    refreshBillReminders(agePermissions.utilityReminders ? upcomingRecurring : []);
  }, [notificationsEnabled, streakDays, lastActivityDate, upcomingRecurring, agePermissions]);

  // Smart study-time nudge: independent of the pushAlerts tier gate above
  // (it's a core engagement feature, not a paid perk) and of the OS
  // permission toggle used by the other reminders — its own on/off switch
  // lives in Settings › Learning Environment. Re-evaluated once per app
  // open against whatever the usage histogram currently suggests.
  // Passed through as `enabled` rather than early-returning, so that turning
  // it off actively cancels a nudge scheduled by an earlier version — see
  // refreshStudyNudge, which cancels before it checks the flag.
  useEffect(() => {
    refreshStudyNudge({
      suggestedHour: getSuggestedHour(preferredStudyWindow),
      enabled: smartNudgesEnabled && agePermissions.engagementNudges,
    });
  }, [smartNudgesEnabled, preferredStudyWindow, getSuggestedHour, agePermissions]);

  // RevenueCat is the source of truth for entitlement state: configure once
  // at app start, adopt whatever tier the store already reports for this
  // customer, then keep it live-synced for the rest of the session (a
  // purchase, restore, renewal, or expiration all flow through this same
  // listener). A no-op on web or when no API key is configured yet — see
  // services/purchases/revenuecat.ts.
  //
  // TEMPORARY judge handling (constants/judgeMode.ts): a judge device first
  // identifies as the shared judge customer, so a promotional entitlement
  // granted once in the RevenueCat dashboard arrives here as a real
  // entitlement and flows through this same listener like any subscription.
  // A 'free' report is ignored for judges specifically — that is what
  // RevenueCat says when no grant exists yet, and acting on it would undo
  // the paywall-dismiss unlock and silently re-lock the app next launch.
  useEffect(() => {
    if (!configurePurchases()) return;
    let alive = true;

    function applyTier(next: Tier) {
      if (isJudge && next === 'free') return;
      setTier(next);
    }

    (async () => {
      if (isJudge) await identifyAsJudge();
      const current = await fetchCurrentTier();
      if (alive && current) applyTier(current);
    })();

    const unsubscribe = subscribeTierChanges(applyTier);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [setTier, isJudge]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootLayoutNav ready={settingsHydrated && ageHydrated} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

function RootLayoutNav({ ready }: { ready: boolean }) {
  const { scheme, colors } = useTheme();
  const onboardingComplete = useSettingsStore((s) => s.onboardingComplete);
  const ageGateStage = useAgeGateStage();
  // Nothing behind the gate runs until it is answered — including for an
  // existing install upgrading into this version, whose onboardingComplete
  // is already true.
  const pastAgeGate = ageGateStage === 'complete';
  const badgeCount = useStreakStore((s) => s.badges.length);
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const tradeCount = useMemo(
    () => Object.values(portfolios).reduce((total, p) => total + p.trades.length, 0),
    [portfolios]
  );
  const hasPrompted = useReviewStore((s) => s.hasPrompted);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [predictorHydrated, setPredictorHydrated] = useState(usePredictorStore.persist.hasHydrated());
  // hasPrompted starts false until AsyncStorage finishes rehydrating it, so
  // gating on this too (not just hasPrompted) stops a returning user who
  // already reviewed from briefly re-qualifying before their prior answer
  // has loaded back in.
  const [reviewStoreHydrated, setReviewStoreHydrated] = useState(useReviewStore.persist.hasHydrated());

  useEffect(() => {
    if (reviewStoreHydrated) return;
    return useReviewStore.persist.onFinishHydration(() => setReviewStoreHydrated(true));
  }, [reviewStoreHydrated]);

  useEffect(() => {
    if (predictorHydrated) return;
    return usePredictorStore.persist.onFinishHydration(() => setPredictorHydrated(true));
  }, [predictorHydrated]);

  // Predictor upkeep, once per app open: resolve any prediction whose
  // 20-session horizon has elapsed (each resolved outcome trains the model
  // one step), then scan headlines and log fresh predictions for the symbols
  // this user follows. Fire-and-forget and non-blocking — every failure
  // inside degrades to "no news", never to a broken start. Held until
  // onboarding is done so a first-run user isn't fetching news mid-setup.
  useEffect(() => {
    if (!ready || !pastAgeGate || !onboardingComplete || !predictorHydrated) return;
    runStartupScan().catch(() => undefined);
  }, [ready, pastAgeGate, onboardingComplete, predictorHydrated]);

  // Ask once, only after the person has actually done something — a badge
  // earned (Learn/Markets) or a few trades (Portfolio) — rather than
  // nagging on first open.
  useEffect(() => {
    if (!ready || !pastAgeGate || !onboardingComplete || !reviewStoreHydrated || hasPrompted) return;
    if (badgeCount >= 1 || tradeCount >= REVIEW_PROMPT_MIN_TRADES) setReviewModalVisible(true);
  }, [ready, pastAgeGate, onboardingComplete, reviewStoreHydrated, hasPrompted, badgeCount, tradeCount]);

  if (!ready) {
    return (
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {!pastAgeGate ? (
        <AgeGateScreen />
      ) : onboardingComplete ? (
        <AppLockGate>
          <Stack screenOptions={{ contentStyle: { backgroundColor: colors.bg }, gestureEnabled: true, fullScreenGestureEnabled: true, animation: 'slide_from_right' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ headerShown: false }} />
            <Stack.Screen name="game" options={{ headerShown: false }} />
            <Stack.Screen name="toolkit" options={{ presentation: 'modal', title: 'Investor Toolkit' }} />
            <Stack.Screen name="search" options={{ presentation: 'modal', title: 'Quick Search' }} />
            <Stack.Screen name="scanner" options={{ presentation: 'modal', title: 'Scan a product' }} />
            {/* fullScreenModal + headerShown:false — this deck draws its own
                progress bar and close button (app/recap.tsx), so it needs
                zero native chrome to render underneath. */}
            <Stack.Screen name="recap" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          </Stack>
        </AppLockGate>
      ) : (
        <OnboardingScreen />
      )}
      {pastAgeGate && onboardingComplete ? (
        <>
          <PriceAlertWatcher />
          <LimitOrderWatcher />
        </>
      ) : null}
      <ToastHost />
      <NetworkStatusBanner />
      <ReviewPromptModal visible={reviewModalVisible} onClose={() => setReviewModalVisible(false)} />
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}
