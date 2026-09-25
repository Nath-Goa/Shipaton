import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { PinSetupModal } from '@/components/security/PinSetupModal';
import { AccentColorPicker } from '@/components/settings/AccentColorPicker';
import { ApiKeySection } from '@/components/settings/ApiKeySection';
import { FontPicker } from '@/components/settings/FontPicker';
import { MarketDataStatusCard } from '@/components/settings/MarketDataStatusCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { TEEN_RESTRICTIONS } from '@/constants/ageCompliance';
import { BADGE_INFO } from '@/constants/badges';
import { TEXT_SCALE_OPTIONS, type TextScale } from '@/constants/fonts';
import { JUDGE_MODE_ENABLED } from '@/constants/judgeMode';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURE_COPY, TIER_FEATURES, TIER_LABELS, type Tier } from '@/constants/subscription';
import { trackingFor } from '@/constants/typography';
import { useAgePermissions, useIsJudgeMode } from '@/hooks/useAgePermissions';
import { useTheme } from '@/hooks/useTheme';
import {
  disableAllReminders,
  requestNotificationPermission,
  scheduleDailyReminder,
  sendTestNotification,
} from '@/services/notifications/notifications';
import { refreshStudyNudge } from '@/services/notifications/studyNudge';
import {
  getBiometricCapabilities,
  type BiometricCapabilities,
} from '@/services/security/appLock';
import { showPlanChangeScreen } from '@/services/purchases/planChangeScreens';
import { fetchSubscriptionSince, isPurchasesConfigured } from '@/services/purchases/revenuecat';
import { useAgeStore } from '@/store/useAgeStore';
import { useExpenseStore } from '@/store/useExpenseStore';
import { useMistakeJournalStore } from '@/store/useMistakeJournalStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useChatStore } from '@/store/useChatStore';
import { useQuizStore } from '@/store/useQuizStore';
import { useCourseStore } from '@/store/useCourseStore';
import { useUsageStore } from '@/store/useUsageStore';
import {
  useSettingsStore,
  type StudyWindow,
  type ThemeMode,
  type TutorPersona,
} from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';

// Cycles the local tier switcher one step per successful developer login,
// matching the free → pro → max → free order the founders described.
const DEV_TIER_CYCLE: Record<Tier, Tier> = { free: 'pro', pro: 'max', max: 'free' };

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const PERSONA_OPTIONS: { value: TutorPersona; label: string }[] = [
  { value: 'coach', label: 'Coach' },
  { value: 'professor', label: 'Professor' },
  { value: 'casual', label: 'Casual' },
];

const STUDY_WINDOW_OPTIONS: { value: StudyWindow; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'night', label: 'Night' },
];

const TEXT_SCALE_SEGMENT_OPTIONS = TEXT_SCALE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));

export default function SettingsScreen() {
  const { colors } = useTheme();
  const agePermissions = useAgePermissions();
  const {
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    tier,
    setTier,
    notificationsEnabled,
    setNotificationsEnabled,
    fontOption,
    setFontOption,
    textScale,
    setTextScale,
    tutorPersona,
    setTutorPersona,
    smartNudgesEnabled,
    setSmartNudgesEnabled,
    preferredStudyWindow,
    setPreferredStudyWindow,
  } = useSettingsStore(
    useShallow((s) => ({
      themeMode: s.themeMode, setThemeMode: s.setThemeMode,
      accentColor: s.accentColor, setAccentColor: s.setAccentColor,
      tier: s.tier, setTier: s.setTier,
      notificationsEnabled: s.notificationsEnabled, setNotificationsEnabled: s.setNotificationsEnabled,
      fontOption: s.fontOption, setFontOption: s.setFontOption,
      textScale: s.textScale, setTextScale: s.setTextScale,
      tutorPersona: s.tutorPersona, setTutorPersona: s.setTutorPersona,
      smartNudgesEnabled: s.smartNudgesEnabled, setSmartNudgesEnabled: s.setSmartNudgesEnabled,
      preferredStudyWindow: s.preferredStudyWindow, setPreferredStudyWindow: s.setPreferredStudyWindow,
    }))
  );

  const appLockEnabled = useSettingsStore((s) => s.appLockEnabled || s.biometricLockEnabled);
  const pinLength = useSettingsStore((s) => s.pinLength);
  const hasConfiguredPin = useSettingsStore((s) => s.hasConfiguredPin);
  const useBiometrics = useSettingsStore((s) => s.useBiometrics);
  const setUseBiometrics = useSettingsStore((s) => s.setUseBiometrics);
  const setAppLockEnabled = useSettingsStore((s) => s.setAppLockEnabled);
  const disableAppLock = useSettingsStore((s) => s.disableAppLock);
  const lockAppNow = useSettingsStore((s) => s.lockAppNow);

  const resetAllPortfolios = usePortfolioStore((s) => s.resetAllPortfolios);
  const badgeCount = useStreakStore((s) => s.badges.length);
  const isJudge = useIsJudgeMode();
  const grantJudgeAccess = useAgeStore((s) => s.grantJudgeAccess);
  const clearJudgeAccess = useAgeStore((s) => s.clearJudgeAccess);
  const getSuggestedHour = useUsageStore((s) => s.getSuggestedHour);
  const showToast = useToastStore((s) => s.show);
  const features = TIER_FEATURES[tier];

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [biometricCaps, setBiometricCaps] = useState<BiometricCapabilities | null>(null);
  const [testingNotif, setTestingNotif] = useState(false);

  // Hidden judge-only gesture: tap anywhere on the top bar 9 times to cycle
  // free → pro → max → free. The gap between taps only has to stay under
  // this window, which is deliberately well above the ~500ms a deliberate,
  // unhurried tapping pace lands at — you shouldn't have to drum on it.
  // Refs (not state) so rapid taps don't fight re-renders.
  const titleTapCountRef = useRef(0);
  const lastTitleTapAtRef = useRef(0);
  const TITLE_TAP_THRESHOLD = 9;
  const TITLE_TAP_WINDOW_MS = 1500;

  function handleTitleTap() {
    // TEMPORARY (constants/judgeMode.ts): judges only. Ungated, this handed
    // any user on any build a free Max tier with no RevenueCat purchase.
    if (!isJudge) return;
    const now = Date.now();
    if (now - lastTitleTapAtRef.current > TITLE_TAP_WINDOW_MS) titleTapCountRef.current = 0;
    lastTitleTapAtRef.current = now;
    titleTapCountRef.current += 1;
    if (titleTapCountRef.current >= TITLE_TAP_THRESHOLD) {
      titleTapCountRef.current = 0;
      const next = DEV_TIER_CYCLE[tier];
      // Recorded as judge access too — app/_layout.tsx resets a judge's tier
      // to judgeAccessTier on every launch, so a bare setTier wouldn't stick.
      if (next === 'free') clearJudgeAccess();
      else grantJudgeAccess(next, 'offline_preview');
      setTier(next);
      // The same screens a real plan change gets: the celebration going up
      // (it says the switch came from this shortcut, not RevenueCat) and
      // the goodbye going back to Free. The countdown toast would otherwise
      // sit on top of either screen until it timed out.
      useToastStore.getState().hide();
      showPlanChangeScreen(tier, next);
      return;
    }
    // Count down the last few taps the way Android's own developer-options
    // gesture does. Without it there's no way to tell a tap that didn't
    // register from a gesture that isn't working at all — which is exactly
    // how this read while the tap target was only the title text.
    const remaining = TITLE_TAP_THRESHOLD - titleTapCountRef.current;
    if (remaining <= 3) showToast(`${remaining} more tap${remaining === 1 ? '' : 's'} to switch plans.`);
  }

  useEffect(() => {
    getBiometricCapabilities().then(setBiometricCaps);
  }, []);

  async function handleToggleSmartNudges(next: boolean) {
    if (!next) {
      setSmartNudgesEnabled(false);
      await refreshStudyNudge({ suggestedHour: null, enabled: false });
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Notifications disabled', 'Allow notifications for this app in your device Settings to turn this on.');
      return;
    }
    setSmartNudgesEnabled(true);
    await refreshStudyNudge({ suggestedHour: getSuggestedHour(preferredStudyWindow), enabled: true });
  }

  function resetLearningProgress() {
    confirmAction(
      {
        title: 'Reset learning progress?',
        message: 'This clears your course path, quiz topic progress, and spaced-repetition schedule. Streaks and badges are kept.',
        confirmLabel: 'Reset',
        destructive: true,
      },
      () => {
        useQuizStore.setState({ topicProgress: {}, seenBankIndices: {}, history: {} });
        useCourseStore.setState({ courseProgress: {} });
      }
    );
  }

  async function handleToggleNotifications(next: boolean) {
    if (!next) {
      setNotificationsEnabled(false);
      await disableAllReminders();
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert('Notifications disabled', 'Allow notifications for this app in your device Settings to turn this on.');
      return;
    }
    setNotificationsEnabled(true);
    // The 8pm check-in exists to pull someone back into the app, so it is an
    // engagement nudge rather than a reminder they asked for. A minor still
    // gets their own bill reminders from this same toggle.
    if (agePermissions.engagementNudges) await scheduleDailyReminder();
  }

  function handleToggleAppLock(next: boolean) {
    if (next) {
      if (!hasConfiguredPin) {
        setIsChangingPin(false);
        setPinModalOpen(true);
      } else {
        setAppLockEnabled(true);
      }
    } else {
      confirmAction(
        {
          title: 'Turn off App Lock?',
          message: 'This removes your PIN and biometric protection when opening the app.',
          confirmLabel: 'Turn Off',
          destructive: true,
        },
        () => {
          disableAppLock();
        }
      );
    }
  }

  function handleChangePin() {
    setIsChangingPin(true);
    setPinModalOpen(true);
  }

  async function handleSendTestNotification() {
    try {
      setTestingNotif(true);
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          'Notifications disabled',
          'Allow notifications for this app in your device Settings to receive alerts.'
        );
        return;
      }
      await sendTestNotification();
      Alert.alert(
        'Notification sent',
        'A test notification has been sent! Check your notification center or lock screen.'
      );
    } catch {
      Alert.alert('Error', 'Could not send test notification.');
    } finally {
      setTestingNotif(false);
    }
  }

  function resetAllData() {
    confirmAction(
      {
        title: 'Reset all app data?',
        message: 'This clears your mock portfolio(s), trade history, and expenses. Your theme and API keys are kept.',
        confirmLabel: 'Reset',
        destructive: true,
      },
      () => {
        resetAllPortfolios();
        useExpenseStore.setState({ expenses: [], hasSeeded: true, lastDeleted: null });
        // Chat threads are content, so they reset here — the daily AI quota
        // (store/useAiUsageStore.ts) deliberately isn't touched, or this
        // button would double as a way to bypass the free-tier daily limit.
        useChatStore.setState({ threads: {} });
        // Every entry here points at a tradeId from the portfolio just
        // wiped above — without this, Home's "Trade reflections" card kept
        // showing a mistake logged against a trade that no longer exists.
        useMistakeJournalStore.setState({ entries: [] });
      }
    );
  }

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      {/* The whole bar is one tap target for the hidden tier switcher — the
          back button sits inside it and wins its own taps, so everything
          else (title, empty space, the full width) counts toward the 9. */}
      <Pressable onPress={handleTitleTap} style={[styles.header, { backgroundColor: colors.surface }]}>
        <IconButton name="chevron-back" onPress={() => router.back()} />
        <Text style={[styles.headerTitleText, { color: colors.text }]}>Settings</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Section title="Plan">
            <PlanCard tier={tier} onManage={() => setPlanModalOpen(true)} />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Change plan" variant="ghost" onPress={() => router.push('/settings/upgrade')} />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(25).springify().damping(16)}>
          <Section title="Privacy & age" subtitle="What Markva does and doesn't do with your information.">
            <PrivacyAgeSection />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(50).springify().damping(16)}>
          <Section title="Appearance">
            <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} />
            <View style={{ marginTop: spacing.lg }}>
              <AccentColorPicker value={accentColor} onChange={setAccentColor} />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
          <Section title="Learning Environment" subtitle="Fonts, study reminders, and your AI tutor's tone.">
            <View style={{ gap: spacing.lg }}>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.text3 }]}>Font</Text>
                <FontPicker value={fontOption} onChange={setFontOption} />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.text3 }]}>Text size</Text>
                <SegmentedControl
                  options={TEXT_SCALE_SEGMENT_OPTIONS}
                  value={String(textScale)}
                  onChange={(v) => setTextScale(Number(v) as TextScale)}
                />
              </View>
              <View>
                <Text style={[styles.fieldLabel, { color: colors.text3 }]}>AI tutor tone</Text>
                <SegmentedControl options={PERSONA_OPTIONS} value={tutorPersona} onChange={setTutorPersona} />
              </View>
              {/* Hidden rather than disabled for a minor: app/_layout.tsx
                  never schedules a study nudge for them, so a toggle here
                  would be a switch that visibly does nothing. */}
              {agePermissions.engagementNudges ? (
                <>
                  <SmartNudgesToggle enabled={smartNudgesEnabled} onToggle={handleToggleSmartNudges} />
                  {smartNudgesEnabled ? (
                    <View>
                      <Text style={[styles.fieldLabel, { color: colors.text3 }]}>When are you usually free to learn?</Text>
                      <SegmentedControl
                        options={STUDY_WINDOW_OPTIONS}
                        value={preferredStudyWindow ?? 'evening'}
                        onChange={(w) => {
                          setPreferredStudyWindow(w);
                          refreshStudyNudge({ suggestedHour: getSuggestedHour(w), enabled: true });
                        }}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
              <Button label="Personal records" variant="ghost" onPress={() => router.push('/settings/records')} />
              <Button label="Reset learning progress" variant="ghost" onPress={resetLearningProgress} />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(150).springify().damping(16)}>
          <Section title="AI provider" subtitle="Bring your own API key — stored only on this device.">
            <ApiKeySection />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).springify().damping(16)}>
          <Section title="Market data" subtitle="Where stock prices are coming from right now.">
            <MarketDataStatusCard />
          </Section>
        </Animated.View>

        {__DEV__ ? (
          <Animated.View entering={FadeInDown.delay(165).springify().damping(16)}>
            <Section title="Debug" subtitle="Development previews and diagnostics.">
              <Button label="Open debug menu" variant="ghost" onPress={() => router.push('/settings/debug')} />
            </Section>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(175).springify().damping(16)}>
          <Section title="Notifications" subtitle="Daily market reviews, learning check-ins, and study alerts.">
            <View style={{ gap: spacing.md }}>
              <NotificationsToggle
                enabled={notificationsEnabled}
                onToggle={handleToggleNotifications}
                nudgesAllowed={agePermissions.engagementNudges}
              />
              <Button
                label={testingNotif ? 'Sending notification…' : 'Send test notification'}
                variant="ghost"
                onPress={handleSendTestNotification}
              />
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify().damping(16)}>
          <Section
            title="Security"
            subtitle={
              biometricCaps?.isEnrolled
                ? `Protect your account with a ${pinLength}-digit PIN and ${biometricCaps.label}.`
                : `Protect your account with a ${pinLength}-digit PIN.`
            }>
            <View style={{ gap: spacing.md }}>
              <Card style={styles.notifRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifLabel, { color: colors.text }]}>App Lock</Text>
                  <Text style={[styles.notifSub, { color: colors.text3 }]}>
                    {appLockEnabled
                      ? `Active • Protected by ${pinLength}-digit PIN${useBiometrics && biometricCaps?.isEnrolled ? ` + ${biometricCaps.label}` : ''}`
                      : hasConfiguredPin
                        ? 'PIN configured. Turn on to lock app.'
                        : 'Require PIN or biometrics to open the app.'}
                  </Text>
                </View>
                <Switch
                  value={appLockEnabled}
                  onValueChange={handleToggleAppLock}
                  trackColor={{ true: colors.accent }}
                />
              </Card>

              {appLockEnabled && biometricCaps && biometricCaps.isEnrolled ? (
                <Card style={styles.notifRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifLabel, { color: colors.text }]}>Unlock with {biometricCaps.label}</Text>
                    <Text style={[styles.notifSub, { color: colors.text3 }]}>
                      Fast biometric access. Your PIN remains available as a backup.
                    </Text>
                  </View>
                  <Switch
                    value={useBiometrics}
                    onValueChange={(val) => setUseBiometrics(val)}
                    trackColor={{ true: colors.accent }}
                  />
                </Card>
              ) : null}

              {appLockEnabled ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Change PIN" variant="ghost" fullWidth onPress={handleChangePin} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Lock app now" variant="ghost" fullWidth onPress={lockAppNow} />
                  </View>
                </View>
              ) : !hasConfiguredPin ? (
                <Button
                  label={biometricCaps?.isEnrolled ? `Set up ${biometricCaps.label} & PIN` : 'Set up PIN Lock'}
                  variant="primary"
                  onPress={() => {
                    setIsChangingPin(false);
                    setPinModalOpen(true);
                  }}
                />
              ) : null}
            </View>
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(225).springify().damping(16)}>
          <Section title="Achievements">
            <AchievementsRow badgeCount={badgeCount} />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(235).springify().damping(16)}>
          <Section title="Quality of Life" subtitle="Privacy, motion, feedback, and loading-game preferences.">
            <Button label="Customize app behavior" variant="ghost" fullWidth onPress={() => router.push('/settings/quality-of-life')} />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).springify().damping(16)}>
          <Section title="Investor Toolkit" subtitle="Twenty quick calculators for investing, trading, and planning.">
            <Button label="Open all 20 tools" variant="ghost" fullWidth onPress={() => router.push('/toolkit')} />
          </Section>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify().damping(16)}>
          <Section title="Data">
            <Button label="Reset all app data" variant="danger" onPress={resetAllData} />
          </Section>
        </Animated.View>
      </ScrollView>

      <PlanDetailsModal visible={planModalOpen} tier={tier} onClose={() => setPlanModalOpen(false)} />
      <PinSetupModal
        visible={pinModalOpen}
        isChangingPin={isChangingPin}
        onClose={() => setPinModalOpen(false)}
      />
    </Screen>
  );
}

function AchievementsRow({ badgeCount }: { badgeCount: number }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.notifRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.notifLabel, { color: colors.text }]}>Badges</Text>
        <Text style={[styles.notifSub, { color: colors.text3 }]}>
          {badgeCount} / {Object.keys(BADGE_INFO).length} earned across the app
        </Text>
      </View>
      <Button label="View all" variant="ghost" onPress={() => router.push('/settings/achievements')} />
    </Card>
  );
}

// The only place a minor can revisit the choice made in the age gate. The
// restriction list is rendered from TEEN_RESTRICTIONS rather than retyped,
// so this screen and the gate can never describe the rules differently.
function PrivacyAgeSection() {
  const { colors } = useTheme();
  const permissions = useAgePermissions();
  const isJudge = useIsJudgeMode();
  const setJudgeMode = useAgeStore((s) => s.setJudgeMode);
  const setTier = useSettingsStore((s) => s.setTier);
  const judgeAccessSource = useAgeStore((s) => s.judgeAccessSource);
  const aiDataConsent = useAgeStore((s) => s.aiDataConsent);
  const setAiDataConsent = useAgeStore((s) => s.setAiDataConsent);

  // TEMPORARY, hackathon judging only — constants/judgeMode.ts. Exiting drops
  // straight into the real age gate, which is also how to get back to the
  // normal flow on a device that already answered "yes".
  if (isJudge) {
    return (
      <Card>
        <Text style={[styles.notifLabel, { color: colors.text }]}>Judging mode is on</Text>
        <Text style={[styles.notifSub, { color: colors.text3, marginTop: 6 }]}>
          Test Store purchases are simulated and this account is treated as 18+, so nothing is age-restricted. This
          temporary option is only included in the Shipaton judge build.
        </Text>
        {judgeAccessSource ? (
          <Text style={[styles.notifSub, { color: colors.text3, marginTop: 6 }]}>
            Current access came from {judgeAccessSource === 'test_store' ? 'RevenueCat Test Store' : 'the offline local preview'}.
          </Text>
        ) : null}
        <Text style={[styles.notifSub, { color: colors.text3, marginTop: 6 }]}>
          Exiting asks your date of birth and restores the normal age rules. A still-active Test Store entitlement
          can remain visible until its accelerated test period expires.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Exit judging mode"
            variant="ghost"
            onPress={() => {
              setJudgeMode(false);
              setTier('free');
            }}
          />
        </View>
      </Card>
    );
  }

  // TEMPORARY, hackathon judging only — constants/judgeMode.ts. The initial
  // "Are you a judge?" prompt is the only other place judge mode can be
  // turned on, so without this a mis-tapped "No" is only recoverable by
  // reinstalling the app. Shown regardless of age band; gated on
  // JUDGE_MODE_ENABLED so it's dead code outside a judge-variant build.
  const judgeRecovery = JUDGE_MODE_ENABLED ? (
    <Card>
      <Text style={[styles.notifLabel, { color: colors.text }]}>Shipaton judge?</Text>
      <Text style={[styles.notifSub, { color: colors.text3, marginTop: 6 }]}>
        This is a judge build. If you meant to answer “yes” at the first prompt, you can turn on judging mode here
        instead of reinstalling.
      </Text>
      <View style={{ marginTop: spacing.md }}>
        <Button label="Enable judging mode" variant="ghost" onPress={() => setJudgeMode(true)} />
      </View>
    </Card>
  ) : null;

  if (permissions.band === 'adult') {
    return (
      <View style={{ gap: spacing.md }}>
        {judgeRecovery}
        <Card style={styles.notifRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.notifLabel, { color: colors.text }]}>Adult account</Text>
            <Text style={[styles.notifSub, { color: colors.text3 }]}>
              No age restrictions apply to this account. What the app sends where is set out in full in the privacy
              policy.
            </Text>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.md }}>
      {judgeRecovery}
      <Card style={styles.notifRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.notifLabel, { color: colors.text }]}>AI features</Text>
          <Text style={[styles.notifSub, { color: colors.text3 }]}>
            While this is on, what you type into the Assistant, quizzes and lesson stories is sent to an outside AI
            company so it can answer. Turning it off stops that completely — nothing else changes.
          </Text>
        </View>
        <Switch value={aiDataConsent === true} onValueChange={setAiDataConsent} trackColor={{ true: colors.accent }} />
      </Card>
      <Card>
        <Text style={[styles.notifLabel, { color: colors.text }]}>Always off while you are under 18</Text>
        {TEEN_RESTRICTIONS.map((line) => (
          <Text key={line} style={[styles.notifSub, { color: colors.text3, marginTop: 6 }]}>
            •  {line}
          </Text>
        ))}
      </Card>
    </View>
  );
}

// The same switch means different things by age band, so it says different
// things — a minor gets only the reminders they set up themselves, and
// promising them an evening check-in that app/_layout.tsx will never schedule
// would just be wrong.
function NotificationsToggle({
  enabled,
  onToggle,
  nudgesAllowed,
}: {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  nudgesAllowed: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Card style={styles.notifRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.notifLabel, { color: colors.text }]}>
          {nudgesAllowed ? 'Daily reminders' : 'Bill reminders'}
        </Text>
        <Text style={[styles.notifSub, { color: colors.text3 }]}>
          {nudgesAllowed
            ? 'A check-in reminder each evening, plus a nudge if your Learn streak is about to lapse.'
            : 'A heads-up the day before a recurring expense is due. Streak and check-in reminders stay off while you are under 18.'}
        </Text>
      </View>
      <Switch value={enabled} onValueChange={onToggle} trackColor={{ true: colors.accent }} />
    </Card>
  );
}

function SmartNudgesToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (next: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.notifRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.notifLabel, { color: colors.text }]}>Smart study reminders</Text>
        <Text style={[styles.notifSub, { color: colors.text3 }]}>
          Learns when you usually open the app and nudges you at a good moment to learn.
        </Text>
      </View>
      <Switch value={enabled} onValueChange={onToggle} trackColor={{ true: colors.accent }} />
    </Card>
  );
}


function PlanCard({ tier, onManage }: { tier: keyof typeof TIER_LABELS; onManage: () => void }) {
  const { colors } = useTheme();
  const isJudge = useIsJudgeMode();
  return (
    <Card style={styles.planRow}>
      <View>
        <Text style={[styles.planLabel, { color: colors.text3 }]}>Current plan</Text>
        <Text style={[styles.planValue, { color: colors.text }]}>
          {isJudge ? `${TIER_LABELS[tier]} · Judge preview` : TIER_LABELS[tier]}
        </Text>
      </View>
      <Pressable onPress={onManage} hitSlop={8}>
        <PillBadge label="Manage" />
      </Pressable>
    </Card>
  );
}

function PlanDetailsModal({
  visible,
  tier,
  onClose,
}: {
  visible: boolean;
  tier: keyof typeof TIER_LABELS;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const isJudge = useIsJudgeMode();
  const judgeAccessSource = useAgeStore((s) => s.judgeAccessSource);
  const [since, setSince] = useState<Date | null | undefined>(undefined);

  useEffect(() => {
    if (!visible) {
      setSince(undefined);
      return;
    }
    if (isJudge) {
      setSince(null);
      return;
    }
    let alive = true;
    fetchSubscriptionSince().then((result) => {
      if (alive) setSince(result);
    });
    return () => {
      alive = false;
    };
  }, [visible, isJudge]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.modalBackdrop}>
        {/* Entrance animation on this plain Animated.View, not a Pressable —
            a Reanimated `entering=` view can drop the first tap or two while
            it's still settling, so the dismiss-on-tap area is a separate
            absolute-fill Pressable instead. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          <Pressable
            feedbackEnabled={false}
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onPress={(e: any) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{TIER_LABELS[tier]} plan</Text>
            {tier !== 'free' ? (
              <Text style={[styles.modalSubtitle, { color: colors.text3 }]}>
                {isJudge
                  ? judgeAccessSource === 'test_store'
                    ? 'Unlocked through a RevenueCat Test Store purchase.'
                    : judgeAccessSource === 'offline_preview'
                      ? 'Local offline judge preview — no RevenueCat transaction.'
                      : 'Shipaton judge mode is active; complete a Test Store purchase to unlock this plan.'
                  : since
                  ? `Member since ${since.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`
                  : isPurchasesConfigured()
                    ? 'Fetching subscription details…'
                    : 'Demo mode — no real subscription on file.'}
              </Text>
            ) : (
              <Text style={[styles.modalSubtitle, { color: colors.text3 }]}>You're on the free plan.</Text>
            )}

            <View style={styles.modalFeatures}>
              {TIER_FEATURE_COPY[tier].map((f) => (
                <Text key={f} style={[styles.modalFeature, { color: colors.text2 }]}>
                  ✓ {f}
                </Text>
              ))}
            </View>

            <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.sectionSubtitle, { color: colors.text3 }]}>{subtitle}</Text> : null}
      <View style={{ marginTop: spacing.md }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitleText: { fontSize: 17, letterSpacing: trackingFor(17), fontWeight: '600' },
  sectionTitle: { fontSize: 15, letterSpacing: trackingFor(15), fontWeight: '700' },
  sectionSubtitle: { fontSize: 12.5, letterSpacing: trackingFor(12.5), marginTop: 2 },
  fieldLabel: { fontSize: 12, letterSpacing: trackingFor(12), fontWeight: '600', marginBottom: spacing.sm },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  planValue: { fontSize: 16, letterSpacing: trackingFor(16), fontWeight: '700', marginTop: 2 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notifLabel: { fontSize: 14, letterSpacing: trackingFor(14), fontWeight: '700' },
  notifSub: { fontSize: 12, letterSpacing: trackingFor(12), lineHeight: 16, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm },
  modalTitle: { fontSize: 19, letterSpacing: trackingFor(19), fontWeight: '700' },
  modalSubtitle: { fontSize: 13, letterSpacing: trackingFor(13), marginBottom: spacing.sm },
  modalFeatures: { gap: 6, marginVertical: spacing.md },
  modalFeature: { fontSize: 13.5, letterSpacing: trackingFor(13.5) },
});
