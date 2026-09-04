import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { RecordsCardModal } from '@/components/settings/RecordsCardModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { BADGE_INFO } from '@/constants/badges';
import { COURSES } from '@/constants/courses';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useCourseStore } from '@/store/useCourseStore';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useQuizStore } from '@/store/useQuizStore';
import { useStreakStore } from '@/store/useStreakStore';
import { signedPct } from '@/utils/money';
import { bestTradeGainPct } from '@/utils/tradeReflection';

export default function RecordsScreen() {
  const { colors } = useTheme();
  const { streakDays, bestStreakDays, badges } = useStreakStore();
  const { topicProgress } = useQuizStore();
  const { courseProgress, isCourseComplete } = useCourseStore();
  const portfolios = usePortfolioStore((s) => s.portfolios);
  const [cardVisible, setCardVisible] = useState(false);

  const allTrades = useMemo(() => Object.values(portfolios).flatMap((p) => p.trades), [portfolios]);
  const tradeCount = allTrades.length;
  const bestGainPct = useMemo(() => bestTradeGainPct(allTrades), [allTrades]);
  const masteredTopics = useMemo(() => Object.values(topicProgress).filter((p) => p.mastered).length, [topicProgress]);
  const coursesComplete = useMemo(
    () => COURSES.filter((c) => isCourseComplete(c.id)).length,
    [courseProgress, isCourseComplete]
  );

  const stats = [
    { label: 'Best streak', value: `${bestStreakDays}d` },
    { label: 'Current streak', value: `${streakDays}d` },
    { label: 'Badges', value: `${badges.length}/${Object.keys(BADGE_INFO).length}` },
    { label: 'Courses done', value: `${coursesComplete}/${COURSES.length}` },
    { label: 'Total trades', value: `${tradeCount}` },
    { label: 'Best trade', value: bestGainPct !== null ? signedPct(bestGainPct) : '—' },
    { label: 'Topics mastered', value: `${masteredTopics}` },
  ];

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Personal Records' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {stats.map((s, i) => (
            <Animated.View key={s.label} entering={FadeInDown.delay(Math.min(i * 40, 280)).springify().damping(16)} style={styles.cell}>
              <Card style={styles.statCard}>
                <Text style={[styles.statValue, { color: colors.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: colors.text3 }]}>{s.label}</Text>
              </Card>
            </Animated.View>
          ))}
        </View>

        <Button label="Share your records" onPress={() => setCardVisible(true)} />
      </ScrollView>

      <RecordsCardModal visible={cardVisible} onClose={() => setCardVisible(false)} stats={stats} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexGrow: 1, flexBasis: '30%' },
  statCard: { alignItems: 'center', gap: 4, paddingVertical: spacing.lg },
  statValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
});
