import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';

import { FlappyBirdLoader } from '@/components/games/FlappyBirdLoader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { badgeInfo } from '@/constants/badges';
import { springs, triggerFeedback } from '@/constants/animations';
import { quizTopicOf } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError, aiErrorActions } from '@/services/ai/errorMessage';
import { generateQuiz } from '@/services/ai/learn';
import { useQuizStore } from '@/store/useQuizStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { QuizQuestion } from '@/types/quiz';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function QuizOptionItem({
  text,
  index,
  isCorrect,
  isSelected,
  revealed,
  onSelect,
}: {
  text: string;
  index: number;
  isCorrect: boolean;
  isSelected: boolean;
  revealed: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (revealed) return;
    scale.value = withSpring(0.97, springs.snappy);
    triggerFeedback('selection');
  }, [revealed, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  const bg = revealed && isCorrect ? colors.successSoft : revealed && isSelected ? colors.dangerSoft : colors.surface;
  const borderColor = revealed && isCorrect ? colors.success : revealed && isSelected ? colors.danger : colors.border;

  return (
    <AnimatedPressable
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={revealed}
      style={[styles.option, { backgroundColor: bg, borderColor }, animatedStyle]}>
      <Text style={[styles.optionText, { color: colors.text }]}>{text}</Text>
      {revealed && isCorrect ? (
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <Ionicons name="checkmark-circle" size={20} color={colors.success} />
        </Animated.View>
      ) : null}
      {revealed && isSelected && !isCorrect ? (
        <Animated.View entering={ZoomIn.springify().damping(12)}>
          <Ionicons name="close-circle" size={20} color={colors.danger} />
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

export default function QuizScreen() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const { colors } = useTheme();
  const { getProgressFor, recordAttempt } = useQuizStore();
  const recordQuizActivity = useStreakStore((s) => s.recordQuizActivity);
  const showToast = useToastStore((s) => s.show);
  const upgradeToTier = useUpgradeToTier();

  const topicMeta = quizTopicOf(topic ?? '');
  const difficulty = getProgressFor(topic ?? '')?.currentDifficulty ?? 'easy';

  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorActions, setErrorActions] = useState({ showAddKey: false, showUpgrade: false });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    if (!topicMeta) return;
    setLoading(true);
    setError(null);
    generateQuiz(topicMeta.label, difficulty).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        setErrorActions(aiErrorActions(result.error));
        return;
      }
      setQuestion(result.data);
    });
    return () => {
      alive = false;
    };
  }, [topic]);

  function selectOption(index: number) {
    if (selectedIndex !== null || !question || !topic) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    triggerFeedback(isCorrect ? 'success' : 'error');

    const score = isCorrect ? 100 : 0;
    const { mastered } = recordAttempt(topic, score, difficulty);
    const earnedBadges = recordQuizActivity();

    if (mastered) showToast(`🎉 You've mastered ${topicMeta?.label}!`);
    else if (earnedBadges.length) showToast(`${badgeInfo(earnedBadges[0]).icon} Badge earned: ${badgeInfo(earnedBadges[0]).label}`);
    else showToast(score === 100 ? 'Nailed it!' : "Not quite — here's why.");
  }

  if (!topicMeta) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown topic" />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.topicLabel, { color: colors.text3 }]}>
          {topicMeta.label} · {difficulty}
        </Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text3, marginTop: spacing.md }}>Writing your question…</Text>
            <FlappyBirdLoader />
          </View>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title="Couldn't generate a question"
            message={error}
            actionLabel={errorActions.showAddKey ? 'Add your API key' : 'Open Settings'}
            onAction={() => router.push('/settings')}
            secondaryActionLabel={errorActions.showUpgrade ? 'Upgrade' : undefined}
            onSecondaryAction={errorActions.showUpgrade ? () => upgradeToTier('pro') : undefined}
          />
        ) : question ? (
          <>
            <Animated.Text entering={FadeInDown.duration(300).springify().damping(16)} style={[styles.question, { color: colors.text }]}>
              {question.question}
            </Animated.Text>
            <View style={{ gap: spacing.sm }}>
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex;
                const isSelected = i === selectedIndex;
                const revealed = selectedIndex !== null;
                return (
                  <QuizOptionItem
                    key={i}
                    text={opt}
                    index={i}
                    isCorrect={isCorrect}
                    isSelected={isSelected}
                    revealed={revealed}
                    onSelect={() => selectOption(i)}
                  />
                );
              })}
            </View>

            {selectedIndex !== null ? (
              <Animated.View entering={FadeInUp.springify().damping(16)}>
                <Card>
                  <Text style={[styles.explanationLabel, { color: colors.text3 }]}>
                    {selectedIndex === question.correctIndex ? 'Nailed it!' : "Let's clarify"}
                  </Text>
                  <Text style={[styles.explanation, { color: colors.text2 }]}>{question.explanation}</Text>
                  <Text style={[styles.followUp, { color: colors.accent }]}>Next up: {question.followUpTopic}</Text>
                  <View style={{ marginTop: spacing.md }}>
                    <Button label="Back to Learn" fullWidth onPress={() => router.back()} />
                  </View>
                </Card>
              </Animated.View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  topicLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  question: { fontSize: 19, fontWeight: '700', lineHeight: 26 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  optionText: { fontSize: 14, flex: 1 },
  explanationLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  explanation: { fontSize: 13.5, lineHeight: 19, marginTop: spacing.sm },
  followUp: { fontSize: 12.5, fontWeight: '600', marginTop: spacing.sm },
});
