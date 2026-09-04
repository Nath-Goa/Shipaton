import { router } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { PinSetupModal } from '@/components/security/PinSetupModal';
import { AccentColorPicker } from '@/components/settings/AccentColorPicker';
import { ApiKeySection } from '@/components/settings/ApiKeySection';
import { FontPicker } from '@/components/settings/FontPicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { BADGE_INFO } from '@/constants/badges';
import { TEXT_SCALE_OPTIONS, type TextScale } from '@/constants/fonts';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURE_COPY, TIER_FEATURES, TIER_LABELS } from '@/constants/subscription';
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
import { fetchSubscriptionSince, isPurchasesConfigured } from '@/services/purchases/revenuecat';
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
import { confirmAction } from '@/utils/confirm';

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
  const {
    themeMode,
    setThemeMode,
    accentColor,
    setAccentColor,
    tier,
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
  } = useSettingsStore();

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
  const getSuggestedHour = useUsageStore((s) => s.getSuggestedHour);
  const features = TIER_FEATURES[tier];

  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [biometricCaps, setBiometricCaps] = useState<BiometricCapabilities | null>(null);
  const [testingNotif, setTestingNotif] = useState(false);

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
        useQuizStore.setState({ attempts: [], topicProgress: {}, seenBankIndices: {}, history: {} });
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
    await scheduleDailyReminder();
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
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Section title="Plan">
            <PlanCard tier={tier} onManage={() => setPlanModalOpen(true)} />
            <View style={{ marginTop: spacing.md }}>
              <Button label="Change plan" variant="ghost" onPress={() => router.push('/settings/upgrade')} />
            </View>
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

        <Animated.View entering={FadeInDown.delay(175).springify().damping(16)}>
          <Section title="Notifications" subtitle="Daily market reviews, learning check-ins, and study alerts.">
            <View style={{ gap: spacing.md }}>
              <NotificationsToggle enabled={notificationsEnabled} onToggle={handleToggleNotifications} />
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

function NotificationsToggle({ enabled, onToggle }: { enabled: boolean; onToggle: (next: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.notifRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.notifLabel, { color: colors.text }]}>Daily reminders</Text>
        <Text style={[styles.notifSub, { color: colors.text3 }]}>
          A check-in reminder each evening, plus a nudge if your Learn streak is about to lapse.
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
  return (
    <Card style={styles.planRow}>
      <View>
        <Text style={[styles.planLabel, { color: colors.text3 }]}>Current plan</Text>
        <Text style={[styles.planValue, { color: colors.text }]}>{TIER_LABELS[tier]}</Text>
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
  const [since, setSince] = useState<Date | null | undefined>(undefined);

  useEffect(() => {
    if (!visible) {
      setSince(undefined);
      return;
    }
    let alive = true;
    fetchSubscriptionSince().then((result) => {
      if (alive) setSince(result);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

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
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onPress={(e: any) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{TIER_LABELS[tier]} plan</Text>
            {tier !== 'free' ? (
              <Text style={[styles.modalSubtitle, { color: colors.text3 }]}>
                {since
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
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionSubtitle: { fontSize: 12.5, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: spacing.sm },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  planValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notifLabel: { fontSize: 14, fontWeight: '700' },
  notifSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm },
  modalTitle: { fontSize: 19, fontWeight: '700' },
  modalSubtitle: { fontSize: 13, marginBottom: spacing.sm },
  modalFeatures: { gap: 6, marginVertical: spacing.md },
  modalFeature: { fontSize: 13.5 },
});
