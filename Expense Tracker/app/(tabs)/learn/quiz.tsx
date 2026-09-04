import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
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
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { badgeInfo } from '@/constants/badges';
import { springs, triggerFeedback } from '@/constants/animations';
import { bankQuestionsFor } from '@/constants/quizBank';
import { quizTopicOf } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError, aiErrorActions } from '@/services/ai/errorMessage';
import { generateQuiz } from '@/services/ai/learn';
import { awardCourseCompletionBadges } from '@/utils/courseBadges';
import { courseOf } from '@/constants/courses';
import { useCourseStore } from '@/store/useCourseStore';
import { useQuizStore } from '@/store/useQuizStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { Difficulty, QuizHistoryEntry, QuizQuestion, QuizSource } from '@/types/quiz';
import { timeAgo } from '@/utils/date';
import { uid } from '@/utils/id';

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
  const { topic, mode, fromCourse } = useLocalSearchParams<{ topic: string; mode?: string; fromCourse?: string }>();
  const isMastery = mode === 'mastery';
  const { colors } = useTheme();
  const { getProgressFor, recordAttempt, seenBankIndices, markBankSeen, history, addHistoryEntry, clearHistory } = useQuizStore();
  const recordQuizActivity = useStreakStore((s) => s.recordQuizActivity);
  const completeSubpart = useCourseStore((s) => s.completeSubpart);
  const showToast = useToastStore((s) => s.show);
  const upgradeToTier = useUpgradeToTier();

  const topicMeta = quizTopicOf(topic ?? '');
  // A course's mastery check always targets a hard question — the store's
  // own regular spaced-repetition difficulty ladder is used for a normal
  // course "quiz" subpart, same as the free-form Learn hub flow.
  const adaptiveDifficulty = isMastery ? 'hard' : (getProgressFor(topic ?? '')?.currentDifficulty ?? 'easy');

  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [questionDifficulty, setQuestionDifficulty] = useState<Difficulty>('easy');
  const [source, setSource] = useState<QuizSource>('bank');
  const [bankIndex, setBankIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorActions, setErrorActions] = useState({ showAddKey: false, showUpgrade: false });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const loadQuestion = useCallback(
    async (forceAi: boolean) => {
      if (!topicMeta || !topic) return;
      setSelectedIndex(null);
      setError(null);

      if (!forceAi) {
        const bank = bankQuestionsFor(topic);
        const seen = new Set(seenBankIndices[topic] ?? []);
        let unseen = bank.map((_, i) => i).filter((i) => !seen.has(i));
        // A course's mastery check always wants a hard question, not
        // whatever random unseen bank entry comes up.
        if (isMastery) unseen = unseen.filter((i) => bank[i].difficulty === 'hard');
        if (unseen.length > 0) {
          const idx = unseen[Math.floor(Math.random() * unseen.length)];
          setQuestion(bank[idx]);
          setQuestionDifficulty(bank[idx].difficulty);
          setSource('bank');
          setBankIndex(idx);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      setSource('ai');
      setBankIndex(null);
      setQuestionDifficulty(adaptiveDifficulty);
      const result = await generateQuiz(topicMeta.label, adaptiveDifficulty);
      setLoading(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        setErrorActions(aiErrorActions(result.error));
        return;
      }
      setQuestion(result.data);
    },
    [topic, topicMeta, adaptiveDifficulty, seenBankIndices, isMastery]
  );

  useEffect(() => {
    loadQuestion(false);
    // Only re-run when the topic itself changes — loadQuestion is
    // deliberately not a dep here (it's recreated each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  function selectOption(index: number) {
    if (selectedIndex !== null || !question || !topic) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    triggerFeedback(isCorrect ? 'success' : 'error');

    const score = isCorrect ? 100 : 0;
    // Always advance the spaced-repetition ladder using the store's own
    // tracked difficulty — a bank question's difficulty tag is only a
    // display label (bank picks are random, not difficulty-gated), so
    // feeding it into recordAttempt would let one lucky/unlucky bank pull
    // jump the ladder out of step with the "3 in a row" progression rule.
    const { mastered } = recordAttempt(topic, score, adaptiveDifficulty);
    const earnedBadges = recordQuizActivity();

    if (source === 'bank' && bankIndex !== null) markBankSeen(topic, bankIndex);
    addHistoryEntry(topic, {
      id: uid(),
      question: question.question,
      options: question.options,
      correctIndex: question.correctIndex,
      selectedIndex: index,
      explanation: question.explanation,
      difficulty: questionDifficulty,
      source,
      createdAt: Date.now(),
    });

    // A course's "quiz" subpart just needs an honest attempt to move on —
    // matches flashcards' looser "seen it" completion. The "mastery" subpart
    // is stricter: only a correct answer on a hard question counts.
    let courseBadges: string[] = [];
    if (fromCourse && !isMastery) {
      completeSubpart(fromCourse, 'quiz');
    } else if (fromCourse && isMastery && isCorrect) {
      const { courseCompleted } = completeSubpart(fromCourse, 'mastery');
      if (courseCompleted) courseBadges = awardCourseCompletionBadges(fromCourse);
    }

    if (mastered) showToast(`🎉 You've mastered ${topicMeta?.label}!`);
    else if (courseBadges.length) showToast(`${badgeInfo(courseBadges[0]).icon} Badge earned: ${badgeInfo(courseBadges[0]).label}`);
    else if (earnedBadges.length) showToast(`${badgeInfo(earnedBadges[0]).icon} Badge earned: ${badgeInfo(earnedBadges[0]).label}`);
    else if (isMastery && !isCorrect) showToast("Not quite — that's a hard one. Try again!");
    else showToast(score === 100 ? 'Nailed it!' : "Not quite — here's why.");
  }

  const topicHistory = history[topic ?? ''] ?? [];

  if (!topicMeta) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <EmptyState icon="❓" title="Unknown topic" />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <TopBar
        title={topicMeta.label}
        right={<IconButton name="time-outline" onPress={() => setHistoryOpen(true)} />}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topicRow}>
          <Text style={[styles.topicLabel, { color: colors.text3 }]}>
            {topicMeta.label} · {questionDifficulty}
          </Text>
          <PillBadge label={isMastery ? 'Mastery check' : source === 'bank' ? 'Built-in' : 'AI-generated'} />
        </View>

        {!loading && question ? (
          <Pressable onPress={() => loadQuestion(true)} hitSlop={6}>
            <Text style={[styles.aiLink, { color: colors.accent }]}>
              🤖 {source === 'bank' ? 'Prefer AI? Generate one instead' : 'Generate another with AI'}
            </Text>
          </Pressable>
        ) : null}

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
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    {!(isMastery && selectedIndex === question.correctIndex) ? (
                      <Button label="Another question" fullWidth variant="ghost" onPress={() => loadQuestion(false)} />
                    ) : null}
                    <Button label={fromCourse ? 'Back to course' : 'Back to Learn'} fullWidth onPress={() => router.back()} />
                  </View>
                </Card>
              </Animated.View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <QuizHistoryModal
        visible={historyOpen}
        entries={topicHistory}
        onClose={() => setHistoryOpen(false)}
        onClear={() => topic && clearHistory(topic)}
      />
    </Screen>
  );
}

function QuizHistoryModal({
  visible,
  entries,
  onClose,
  onClear,
}: {
  visible: boolean;
  entries: QuizHistoryEntry[];
  onClose: () => void;
  onClear: () => void;
}) {
  const { colors } = useTheme();
  const rows = useMemo(() => [...entries].reverse(), [entries]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(180)} style={styles.modalBackdrop}>
        {/* Entrance animation on this plain, non-touchable Animated.View —
            never on a Pressable. A Reanimated `entering=` view can drop the
            first tap or two while it's still settling, so the dismiss-on-tap
            area is a separate absolute-fill Pressable instead. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View entering={FadeInDown.springify().damping(18)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.surface }]}
            onPress={(e: any) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Quiz history</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {rows.length === 0 ? (
                <Text style={[styles.historyEmpty, { color: colors.text3 }]}>No attempts yet for this topic.</Text>
              ) : (
                rows.map((entry) => {
                  const isCorrect = entry.selectedIndex === entry.correctIndex;
                  return (
                    <View key={entry.id} style={[styles.historyRow, { borderColor: colors.border }]}>
                      <Ionicons
                        name={isCorrect ? 'checkmark-circle' : 'close-circle'}
                        size={18}
                        color={isCorrect ? colors.success : colors.danger}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyLabel, { color: colors.text }]} numberOfLines={2}>
                          {entry.question}
                        </Text>
                        <Text style={[styles.historyPreview, { color: colors.text3 }]}>
                          {entry.source === 'bank' ? 'Built-in' : 'AI-generated'} · {entry.difficulty} · {timeAgo(entry.createdAt)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {rows.length > 0 ? (
                <View style={{ flex: 1 }}>
                  <Button label="Clear" variant="ghost" fullWidth onPress={onClear} />
                </View>
              ) : null}
              <View style={{ flex: 1 }}>
                <Button label="Close" variant="ghost" fullWidth onPress={onClose} />
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  topicRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topicLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  aiLink: { fontSize: 12.5, fontWeight: '600' },
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
  modalBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  modalSheet: { padding: spacing.xl, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.md },
  modalTitle: { fontSize: 19, fontWeight: '700' },
  historyEmpty: { fontSize: 13, textAlign: 'center', paddingVertical: spacing.xl },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  historyLabel: { fontSize: 13.5, fontWeight: '600' },
  historyPreview: { fontSize: 11.5, marginTop: 3 },
});
