import * as Notifications from 'expo-notifications';

// A same-idea sibling of scheduleDailyReminder/refreshStreakRiskReminder in
// services/notifications/notifications.ts — kept in its own file since it's
// driven by store/useUsageStore's derived hour rather than a fixed time, and
// is independently toggleable (Settings › Learning Environment › Smart
// study reminders), not tied to the pushAlerts tier gate the other
// reminders use.
import { DEFAULT_CHANNEL_ID, setupNotificationChannel } from '@/services/notifications/notifications';

export const STUDY_NUDGE_ID = 'study-nudge';

export async function refreshStudyNudge(params: { suggestedHour: number | null; enabled: boolean }): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STUDY_NUDGE_ID).catch(() => {});
  if (!params.enabled || params.suggestedHour == null) return;

  await setupNotificationChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: STUDY_NUDGE_ID,
    content: {
      title: 'Good time for a quick lesson?',
      body: "You're usually free around now — a bite-sized focus session takes just a few minutes.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: params.suggestedHour,
      minute: 0,
      channelId: DEFAULT_CHANNEL_ID,
    },
  }).catch(() => {});
}

export async function cancelStudyNudge(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STUDY_NUDGE_ID).catch(() => {});
}
