import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore, type LearnerLevel } from '@/store/useSettingsStore';

type LevelOption = { value: LearnerLevel; label: string; description: string; icon: keyof typeof Ionicons.glyphMap };

const LEVEL_OPTIONS: LevelOption[] = [
  { value: 'beginner', label: 'Beginner', description: "New to investing, or just getting started.", icon: 'leaf-outline' },
  { value: 'intermediate', label: 'Intermediate', description: 'Know the basics, want to go deeper.', icon: 'trending-up-outline' },
  { value: 'advanced', label: 'Advanced', description: 'Comfortable with charts, ratios, and strategy.', icon: 'trophy-outline' },
  { value: 'professional', label: 'Professional', description: 'Ready for research, portfolios, and real workflows.', icon: 'briefcase-outline' },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function LevelCard({ opt, onChoose }: { opt: LevelOption; onChoose: (level: LearnerLevel) => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = reducedMotion ? 1 : withSpring(0.97, springs.tap);
    triggerFeedback('selection');
  }, [scale, reducedMotion]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => onChoose(opt.value)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, animatedStyle]}>
      <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={opt.icon} size={24} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{opt.label}</Text>
        <Text style={[styles.cardDescription, { color: colors.text3 }]}>{opt.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text3} />
    </AnimatedPressable>
  );
}

export default function LevelSelectScreen() {
  const { colors } = useTheme();
  const selectLevel = useSettingsStore((s) => s.selectLevel);

  function choose(level: LearnerLevel) {
    selectLevel(level);
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>Welcome to Learn</Text>
        <Text style={[styles.title, { color: colors.text }]}>What's your level?</Text>
        <Text style={[styles.subtitle, { color: colors.text2 }]}>
          Your choice opens the matching stage as your recommended starting point. Earlier stages stay available,
          and you can change your level at any time.
        </Text>

        <View style={styles.cards}>
          {LEVEL_OPTIONS.map((opt, i) => (
            <Animated.View key={opt.value} entering={FadeInDown.delay(i * 60).springify().damping(16)}>
              <LevelCard opt={opt} onChoose={choose} />
            </Animated.View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 26, fontWeight: '700', marginTop: spacing.sm, letterSpacing: -0.4 },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: spacing.sm, letterSpacing: trackingFor(13.5) },
  cards: { marginTop: spacing.xl, gap: spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  iconBadge: { width: 44, height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15.5, fontWeight: '700', letterSpacing: trackingFor(15.5) },
  cardDescription: { fontSize: 12, marginTop: 2, lineHeight: 16, letterSpacing: trackingFor(12) },
});
