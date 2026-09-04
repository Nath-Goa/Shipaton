import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useSettingsStore, type LearnerLevel } from '@/store/useSettingsStore';

type LevelOption = { value: LearnerLevel; label: string; description: string; icon: keyof typeof Ionicons.glyphMap };

const LEVEL_OPTIONS: LevelOption[] = [
  { value: 'beginner', label: 'Beginner', description: "New to investing, or just getting started.", icon: 'leaf-outline' },
  { value: 'intermediate', label: 'Intermediate', description: 'Know the basics, want to go deeper.', icon: 'trending-up-outline' },
  { value: 'advanced', label: 'Advanced', description: 'Comfortable with charts, ratios, and strategy.', icon: 'trophy-outline' },
];

export default function LevelSelectScreen() {
  const { colors } = useTheme();
  const selectLevel = useSettingsStore((s) => s.selectLevel);

  function choose(level: LearnerLevel) {
    triggerFeedback('selection');
    selectLevel(level);
    router.back();
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.accent }]}>Welcome to Learn</Text>
        <Text style={[styles.title, { color: colors.text }]}>What's your level?</Text>
        <Text style={[styles.subtitle, { color: colors.text2 }]}>
          Everyone starts at Beginner, Stage 1 for now — your answer is saved to personalize the path later, but
          course progress starts the same for everyone today.
        </Text>

        <View style={styles.cards}>
          {LEVEL_OPTIONS.map((opt, i) => (
            <Animated.View key={opt.value} entering={FadeInDown.delay(i * 60).springify().damping(16)}>
              <Pressable
                onPress={() => choose(opt.value)}
                style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name={opt.icon} size={24} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{opt.label}</Text>
                  <Text style={[styles.cardDescription, { color: colors.text3 }]}>{opt.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text3} />
              </Pressable>
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
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: spacing.sm },
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
  cardTitle: { fontSize: 15.5, fontWeight: '700' },
  cardDescription: { fontSize: 12, marginTop: 2, lineHeight: 16 },
});
