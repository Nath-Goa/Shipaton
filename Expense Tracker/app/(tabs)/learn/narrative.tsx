import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { LoadingGame } from '@/components/games/LoadingGame';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { badgeInfo } from '@/constants/badges';
import { springs, triggerFeedback } from '@/constants/animations';
import { QUIZ_TOPICS } from '@/constants/quizTopics';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError, aiErrorActions } from '@/services/ai/errorMessage';
import { generateNarrative } from '@/services/ai/learn';
import { useActivePortfolio } from '@/store/usePortfolioStore';
import { useStreakStore } from '@/store/useStreakStore';
import { useToastStore } from '@/store/useToastStore';
import type { NarrativeScenario } from '@/types/narrative';
import type { ScenarioType } from '@/types/narrative';
import { money } from '@/utils/money';

const SCENARIO_TYPES: ScenarioType[] = ['market_crash', 'earnings_surprise', 'sector_rotation', 'individual_stock'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function matchingTopic(lessonTopics: string[]): (typeof QUIZ_TOPICS)[number] | undefined {
  const haystack = lessonTopics.join(' ').toLowerCase();
  return QUIZ_TOPICS.find((t) => haystack.includes(t.label.toLowerCase()) || haystack.includes(t.id.replace(/_/g, ' ')));
}

function NarrativeOptionItem({
  opt,
  isChosen,
  revealed,
  onChoose,
}: {
  opt: NarrativeScenario['options'][number];
  isChosen: boolean;
  revealed: boolean;
  onChoose: () => void;
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

  return (
    <AnimatedPressable
      onPress={onChoose}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={revealed}
      style={[
        styles.option,
        {
          borderColor: isChosen ? colors.accent : colors.border,
          backgroundColor: isChosen ? colors.accentSoft : colors.surface,
        },
        animatedStyle,
      ]}>
      <View style={styles.optionHead}>
        <PillBadge label={opt.choice} />
        <Text style={[styles.optionAction, { color: colors.text }]}>{opt.action}</Text>
      </View>
      {revealed ? (
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.outcomeWrap}>
          <Text style={[styles.outcomeLabel, { color: colors.text3 }]}>What happened</Text>
          <Text style={[styles.outcomeText, { color: colors.text2 }]}>{opt.outcome}</Text>
          <Text style={[styles.outcomeLabel, { color: colors.text3, marginTop: spacing.sm }]}>The lesson</Text>
          <Text style={[styles.outcomeText, { color: colors.text2 }]}>{opt.learning}</Text>
        </Animated.View>
      ) : null}
    </AnimatedPressable>
  );
}

export default function NarrativeScreen() {
  const { colors } = useTheme();
  const { holdings } = useActivePortfolio();
  const recordNarrativeCompleted = useStreakStore((s) => s.recordNarrativeCompleted);
  const showToast = useToastStore((s) => s.show);
  const upgradeToTier = useUpgradeToTier();

  const [scenario, setScenario] = useState<NarrativeScenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorActions, setErrorActions] = useState({ showAddKey: false, showUpgrade: false });
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);

  const portfolioContext = useMemo(() => {
    const positions = Object.values(holdings);
    if (positions.length === 0) return undefined;
    return positions.map((h) => `${h.symbol}: ${h.qty} shares at ${money(h.avgCost)} avg`).join('; ');
  }, [holdings]);

  useEffect(() => {
    let alive = true;
    const scenarioType = SCENARIO_TYPES[Math.floor(Math.random() * SCENARIO_TYPES.length)];
    setLoading(true);
    setError(null);
    generateNarrative(scenarioType, 'medium', portfolioContext).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        setErrorActions(aiErrorActions(result.error));
        return;
      }
      setScenario(result.data);
    });
    return () => {
      alive = false;
    };
  }, []);

  function choose(index: number) {
    if (chosenIndex !== null) return;
    triggerFeedback('primary');
    setChosenIndex(index);
    const earned = recordNarrativeCompleted();
    if (earned.length) showToast(`${badgeInfo(earned[0]).icon} Badge earned: ${badgeInfo(earned[0]).label}`);
  }

  const chosenTopic = scenario && chosenIndex !== null ? matchingTopic(scenario.options[chosenIndex].lessonTopics) : undefined;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.text3, marginTop: spacing.md }}>Setting the scene…</Text>
            <LoadingGame />
          </View>
        ) : error ? (
          <EmptyState
            icon="⚠️"
            title="Couldn't generate a scenario"
            message={error}
            actionLabel={errorActions.showAddKey ? 'Add your API key' : 'Open Settings'}
            onAction={() => router.push('/settings')}
            secondaryActionLabel={errorActions.showUpgrade ? 'Upgrade' : undefined}
            onSecondaryAction={errorActions.showUpgrade ? () => upgradeToTier('pro') : undefined}
          />
        ) : scenario ? (
          <>
            <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
              <Text style={[styles.title, { color: colors.text }]}>{scenario.title}</Text>
              <Text style={[styles.setup, { color: colors.text2 }]}>{scenario.setup}</Text>
            </Animated.View>

            <View style={{ gap: spacing.sm }}>
              {scenario.options.map((opt, i) => (
                <NarrativeOptionItem
                  key={opt.choice}
                  opt={opt}
                  isChosen={i === chosenIndex}
                  revealed={chosenIndex !== null}
                  onChoose={() => choose(i)}
                />
              ))}
            </View>

            {chosenIndex !== null ? (
              <Animated.View entering={FadeInUp.springify().damping(16)}>
                <Card>
                  <Text style={[styles.nextAction, { color: colors.text2 }]}>{scenario.nextAction}</Text>
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    {chosenTopic ? (
                      <Button
                        label={`Practice: ${chosenTopic.label}`}
                        onPress={() => router.replace({ pathname: '/learn/quiz', params: { topic: chosenTopic.id } })}
                      />
                    ) : null}
                    <Button label="Back to Learn" variant="ghost" fullWidth onPress={() => router.back()} />
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
  loadingWrap: { alignItems: 'center', paddingVertical: spacing.xxl },
  title: { fontSize: 20, fontWeight: '700' },
  setup: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  option: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionAction: { fontSize: 14, fontWeight: '600', flex: 1 },
  outcomeWrap: { marginTop: 2 },
  outcomeLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  outcomeText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  nextAction: { fontSize: 13.5, lineHeight: 19 },
});
