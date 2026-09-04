import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { courseOf } from '@/constants/courses';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useCourseStore } from '@/store/useCourseStore';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useStockViewStore } from '@/store/useStockViewStore';

export default function PracticeScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const { colors } = useTheme();
  const course = courseOf(courseId ?? '');
  const completeSubpart = useCourseStore((s) => s.completeSubpart);

  const stockView = useStockViewStore();
  const activePortfolio = useActivePortfolio();
  const watchlist = usePortfolioStore((s) => s.watchlist);

  if (!course) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown course" />
      </Screen>
    );
  }

  const isAuto = course.practice.action !== 'manual';
  const detected =
    course.practice.action === 'stock-viewed'
      ? stockView.hasEverViewedAnyStock
      : course.practice.action === 'trade-placed'
        ? activePortfolio.trades.length > 0
        : course.practice.action === 'watchlist-added'
          ? watchlist.length > 0
          : false;

  function handleComplete() {
    completeSubpart(course!.id, 'practice');
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.title, { color: colors.text }]}>Practice it</Text>
          <Text style={[styles.instruction, { color: colors.text2 }]}>{course.practice.instruction}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
          <Card style={styles.ctaCard}>
            <Button label={course.practice.ctaLabel} fullWidth onPress={() => router.push(course!.practice.ctaRoute as any)} />
          </Card>
        </Animated.View>

        {isAuto ? (
          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)} style={styles.statusRow}>
            <Ionicons
              name={detected ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={detected ? colors.success : colors.text3}
            />
            <Text style={[styles.statusText, { color: detected ? colors.success : colors.text3 }]}>
              {detected ? 'Detected — nice work!' : "We'll detect this automatically once you do it."}
            </Text>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
            <Text style={[styles.manualNote, { color: colors.text3 }]}>
              This one's checked by you — mark it done once you've actually done it.
            </Text>
          </Animated.View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Button
            label={isAuto ? "I've done this" : 'Mark as done'}
            fullWidth
            variant={isAuto && !detected ? 'ghost' : 'primary'}
            disabled={isAuto && !detected}
            onPress={handleComplete}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: 20, fontWeight: '700' },
  instruction: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  ctaCard: { alignItems: 'stretch' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusText: { fontSize: 13, fontWeight: '600' },
  manualNote: { fontSize: 12.5, lineHeight: 17 },
});
