import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccentColorPicker } from '@/components/settings/AccentColorPicker';
import { ApiKeySection } from '@/components/settings/ApiKeySection';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { isLiveMarketDataConfigured } from '@/services/marketData/marketData';
import { useSettingsStore, type StudyWindow, type ThemeMode } from '@/store/useSettingsStore';

type IconName = keyof typeof Ionicons.glyphMap;

type StepId =
  | 'welcome'
  | 'portfolio'
  | 'learn'
  | 'markets'
  | 'expenses'
  | 'assistant'
  | 'appearance'
  | 'studyTime'
  | 'predictorData'
  | 'aiKey'
  | 'final';

// A full feature tour, not just settings setup — walks through every tab
// before handing off to the appearance/study-time/AI-key/"get started" steps.
const STEP_ORDER: StepId[] = [
  'welcome',
  'portfolio',
  'learn',
  'markets',
  'expenses',
  'assistant',
  'appearance',
  'studyTime',
  'predictorData',
  'aiKey',
  'final',
];

const STUDY_WINDOW_CHOICES: { value: StudyWindow; label: string; icon: IconName }[] = [
  { value: 'morning', label: 'Morning', icon: 'sunny-outline' },
  { value: 'afternoon', label: 'Afternoon', icon: 'partly-sunny-outline' },
  { value: 'evening', label: 'Evening', icon: 'moon-outline' },
  { value: 'night', label: 'Night', icon: 'star-outline' },
];

type FeatureCopy = { icon: IconName; eyebrow: string; title: string; body: string; bullets: string[] };

const FEATURE_COPY: Partial<Record<StepId, FeatureCopy>> = {
  welcome: {
    icon: 'rocket-outline',
    eyebrow: 'Welcome',
    title: 'Learn investing and budgeting, risk-free',
    body: 'A full sandbox in one app: mock stock trading, bite-sized lessons, and real expense tracking. Nothing here touches real money.',
    bullets: [],
  },
  portfolio: {
    icon: 'briefcase-outline',
    eyebrow: 'Portfolio',
    title: 'Trade with $100,000 in paper money',
    body: 'Buy and sell real stock symbols using simulated cash, and track gains, losses, and history exactly like a real brokerage.',
    bullets: [
      'Starts you off with $100,000 mock cash',
      'Buy and sell any listed stock instantly',
      'Multiple portfolios to compare strategies (Max)',
    ],
  },
  learn: {
    icon: 'school-outline',
    eyebrow: 'Learn',
    title: 'Quizzes and real-world scenarios',
    body: 'Sharpen your instincts with AI-generated quizzes and "what would you do?" scenarios, and build a daily streak.',
    bullets: ['Daily streaks with earnable badges', 'Narrative scenarios with real consequences', 'Difficulty adapts to your progress'],
  },
  markets: {
    icon: 'stats-chart-outline',
    eyebrow: 'Markets',
    title: 'Browse, watch, and analyze stocks',
    body: 'Explore live-style charts, star stocks to a watchlist, and get AI pattern detection right on the chart.',
    bullets: ['Live-updating price charts', 'Star stocks to build a watchlist', 'AI backtesting on historical patterns (Max)'],
  },
  expenses: {
    icon: 'receipt-outline',
    eyebrow: 'Expenses',
    title: 'Track real spending alongside your portfolio',
    body: 'Log real expenses, snap a photo of a receipt, set budgets by category, and automate recurring bills.',
    bullets: ['Snap a receipt photo for AI auto-fill', 'Category budgets with live progress', 'Recurring expenses on autopilot'],
  },
  assistant: {
    icon: 'sparkles-outline',
    eyebrow: 'Assistant',
    title: 'Ask the AI analyst anything',
    body: 'Chat with an AI that knows your portfolio and spending — ask "how am I doing?" or "should I diversify?" any time.',
    bullets: [],
  },
};

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function OnboardingScreen() {
  const { colors } = useTheme();
  const completeOnboarding = useSettingsStore((s) => s.completeOnboarding);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const setAccentColor = useSettingsStore((s) => s.setAccentColor);
  const preferredStudyWindow = useSettingsStore((s) => s.preferredStudyWindow);
  const setPreferredStudyWindow = useSettingsStore((s) => s.setPreferredStudyWindow);
  const predictorDataCollection = useSettingsStore((s) => s.predictorDataCollection);
  const setPredictorDataCollection = useSettingsStore((s) => s.setPredictorDataCollection);

  const total = STEP_ORDER.length;
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const progress = useSharedValue((1 / total) * 100);

  const stepId = STEP_ORDER[stepIndex];

  const goTo = useCallback(
    (nextIndex: number, dir: 'forward' | 'backward') => {
      const clamped = Math.max(0, Math.min(total - 1, nextIndex));
      setDirection(dir);
      setStepIndex(clamped);
      progress.value = withTiming(((clamped + 1) / total) * 100, { duration: 260 });
    },
    [progress, total]
  );

  const handleNext = useCallback(() => {
    if (stepIndex === total - 1) {
      completeOnboarding();
      return;
    }
    goTo(stepIndex + 1, 'forward');
  }, [stepIndex, total, completeOnboarding, goTo]);

  const handleBack = useCallback(() => {
    if (stepIndex === 0) return;
    triggerFeedback('navigation');
    goTo(stepIndex - 1, 'backward');
  }, [stepIndex, goTo]);

  const handleSkip = useCallback(() => {
    triggerFeedback('secondary');
    completeOnboarding();
  }, [completeOnboarding]);

  const progressStyle = useAnimatedStyle(() => ({ width: `${progress.value}%` }));

  const entering = direction === 'forward' ? FadeInRight.duration(280) : FadeInLeft.duration(280);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            hitSlop={10}
            onPress={handleBack}
            disabled={stepIndex === 0}
            style={{ opacity: stepIndex === 0 ? 0 : 1 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text2} />
          </Pressable>
          <Pressable hitSlop={10} onPress={handleSkip}>
            <Text style={[styles.skipLabel, { color: colors.text3 }]}>Skip</Text>
          </Pressable>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
          <Animated.View style={[styles.progressFill, { backgroundColor: colors.accent }, progressStyle]} />
        </View>
        <Text style={[styles.stepsLeftLabel, { color: colors.text3 }]}>
          {stepIndex + 1}/{total}
        </Text>
      </View>

      {stepId === 'appearance' ? (
        <Animated.View key={stepId} entering={entering} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Appearance</Text>
          <Text style={[styles.title, { color: colors.text }]}>Make it yours</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            Pick a look — you can change this anytime later in Settings.
          </Text>
          <View style={{ marginTop: spacing.xl, gap: spacing.lg }}>
            <SegmentedControl options={THEME_OPTIONS} value={themeMode} onChange={setThemeMode} />
            <AccentColorPicker value={accentColor} onChange={setAccentColor} />
          </View>
          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={handleNext} />
          </View>
        </Animated.View>
      ) : stepId === 'studyTime' ? (
        <Animated.View key={stepId} entering={entering} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Learning</Text>
          <Text style={[styles.title, { color: colors.text }]}>When are you usually free?</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            The app learns your real habits over time, but this gives it a starting guess for when to nudge you to
            learn — you can turn nudges off anytime in Settings.
          </Text>
          <View style={styles.studyWindowGrid}>
            {STUDY_WINDOW_CHOICES.map((choice) => {
              const active = preferredStudyWindow === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  onPress={() => {
                    triggerFeedback('selection');
                    setPreferredStudyWindow(choice.value);
                  }}
                  style={[
                    styles.studyWindowCard,
                    { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surface },
                    active && { borderWidth: 2 },
                  ]}>
                  <Ionicons name={choice.icon} size={22} color={active ? colors.accent : colors.text2} />
                  <Text style={[styles.studyWindowLabel, { color: colors.text }]}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={handleNext} />
          </View>
        </Animated.View>
      ) : stepId === 'predictorData' ? (
        <Animated.View key={stepId} entering={entering} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>Price predictor</Text>
          <Text style={[styles.title, { color: colors.text }]}>Should it learn from your usage?</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            The app ships with a model trained on 150,000+ samples of real market history. With this on, it
            also records the calls it makes on your device and trains on how they actually turn out. Nothing
            leaves your phone.
          </Text>

          <View style={[styles.predictorWarning, { backgroundColor: colors.surface2 }]}>
            <Ionicons name="warning-outline" size={18} color={colors.warning} />
            <Text style={[styles.predictorWarningText, { color: colors.text2 }]}>
              Be aware this can make predictions <Text style={{ fontWeight: '700' }}>worse</Text>, not just
              better. Learning from a short run of outcomes can pull the model off course. Every launch it
              re-scores 400 samples of market history it never trained on, and if accuracy has dropped
              materially the app switches predictions off entirely until you reset it — so a bad run can leave
              you unable to use the feature at all.
            </Text>
          </View>

          <View style={styles.predictorChoices}>
            {[
              { value: true, label: 'Yes, learn from my usage', hint: 'Recommended — adapts to your market' },
              { value: false, label: 'No, keep it as shipped', hint: 'Never changes; never degrades' },
            ].map((choice) => {
              const active = predictorDataCollection === choice.value;
              return (
                <Pressable
                  key={String(choice.value)}
                  onPress={() => {
                    triggerFeedback('selection');
                    setPredictorDataCollection(choice.value);
                  }}
                  style={[
                    styles.predictorChoice,
                    { borderColor: active ? colors.accent : colors.border, backgroundColor: colors.surface },
                    active && { borderWidth: 2 },
                  ]}>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={19}
                    color={active ? colors.accent : colors.text3}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.predictorChoiceLabel, { color: colors.text }]}>{choice.label}</Text>
                    <Text style={[styles.predictorChoiceHint, { color: colors.text3 }]}>{choice.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={handleNext} />
          </View>
        </Animated.View>
      ) : stepId === 'aiKey' ? (
        <Animated.View key={stepId} entering={entering} style={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>AI analyst</Text>
          <Text style={[styles.title, { color: colors.text }]}>Set up your AI analyst</Text>
          <Text style={[styles.subtitle, { color: colors.text2 }]}>
            Add an API key so &quot;Ask the analyst&quot; and receipt auto-fill can use your own quota. Everything
            else works fully without one — you can always add a key later in Settings.
          </Text>
          <View style={{ marginTop: spacing.xl }}>
            <ApiKeySection showHint={false} />
          </View>
          <View style={styles.actions}>
            <Button label="Continue" fullWidth onPress={handleNext} />
          </View>
        </Animated.View>
      ) : stepId === 'final' ? (
        <Animated.View key={stepId} entering={entering} style={styles.flex}>
          <View style={styles.content}>
            <Text style={[styles.eyebrow, { color: colors.accent }]}>Ready</Text>
            <Text style={[styles.title, { color: colors.text }]}>{TICKERS.length} stocks, ready to trade</Text>
            <Text style={[styles.subtitle, { color: colors.text2 }]}>
              {isLiveMarketDataConfigured()
                ? 'Real symbols, real live prices — start with $100,000 in paper money. No real brokerage, no real risk.'
                : 'Real symbols, simulated prices — start with $100,000 in paper money. No real brokerage, no real risk.'}
            </Text>
          </View>
          <FlatList
            data={TICKERS}
            keyExtractor={(t) => t.symbol}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).springify().damping(16)}>
                <View style={[styles.stockRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.stockSymbol, { color: colors.text }]}>{item.symbol}</Text>
                  <Text style={[styles.stockName, { color: colors.text3 }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.stockSector, { color: colors.text3 }]}>{item.sector}</Text>
                </View>
              </Animated.View>
            )}
          />
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button label="Get started" fullWidth onPress={handleNext} />
          </View>
        </Animated.View>
      ) : (
        <FeatureStep key={stepId} copy={FEATURE_COPY[stepId]!} entering={entering} onNext={handleNext} />
      )}
    </SafeAreaView>
  );
}

function FeatureStep({ copy, entering, onNext }: { copy: FeatureCopy; entering: any; onNext: () => void }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={entering} style={styles.content}>
      <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={copy.icon} size={28} color={colors.accent} />
      </View>
      <Text style={[styles.eyebrow, { color: colors.accent, marginTop: spacing.lg }]}>{copy.eyebrow}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
      <Text style={[styles.subtitle, { color: colors.text2 }]}>{copy.body}</Text>
      {copy.bullets.length > 0 ? (
        <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
          {copy.bullets.map((b) => (
            <View key={b} style={styles.bulletRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              <Text style={[styles.bulletText, { color: colors.text2 }]}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button label="Continue" fullWidth onPress={onNext} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skipLabel: { fontSize: 14, fontWeight: '600' },
  progressTrack: { height: 4, borderRadius: 2, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  stepsLeftLabel: { fontSize: 11.5, fontWeight: '600', marginTop: spacing.sm },
  content: { padding: spacing.xl },
  iconBadge: { width: 56, height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 26, fontWeight: '700', marginTop: spacing.sm, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: spacing.sm },
  studyWindowGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xl },
  studyWindowCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
  },
  studyWindowLabel: { fontSize: 13.5, fontWeight: '700' },
  predictorWarning: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
  },
  predictorWarningText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  predictorChoices: { gap: spacing.sm, marginTop: spacing.lg },
  predictorChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
  },
  predictorChoiceLabel: { fontSize: 14, fontWeight: '700' },
  predictorChoiceHint: { fontSize: 12, marginTop: 2 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bulletText: { fontSize: 13.5, lineHeight: 18, flex: 1 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stockSymbol: { fontSize: 14, fontWeight: '700', width: 56 },
  stockName: { fontSize: 13, flex: 1 },
  stockSector: { fontSize: 11.5 },
  footer: { padding: spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
});
