import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { CoursePath } from '@/components/learn/CoursePath';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { badgeInfo } from '@/constants/badges';
import { QUIZ_TOPICS, quizTopicOf } from '@/constants/quizTopics';
import { spacing } from '@/constants/theme';
import { useAiQuota } from '@/hooks/useAiQuota';
import { useTheme } from '@/hooks/useTheme';
import { useRememberedScroll } from '@/hooks/useRememberedScroll';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { useQuizStore } from '@/store/useQuizStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useTriviaStore } from '@/store/useTriviaStore';
import { todayStr } from '@/utils/date';

const LEVEL_PATH_COPY = {
  beginner: { label: 'Beginner', stage: 1 },
  intermediate: { label: 'Intermediate', stage: 2 },
  advanced: { label: 'Advanced', stage: 3 },
  professional: { label: 'Professional', stage: 4 },
} as const;

function FlameIcon() {
  const scale = useSharedValue(1);

  useEffect(() => {
    // A single up-down flicker (1.8s total) rather than an endless loop —
    // decorative animations here are capped at ~2s and then hold static.
    scale.value = withRepeat(
      withSequence(
        withTiming(1.22, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      1,
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
  const upgradeToTier = useUpgradeToTier();
  const { topicProgress, getDueTopic, getNextNewTopic } = useQuizStore(
    useShallow((s) => ({ topicProgress: s.topicProgress, getDueTopic: s.getDueTopic, getNextNewTopic: s.getNextNewTopic }))
  );
  const { streakDays, badges } = useStreakStore(
    useShallow((s) => ({ streakDays: s.streakDays, badges: s.badges }))
  );
  const { levelSelected, selectedLevel } = useSettingsStore(
    useShallow((s) => ({ levelSelected: s.levelSelected, selectedLevel: s.selectedLevel }))
  );
  const selectedPath = selectedLevel ? LEVEL_PATH_COPY[selectedLevel] : null;
  const rememberedScroll = useRememberedScroll('learn');

  // Quizzes and the daily challenge draw from the same unified AI quota as
  // every other AI feature (see hooks/useAiQuota) — a working personal key
  // is unlimited, otherwise both share one "X left today" count.
  const { remaining: aiRemaining, locked: aiLocked } = useAiQuota();

  const dueTopic = getDueTopic();
  const newTopic = getNextNewTopic();
  const nextTopic = dueTopic ?? newTopic;
  const isReview = !!dueTopic;

  const quizRemaining = aiRemaining;
  const quizLocked = aiLocked;
  const narrativeRemaining = aiRemaining;
  const narrativeLocked = aiLocked;

  const triviaPlayedToday = useTriviaStore((s) => s.hasPlayedToday());
  const triviaLastYourScore = useTriviaStore((s) => s.lastYourScore);
  const triviaLastBotScore = useTriviaStore((s) => s.lastBotScore);
  const triviaStreak = useTriviaStore((s) => s.currentStreak);

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
      <ScrollView ref={rememberedScroll.ref} onMomentumScrollEnd={rememberedScroll.onMomentumScrollEnd} contentContainerStyle={styles.content}>
        {/* Animated Streak Card */}
        <View>
          <Card style={styles.streakCard}>
            <FlameIcon />
            <View style={{ flex: 1 }}>
              <Text style={[styles.streakValue, { color: colors.text }]}>{streakDays}-day streak</Text>
              <Text style={[styles.streakSub, { color: colors.text3 }]}>
                {streakDays > 0 ? 'Keep it going — take a quiz today.' : 'Take a quiz to start your streak.'}
              </Text>
            </View>
          </Card>
        </View>

        <UpgradeBanner
          title="Upgrade for more AI actions"
          body="Pro and Max raise your daily AI limit for quizzes, challenges, and the analyst."
        />

        {badges.length > 0 ? (
          <View style={styles.badgeRow}>
            {badges.map((b) => {
              const info = badgeInfo(b);
              return <PillBadge key={b} label={`${info.icon} ${info.label}`} />;
            })}
          </View>
        ) : null}

        <View>
          <Card style={styles.levelCard}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.levelCardEyebrow, { color: colors.accent }]}>Personalize your path</Text>
              <Text style={[styles.levelCardTitle, { color: colors.text }]}>
                {selectedPath ? `${selectedPath.label} path · Stage ${selectedPath.stage}` : 'What’s your investing level?'}
              </Text>
              <Text style={[styles.levelCardSub, { color: colors.text3 }]}>
                {selectedPath
                  ? 'Your chosen stage is open below. Earlier courses remain available whenever you want a refresher.'
                  : 'Choose Beginner, Intermediate, Advanced, or Professional to open the right starting stage.'}
              </Text>
            </View>
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label={levelSelected ? 'Change level' : 'Choose level'}
                variant="ghost"
                fullWidth
                onPress={() => router.push('/learn/level-select')}
              />
            </View>
          </Card>
        </View>

        {/* Course Path */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Path</Text>
          <View style={{ marginTop: spacing.md }}>
            <CoursePath />
          </View>
        </View>

        {/* Next Topic Card */}
        <View>
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
                    <Button label="Upgrade for more AI actions" variant="ghost" onPress={() => upgradeToTier('pro')} />
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
        </View>

        {/* Flashcards Card */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Flashcards</Text>
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.topicLabel, { color: colors.text }]}>Quick term review</Text>
            <Text style={[styles.topicMeta, { color: colors.text3 }]}>
              Flip through built-in flashcards by topic — generate more with AI any time.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button label="Study flashcards" variant="ghost" onPress={() => router.push('/learn/flashcards')} />
            </View>
          </Card>
        </View>

        {/* Daily Challenge Card */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily challenge</Text>
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.topicLabel, { color: colors.text }]}>A realistic trading scenario</Text>
            <Text style={[styles.topicMeta, { color: colors.text3 }]}>
              Make a call, see the outcome, learn the principle behind it.
              {narrativeRemaining !== null ? ` · ${narrativeRemaining} left today` : ''}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              {narrativeLocked ? (
                <Button label="Upgrade for more AI actions" variant="ghost" onPress={() => upgradeToTier('pro')} />
              ) : (
                <Button label="Take the challenge" variant="ghost" onPress={() => router.push('/learn/narrative')} />
              )}
            </View>
          </Card>
        </View>

        {/* Daily Trivia Battle Card */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Trivia battle</Text>
          <Card style={{ marginTop: spacing.md }}>
            <Text style={[styles.topicLabel, { color: colors.text }]}>5 questions vs an AI opponent</Text>
            <Text style={[styles.topicMeta, { color: colors.text3 }]}>
              {triviaPlayedToday
                ? `You ${triviaLastYourScore} — ${triviaLastBotScore} Bot today${triviaStreak > 1 ? ` · 🔥 ${triviaStreak}-win streak` : ''}`
                : 'One free round a day — beat the bot to build a streak.'}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={triviaPlayedToday ? "See today's result" : 'Play today\'s round'}
                variant="ghost"
                onPress={() => router.push('/learn/trivia')}
              />
            </View>
          </Card>
        </View>

        {/* All Topics Section */}
        <View>
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
        </View>
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
  levelCard: { gap: spacing.xs },
  levelCardEyebrow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  levelCardTitle: { fontSize: 15, fontWeight: '700' },
  levelCardSub: { fontSize: 12.5, lineHeight: 17 },
});
