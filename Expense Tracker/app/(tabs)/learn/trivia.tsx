import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSpring, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { bankQuestionsFor } from '@/constants/quizBank';
import { QUIZ_TOPICS } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { describeAiError } from '@/services/ai/errorMessage';
import { generateQuiz } from '@/services/ai/learn';
import { badgeInfo } from '@/constants/badges';
import { useToastStore } from '@/store/useToastStore';
import { useTriviaStore } from '@/store/useTriviaStore';
import type { QuizQuestion } from '@/types/quiz';
import { hashString, mulberry32 } from '@/utils/prng';
import { todayStr } from '@/utils/date';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Mirrors quiz.tsx's QuizOptionItem — same tab, same "tap an answer" shape,
// so the same instant press-feedback convention applies here too (this
// screen previously had none at all, unlike quiz.tsx).
function TriviaOptionItem({
  text,
  isCorrect,
  isSelected,
  revealed,
  onSelect,
}: {
  text: string;
  isCorrect: boolean;
  isSelected: boolean;
  revealed: boolean;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    if (revealed) return;
    scale.value = reducedMotion ? 1 : withSpring(0.97, springs.tap);
  }, [revealed, scale, reducedMotion]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const bg = revealed && isCorrect ? colors.successSoft : revealed && isSelected ? colors.dangerSoft : colors.surface;
  const borderColor = revealed && isCorrect ? colors.success : revealed && isSelected ? colors.danger : colors.border;

  return (
    <AnimatedPressable
      disabled={revealed}
      onPress={onSelect}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.option, { backgroundColor: bg, borderColor }, animatedStyle]}>
      <Text style={{ color: colors.text, flex: 1, fontSize: 14, letterSpacing: trackingFor(14) }}>{text}</Text>
      {revealed && isCorrect ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
      {revealed && isSelected && !isCorrect ? <Ionicons name="close-circle" size={20} color={colors.danger} /> : null}
    </AnimatedPressable>
  );
}

const ROUND_SIZE = 5;
// Fixed opponent skill — a seeded per-question roll, not a real model call,
// same technique as services/leaderboard/leaderboard.ts's simulated bots.
// Tuned to be a genuine, beatable-but-not-trivial challenge.
const BOT_SKILL = 0.62;

function pickTopics(count: number): string[] {
  const shuffled = [...QUIZ_TOPICS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((t) => t.id);
}

async function loadQuestion(topicId: string): Promise<QuizQuestion | null> {
  const bank = bankQuestionsFor(topicId);
  if (bank.length > 0) return bank[Math.floor(Math.random() * bank.length)];
  const topic = QUIZ_TOPICS.find((t) => t.id === topicId);
  if (!topic) return null;
  const result = await generateQuiz(topic.label, 'medium');
  return result.ok ? result.data : null;
}

function botCorrectFor(index: number): boolean {
  const rand = mulberry32(hashString(`trivia-bot:${todayStr()}:${index}`));
  return rand() < BOT_SKILL;
}

export default function TriviaScreen() {
  const { colors } = useTheme();
  const showToast = useToastStore((s) => s.show);
  const hasPlayedToday = useTriviaStore((s) => s.hasPlayedToday());
  const lastResult = useTriviaStore((s) => s.lastResult);
  const lastYourScore = useTriviaStore((s) => s.lastYourScore);
  const lastBotScore = useTriviaStore((s) => s.lastBotScore);
  const currentStreak = useTriviaStore((s) => s.currentStreak);
  const recordResult = useTriviaStore((s) => s.recordResult);

  const [loading, setLoading] = useState(!hasPlayedToday);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [yourScore, setYourScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const loadRound = useCallback(async () => {
    setLoading(true);
    setError(null);
    const topics = pickTopics(ROUND_SIZE);
    const loaded: QuizQuestion[] = [];
    for (const topicId of topics) {
      const q = await loadQuestion(topicId);
      if (q) loaded.push(q);
    }
    setLoading(false);
    if (loaded.length === 0) {
      setError("Couldn't put together today's round — check your connection or API key in Settings.");
      return;
    }
    setQuestions(loaded);
  }, []);

  useEffect(() => {
    if (!hasPlayedToday) loadRound();
    // Only ever run once on mount — hasPlayedToday is read fresh here, not depended on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectOption(optIndex: number) {
    if (selected !== null) return;
    setSelected(optIndex);
    const question = questions[index];
    const youCorrect = optIndex === question.correctIndex;
    const botDidWell = botCorrectFor(index);
    triggerFeedback(youCorrect ? 'success' : 'error');
    if (youCorrect) setYourScore((s) => s + 1);
    if (botDidWell) setBotScore((s) => s + 1);
  }

  function handleNext() {
    if (index + 1 >= questions.length) {
      const finalYour = yourScore;
      const finalBot = botScore;
      const result = finalYour > finalBot ? 'win' : finalYour < finalBot ? 'loss' : 'tie';
      const earned = recordResult(result, finalYour, finalBot);
      if (earned.length) showToast(`${badgeInfo(earned[0]).icon} Badge earned: ${badgeInfo(earned[0]).label}`);
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  }

  if (hasPlayedToday && !finished) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ fontSize: 40 }}>{lastResult === 'win' ? '🏆' : lastResult === 'tie' ? '🤝' : '🤖'}</Text>
          <Text style={[styles.finishedTitle, { color: colors.text }]}>
            {lastResult === 'win' ? 'You won today!' : lastResult === 'tie' ? "Today was a tie" : 'The bot won today'}
          </Text>
          <Text style={{ color: colors.text2, marginTop: spacing.sm }}>
            You {lastYourScore} — {lastBotScore} Bot
          </Text>
          {currentStreak > 1 ? (
            <Text style={{ color: colors.accent, marginTop: spacing.sm, fontWeight: '700' }}>🔥 {currentStreak}-win streak</Text>
          ) : null}
          <Text style={{ color: colors.text3, marginTop: spacing.lg, fontSize: 12.5, letterSpacing: trackingFor(12.5), textAlign: 'center' }}>
            Come back tomorrow for a new round.
          </Text>
          <View style={{ marginTop: spacing.xl, width: '100%' }}>
            <Button label="Back to Learn" fullWidth variant="ghost" onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  if (finished) {
    const result = yourScore > botScore ? 'win' : yourScore < botScore ? 'loss' : 'tie';
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Animated.Text entering={ZoomIn.springify().damping(12)} style={{ fontSize: 48 }}>
            {result === 'win' ? '🏆' : result === 'tie' ? '🤝' : '🤖'}
          </Animated.Text>
          <Text style={[styles.finishedTitle, { color: colors.text }]}>
            {result === 'win' ? 'You beat the bot!' : result === 'tie' ? "It's a tie" : 'The bot got you this time'}
          </Text>
          <Text style={{ color: colors.text2, marginTop: spacing.sm, fontSize: 16, fontWeight: '600', letterSpacing: trackingFor(16) }}>
            You {yourScore} — {botScore} Bot
          </Text>
          {currentStreak > 1 ? (
            <Text style={{ color: colors.accent, marginTop: spacing.sm, fontWeight: '700' }}>🔥 {currentStreak}-win streak</Text>
          ) : null}
          <View style={{ marginTop: spacing.xl, width: '100%' }}>
            <Button label="Back to Learn" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.text3, marginTop: spacing.md }}>Setting up today's round…</Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={styles.center}>
          <Text style={{ color: colors.danger, textAlign: 'center' }}>{error}</Text>
          <Button label="Try again" variant="ghost" onPress={loadRound} />
        </View>
      </Screen>
    );
  }

  const question = questions[index];
  if (!question) return null;
  const revealed = selected !== null;
  const botDidWell = revealed ? botCorrectFor(index) : false;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <PillBadge label={`Question ${index + 1}/${questions.length}`} />
          <Text style={{ color: colors.text2, fontWeight: '700' }}>
            You {yourScore} — {botScore} Bot
          </Text>
        </View>

        <Animated.Text entering={FadeInDown.duration(300).springify().damping(16)} style={[styles.question, { color: colors.text }]}>
          {question.question}
        </Animated.Text>

        <View style={{ gap: spacing.sm }}>
          {question.options.map((opt, i) => (
            <TriviaOptionItem
              key={i}
              text={opt}
              isCorrect={i === question.correctIndex}
              isSelected={i === selected}
              revealed={revealed}
              onSelect={() => selectOption(i)}
            />
          ))}
        </View>

        {revealed ? (
          <Animated.View entering={FadeInUp.springify().damping(16)}>
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ color: colors.text2, fontSize: 13.5, lineHeight: 19, letterSpacing: trackingFor(13.5) }}>{question.explanation}</Text>
              <View style={[styles.botRow, { borderColor: colors.border }]}>
                <Ionicons name="hardware-chip-outline" size={16} color={colors.text3} />
                <Text style={{ color: colors.text2, fontSize: 12.5, flex: 1, letterSpacing: trackingFor(12.5) }}>
                  The bot {botDidWell ? 'got it right' : 'got it wrong'} on this one.
                </Text>
              </View>
              <Button label={index + 1 >= questions.length ? 'See results' : 'Next question'} fullWidth onPress={handleNext} />
            </Card>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  finishedTitle: { fontSize: 19, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center', letterSpacing: trackingFor(19) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  question: { fontSize: 18, fontWeight: '700', lineHeight: 25, letterSpacing: trackingFor(18) },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  botRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
});
