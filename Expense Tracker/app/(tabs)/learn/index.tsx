import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { TopBar } from '@/components/ui/TopBar';
import { badgeInfo } from '@/constants/badges';
import { QUIZ_TOPICS, quizTopicOf } from '@/constants/quizTopics';
import { TIER_FEATURES } from '@/constants/subscription';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { useQuizStore } from '@/store/useQuizStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { todayStr } from '@/utils/date';

function FlameIcon() {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.22, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1,
      true
    );
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Text style={styles.streakEmoji}>🔥</Text>
    </Animated.View>
  );
}

export default function LearnScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const features = TIER_FEATURES[tier];
  const { topicProgress, getDueTopic, getNextNewTopic, attempts } = useQuizStore();
  const { streakDays, badges, getNarrativeCompletionsToday } = useStreakStore();

  const dueTopic = getDueTopic();
  const newTopic = getNextNewTopic();
  const nextTopic = dueTopic ?? newTopic;
  const isReview = !!dueTopic;

  const quizzesToday = useMemo(() => attempts.filter((a) => a.date === todayStr()).length, [attempts]);
  const quizRemaining = features.quizDailyLimit === null ? null : Math.max(0, features.quizDailyLimit - quizzesToday);
  const quizLocked = quizRemaining !== null && quizRemaining <= 0;

  const narrativesToday = getNarrativeCompletionsToday();
  const narrativeRemaining =
    features.narrativeDailyLimit === null ? null : Math.max(0, features.narrativeDailyLimit - narrativesToday);
  const narrativeLocked = narrativeRemaining !== null && narrativeRemaining <= 0;

  const topicsByCategory = useMemo(() => {
    const groups: Record<string, typeof QUIZ_TOPICS> = {};
    for (const t of QUIZ_TOPICS) {
      groups[t.category] = groups[t.category] ? [...groups[t.category], t] : [t];
    }
    return groups;
  }, []);

  return (
    <Screen>
      <TopBar title="Learn" subtitle="Quizzes, patterns, and daily challenges" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Animated Streak Card */}
        <Animated.View entering={FadeInDown.duration(350).springify().damping(16)}>
          <Card style={styles.streakCard}>
            <FlameIcon />
            <View style={{ flex: 1 }}>
              <Text style={[styles.streakValue, { color: colors.text }]}>{streakDays}-day streak</Text>
              <Text style={[styles.streakSub, { color: colors.text3 }]}>
                {streakDays > 0 ? 'Keep it going — take a quiz today.' : 'Take a quiz to start your streak.'}
              </Text>
            </View>
          </Card>
        </Animated.View>

        {badges.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(60).springify().damping(16)} style={styles.badgeRow}>
            {badges.map((b) => {
              const info = badgeInfo(b);
              return <PillBadge key={b} label={`${info.icon} ${info.label}`} />;
            })}
          </Animated.View>
        ) : null}

        {/* Next Topic Card */}
        <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{isReview ? 'Review due' : 'Next up'}</Text>
          <Card style={{ marginTop: spacing.md }}>
            {nextTopic ? (
              <>
                <Text style={[styles.topicLabel, { color: colors.text }]}>{quizTopicOf(nextTopic)?.label}</Text>
                <Text style={[styles.topicMeta, { color: colors.text3 }]}>
                  {isReview ? 'Spaced-repetition review' : 'New topic'}
                  {quizRemaining !== null ? ` · ${quizRemaining} quiz${quizRemaining === 1 ? '' : 'zes'} left today` : ''}
                </Text>
                <View style={{ marginTop: spacing.md }}>
                  {quizLocked ? (
                    <Button label="Upgrade for unlimited quizzes" variant="ghost" onPress={() => upgradeToTier('pro')} />
                  ) : (
                    <Button
                      label={isReview ? 'Review now' : 'Start quiz'}
                      onPress={() => router.push({ pathname: '/learn/quiz', params: { topic: nextTopic } })}
                    />
                  )}
                </View>
              </>
            ) : (
              <Text style={[styles.topicMeta, { color: colors.text3 }]}>
                You&apos;ve mastered every topic — nice work! 🎉
              </Text>
            )}
          </Card>
        </Animated.View>

        {/* Daily Challenge Card */}
        <Animated.View entering={FadeInDown.delay(150).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily challenge</Text>
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.topicLabel, { color: colors.text }]}>A realistic trading scenario</Text>
            <Text style={[styles.topicMeta, { color: colors.text3 }]}>
              Make a call, see the outcome, learn the principle behind it.
              {narrativeRemaining !== null ? ` · ${narrativeRemaining} left today` : ''}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              {narrativeLocked ? (
                <Button label="Upgrade for unlimited challenges" variant="ghost" onPress={() => upgradeToTier('pro')} />
              ) : (
                <Button label="Take the challenge" variant="ghost" onPress={() => router.push('/learn/narrative')} />
              )}
            </View>
          </Card>
        </Animated.View>

        {/* All Topics Section */}
        <Animated.View entering={FadeInDown.delay(200).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>All topics</Text>
          {Object.entries(topicsByCategory).map(([category, topics]) => (
            <View key={category} style={{ marginTop: spacing.md }}>
              <Text style={[styles.categoryLabel, { color: colors.text3 }]}>{category}</Text>
              <Card style={{ marginTop: spacing.sm }}>
                {topics.map((t, i) => {
                  const progress = topicProgress[t.id];
                  const status = !progress ? 'New' : progress.mastered ? 'Mastered' : progress.nextReviewDate <= todayStr() ? 'Due' : 'Learning';
                  const statusColor =
                    status === 'Mastered' ? colors.success : status === 'Due' ? colors.warning : colors.text3;
                  return (
                    <View
                      key={t.id}
                      style={[styles.topicRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                      <Text style={[styles.topicRowLabel, { color: colors.text }]}>{t.label}</Text>
                      <Text style={[styles.topicRowStatus, { color: statusColor }]}>{status}</Text>
                    </View>
                  );
                })}
              </Card>
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl, paddingBottom: spacing.xxl },
  streakCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  streakEmoji: { fontSize: 30 },
  streakValue: { fontSize: 17, fontWeight: '700' },
  streakSub: { fontSize: 12.5, marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  topicLabel: { fontSize: 15, fontWeight: '700' },
  topicMeta: { fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  categoryLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9 },
  topicRowLabel: { fontSize: 13.5, fontWeight: '500' },
  topicRowStatus: { fontSize: 12, fontWeight: '700' },
});
