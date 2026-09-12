import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { BADGE_INFO, badgeInfo } from '@/constants/badges';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useStreakStore } from '@/store/useStreakStore';

const ALL_BADGE_IDS = Object.keys(BADGE_INFO);

export default function AchievementsScreen() {
  const { colors } = useTheme();
  const badges = useStreakStore((s) => s.badges);
  const streakDays = useStreakStore((s) => s.streakDays);
  const earned = new Set(badges);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Achievements' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.summary, { color: colors.text }]}>
            {badges.length} / {ALL_BADGE_IDS.length} badges earned
          </Text>
          {streakDays > 0 ? (
            <Text style={[styles.streak, { color: colors.text2 }]}>🔥 {streakDays}-day streak</Text>
          ) : null}
        </Animated.View>

        <View style={styles.grid}>
          {ALL_BADGE_IDS.map((id, i) => {
            const info = badgeInfo(id);
            const done = earned.has(id);
            return (
              <Animated.View
                key={id}
                entering={FadeInDown.delay(Math.min(i * 30, 300)).springify().damping(16)}
                style={styles.cell}>
                <Card style={[styles.badgeCard, !done && { opacity: 0.5 }]}>
                  <Text style={styles.badgeIcon}>{info.icon}</Text>
                  <Text style={[styles.badgeLabel, { color: colors.text }]}>{info.label}</Text>
                  <Text style={[styles.badgeStatus, { color: done ? colors.success : colors.text3 }]}>
                    {done ? 'Earned' : 'Locked'}
                  </Text>
                </Card>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  summary: { fontSize: 20, letterSpacing: trackingFor(20), fontWeight: '700', textAlign: 'center' },
  streak: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '600', textAlign: 'center', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexGrow: 1, flexBasis: '47%' },
  badgeCard: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  badgeIcon: { fontSize: 30, letterSpacing: trackingFor(30) },
  badgeLabel: { fontSize: 13.5, letterSpacing: trackingFor(13.5), fontWeight: '700', textAlign: 'center' },
  badgeStatus: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
});
