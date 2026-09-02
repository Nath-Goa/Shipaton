import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiKeySection } from '@/components/settings/ApiKeySection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { TIER_FEATURES, TIER_LABELS } from '@/constants/subscription';
import { useTheme } from '@/hooks/useTheme';
import {
  disableAllReminders,
  requestNotificationPermission,
  scheduleDailyReminder,
} from '@/services/notifications/notifications';
import { useExpenseStore } from '@/store/useExpenseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useChatStore } from '@/store/useChatStore';
import { useSettingsStore, type ThemeMode } from '@/store/useSettingsStore';
import { confirmAction } from '@/utils/confirm';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export default function SettingsScreen() {
  const { themeMode, setThemeMode, tier, notificationsEnabled, setNotificationsEnabled } = useSettingsStore();
  const resetAllPortfolios = usePortfolioStore((s) => s.resetAllPortfolios);
  const features = TIER_FEATURES[tier];

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
        useChatStore.setState({ threads: {}, dailyUsage: { date: '', count: 0 } });
      }
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Plan">
          <PlanCard tier={tier} />
          <View style={{ marginTop: spacing.md }}>
            <Button label="Change plan" variant="ghost" onPress={() => router.push('/settings/upgrade')} />
          </View>
        </Section>

        <Section title="Appearance">
          <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} />
        </Section>

        <Section title="AI provider" subtitle="Bring your own API key — stored only on this device.">
          <ApiKeySection />
        </Section>

        <Section title="Notifications">
          {features.pushAlerts ? (
            <NotificationsToggle enabled={notificationsEnabled} onToggle={handleToggleNotifications} />
          ) : (
            <LockedNotificationsRow />
          )}
        </Section>

        <Section title="Data">
          <Button label="Reset all app data" variant="danger" onPress={resetAllData} />
        </Section>
      </ScrollView>
    </Screen>
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

function LockedNotificationsRow() {
  const { colors } = useTheme();
  return (
    <Card style={styles.notifRow}>
      <Text style={{ flex: 1, fontSize: 13, color: colors.text2 }}>Daily reminders and streak nudges — a Pro/Max feature.</Text>
      <Button label="Upgrade" variant="ghost" onPress={() => router.push('/settings/upgrade')} />
    </Card>
  );
}

function PlanCard({ tier }: { tier: keyof typeof TIER_LABELS }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.planRow}>
      <View>
        <Text style={[styles.planLabel, { color: colors.text3 }]}>Current plan</Text>
        <Text style={[styles.planValue, { color: colors.text }]}>{TIER_LABELS[tier]}</Text>
      </View>
      <PillBadge label="Manage" />
    </Card>
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
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  planValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  notifRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  notifLabel: { fontSize: 14, fontWeight: '700' },
  notifSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
