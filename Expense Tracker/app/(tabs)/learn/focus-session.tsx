import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { triggerFeedback } from '@/constants/animations';
import { bankQuestionsFor } from '@/constants/quizBank';
import { QUIZ_TOPICS, quizTopicOf } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { describeAiError } from '@/services/ai/errorMessage';
import { generateQuiz } from '@/services/ai/learn';
import { useQuizStore } from '@/store/useQuizStore';
import { useStreakStore } from '@/store/useStreakStore';
import type { QuizQuestion } from '@/types/quiz';
import { todayStr } from '@/utils/date';

const SESSION_LENGTH = 5;

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Due topics first, then unseen topics, then whatever's left — a quick
// rapid-fire mix rather than the single most-overdue topic the Learn hub's
// "Next up" card offers.
function pickSessionTopics(topicProgress: ReturnType<typeof useQuizStore.getState>['topicProgress']): string[] {
  const today = todayStr();
  const due = Object.values(topicProgress)
    .filter((p) => !p.mastered && p.nextReviewDate <= today)
    .sort((a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate))
    .map((p) => p.topic);
  const seen = new Set(Object.keys(topicProgress));
  const fresh = QUIZ_TOPICS.filter((t) => !seen.has(t.id)).map((t) => t.id);
  const combined = [...due, ...fresh];
  if (combined.length < SESSION_LENGTH) {
    const rest = QUIZ_TOPICS.map((t) => t.id).filter((id) => !combined.includes(id));
    combined.push(...shuffled(rest));
  }
  return combined.slice(0, SESSION_LENGTH);
}

type Answered = { topic: string; correct: boolean };

export default function FocusSessionScreen() {
  const { colors } = useTheme();
  const { topicProgress, seenBankIndices, recordAttempt, markBankSeen } = useQuizStore();
  const recordQuizActivity = useStreakStore((s) => s.recordQuizActivity);

  const topics = useMemo(() => pickSessionTopics(topicProgress), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answered[]>([]);

  const topic = topics[step];
  const topicMeta = quizTopicOf(topic ?? '');
  const difficulty = topicProgress[topic ?? '']?.currentDifficulty ?? 'easy';

  useEffect(() => {
    if (!topic || !topicMeta) return;
    let alive = true;
    setSelectedIndex(null);
    setError(null);

    const bank = bankQuestionsFor(topic);
    const seen = new Set(seenBankIndices[topic] ?? []);
    const unseen = bank.map((_, i) => i).filter((i) => !seen.has(i));
    if (unseen.length > 0) {
      const idx = unseen[Math.floor(Math.random() * unseen.length)];
      setQuestion(bank[idx]);
      setLoading(false);
      return;
    }

    setLoading(true);
    generateQuiz(topicMeta.label, difficulty).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        return;
      }
      setQuestion(result.data);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function selectOption(index: number) {
    if (selectedIndex !== null || !question || !topic) return;
    setSelectedIndex(index);
    const isCorrect = index === question.correctIndex;
    triggerFeedback(isCorrect ? 'success' : 'error');
    recordAttempt(topic, isCorrect ? 100 : 0, difficulty);
    const bank = bankQuestionsFor(topic);
    const bankIdx = bank.findIndex((b) => b.question === question.question);
    if (bankIdx >= 0) markBankSeen(topic, bankIdx);
    setAnswers((a) => [...a, { topic, correct: isCorrect }]);
  }

  function next() {
    if (step + 1 >= topics.length) {
      recordQuizActivity();
      setStep(step + 1); // moves past the last topic into the summary view
    } else {
      setStep((s) => s + 1);
    }
  }

  const done = step >= topics.length;
  const correctCount = answers.filter((a) => a.correct).length;

  if (done) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.summaryWrap}>
          <Animated.View entering={ZoomIn.springify().damping(14)}>
            <Text style={styles.summaryEmoji}>⚡</Text>
          </Animated.View>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>
            {correctCount}/{topics.length} correct
          </Text>
          <Text style={[styles.summarySub, { color: colors.text3 }]}>Nice focus session — see you next time.</Text>
          <View style={{ marginTop: spacing.xl, gap: spacing.sm, width: '100%' }}>
            <Button label="Back to Learn" fullWidth onPress={() => router.replace('/learn')} />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.progressLabel, { color: colors.text3 }]}>
            {step + 1} / {topics.length}
          </Text>
          {topicMeta ? <PillBadge label={topicMeta.label} /> : null}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <EmptyState icon="⚠️" title="Couldn't load a question" message={error} actionLabel="Skip" onAction={next} />
        ) : question ? (
          <>
            <Text style={[styles.question, { color: colors.text }]}>{question.question}</Text>
            <View style={{ gap: spacing.sm }}>
              {question.options.map((opt, i) => {
                const isCorrect = i === question.correctIndex;
                const isSelected = i === selectedIndex;
                const revealed = selectedIndex !== null;
                const bg = revealed && isCorrect ? colors.successSoft : revealed && isSelected ? colors.dangerSoft : colors.surface;
                const borderColor = revealed && isCorrect ? colors.success : revealed && isSelected ? colors.danger : colors.border;
                return (
                  <Pressable key={i} onPress={() => selectOption(i)} style={[styles.option, { backgroundColor: bg, borderColor }]}>
                    <Text style={[styles.optionText, { color: colors.text }]}>{opt}</Text>
                    {revealed && isCorrect ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
                  </Pressable>
                );
              })}
            </View>

            {selectedIndex !== null ? (
              <Animated.View entering={FadeInDown.springify().damping(16)}>
                <Card>
                  <Text style={[styles.explanation, { color: colors.text2 }]}>{question.explanation}</Text>
                  <View style={{ marginTop: spacing.md }}>
                    <Button label={step + 1 >= topics.length ? 'Finish' : 'Next'} fullWidth onPress={next} />
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  question: { fontSize: 18, fontWeight: '700', lineHeight: 25 },
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
  explanation: { fontSize: 13.5, lineHeight: 19 },
  summaryWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  summaryEmoji: { fontSize: 44 },
  summaryTitle: { fontSize: 24, fontWeight: '700', marginTop: spacing.md },
  summarySub: { fontSize: 13, marginTop: 4 },
});
