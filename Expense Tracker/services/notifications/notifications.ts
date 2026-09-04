import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { parseDateLocal } from '@/utils/date';
import { money } from '@/utils/money';

// Local notifications only — there's no backend, so nothing here is a
// server push. Two fixed, idempotent slots (re-scheduling the same
// identifier replaces the previous one, but we cancel explicitly first to
// be safe across platforms), plus a dynamic per-series slot for bill
// reminders:
//   - a recurring daily check-in reminder
//   - a same-day "your streak is at risk" nudge, (re)scheduled on each app
//     open and cancelled once today's activity is already logged
//   - one "due tomorrow" nudge per recurring-expense series, rescheduled
//     whenever the upcoming due dates change
const DAILY_REMINDER_ID = 'daily-reminder';
const STREAK_RISK_ID = 'streak-at-risk';
const BILL_REMINDER_PREFIX = 'bill-reminder-';
const DAILY_REMINDER_HOUR = 20; // 8 PM local time
const STREAK_RISK_HOUR = 21; // 9 PM local time
const BILL_REMINDER_HOUR = 9; // 9 AM local time, the day before it's due
export const DEFAULT_CHANNEL_ID = 'default';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(DEFAULT_CHANNEL_ID, {
      name: 'Reminders & Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366f1',
      sound: 'default',
    }).catch(() => {});
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  return settings.granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  await setupNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: true },
  });
  return requested.granted;
}

export async function scheduleDailyReminder(): Promise<void> {
  await setupNotificationChannel();
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  // Permission can still be revoked between requestNotificationPermission()
  // succeeding and this call (or on a later app open with the toggle still
  // on) — never let that surface as an unhandled rejection.
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'Quick check-in',
      body: "Log today's spending or check your portfolio — takes a minute.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: DAILY_REMINDER_HOUR,
      minute: 0,
      channelId: DEFAULT_CHANNEL_ID,
    },
  }).catch(() => {});
}

export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;
  await setupNotificationChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Notification Test',
      body: 'Notifications are working! You will receive daily check-ins and streak nudges.',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
      channelId: DEFAULT_CHANNEL_ID,
    },
  }).catch(() => {});
  return true;
}

// Called on every activity that keeps the streak alive — cancels today's
// risk nudge since it's no longer needed.
export async function cancelStreakRiskReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});
}

// Call once per app open. Schedules a same-day nudge only if the streak is
// live, today's activity hasn't happened yet, and it's still earlier than
// the nudge time — otherwise makes sure none is pending.
export async function refreshStreakRiskReminder(params: {
  streakDays: number;
  activityDoneToday: boolean;
}): Promise<void> {
  await cancelStreakRiskReminder();
  if (params.streakDays <= 0 || params.activityDoneToday) return;

  const now = new Date();
  const target = new Date(now);
  target.setHours(STREAK_RISK_HOUR, 0, 0, 0);
  if (target <= now) return; // Too late today — don't fire a stale nudge overnight.

  // This runs unattended on every app open (app/_layout.tsx doesn't await
  // or catch it), so a revoked OS permission must not become an unhandled
  // rejection here.
  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_RISK_ID,
    content: {
      title: `Don't lose your ${params.streakDays}-day streak!`,
      body: 'Take a quick quiz or challenge before the day ends.',
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target, channelId: DEFAULT_CHANNEL_ID },
  }).catch(() => {});
}

// Re-schedules the "due tomorrow" nudge for every recurring-expense series
// whose next due date is still in the future, cancelling any bill reminder
// no longer in the list first (its series was deleted, un-recurred, or
// already caught up) so this stays idempotent across app opens.
export async function refreshBillReminders(
  bills: { seriesId: string; desc: string; amount: number; dueDate: string }[]
): Promise<void> {
  await setupNotificationChannel();
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) {
    if (n.identifier.startsWith(BILL_REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }

  const now = new Date();
  for (const bill of bills) {
    const target = parseDateLocal(bill.dueDate);
    target.setDate(target.getDate() - 1);
    target.setHours(BILL_REMINDER_HOUR, 0, 0, 0);
    // A due date that's today, already past, or less than a day out — skip
    // rather than firing a stale or immediate notification.
    if (target <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `${BILL_REMINDER_PREFIX}${bill.seriesId}`,
      content: {
        title: 'Bill due tomorrow',
        body: `${bill.desc || 'Recurring expense'} — ${money(bill.amount)} logs tomorrow.`,
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target, channelId: DEFAULT_CHANNEL_ID },
    }).catch(() => {});
  }
}

export async function disableAllReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID).catch(() => {});
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) {
    if (n.identifier.startsWith(BILL_REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }
}

export function supportsNotifications(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
