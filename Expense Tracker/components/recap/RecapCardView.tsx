import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import type { Palette } from '@/constants/theme';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { RecapCard, RecapTone } from '@/services/recap/weeklyRecap';

// Bright, solid tone-per-card rather than a gradient — there's no gradient
// library in this project (adding one is a new native dependency needing a
// fresh EAS build, per CLAUDE.md's note on the same tradeoff elsewhere), but
// a rotating set of the palette's own saturated colors already reads as
// distinctly "Wrapped-like" card-to-card. `colors.onAccent` already flips
// light/dark per theme for exactly this kind of bright-background text, so
// reusing it for success/danger/warning too (not just accent) keeps every
// tone readable in both themes for free. Exported so the screen chrome
// (progress bar, close button) can recolor itself against whichever card is
// currently active.
export function toneColors(colors: Palette, tone: RecapTone) {
  switch (tone) {
    case 'success':
      return { bg: colors.success, fg: colors.onAccent, chip: 'rgba(255,255,255,0.2)' };
    case 'danger':
      return { bg: colors.danger, fg: colors.onAccent, chip: 'rgba(255,255,255,0.2)' };
    case 'warning':
      return { bg: colors.warning, fg: colors.onAccent, chip: 'rgba(255,255,255,0.2)' };
    case 'neutral':
      return { bg: colors.surface2, fg: colors.text, chip: colors.surface };
    case 'accent':
    default:
      return { bg: colors.accent, fg: colors.onAccent, chip: 'rgba(255,255,255,0.2)' };
  }
}

export function RecapCardView({ card, isActive }: { card: RecapCard; isActive: boolean }) {
  const { colors } = useTheme();
  const tone = toneColors(colors, card.tone);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  // Driven by the isActive prop rather than a remount-on-focus key — this
  // component stays mounted the whole time (CLAUDE.md §7 rule #3's lesson
  // applies here too: a forced remount to "replay" an entrance would also
  // recreate any touch handling inside it). Re-firing on every isActive
  // flip is what makes the pop-in replay each time a card becomes current,
  // including swiping back to one already seen.
  useEffect(() => {
    if (isActive) {
      opacity.value = withTiming(1, { duration: 260 });
      scale.value = withDelay(40, withSpring(1, { damping: 14, stiffness: 140 }));
    } else {
      opacity.value = 0;
      scale.value = 0.92;
    }
  }, [isActive, opacity, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.card, { backgroundColor: tone.bg }]}>
      <Animated.View style={[styles.inner, animatedStyle]}>
        <View style={[styles.iconChip, { backgroundColor: tone.chip }]}>
          <Ionicons name={card.icon} size={30} color={tone.fg} />
        </View>
        <Text style={[styles.eyebrow, { color: tone.fg }]}>{card.eyebrow}</Text>
        <Text style={[styles.title, { color: tone.fg }]}>{card.title}</Text>
        {card.stat ? <Text style={[styles.stat, { color: tone.fg }]}>{card.stat}</Text> : null}
        {card.statSub ? <Text style={[styles.statSub, { color: tone.fg }]}>{card.statSub}</Text> : null}
        {card.body ? <Text style={[styles.body, { color: tone.fg }]}>{card.body}</Text> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  inner: { alignItems: 'center' },
  iconChip: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  eyebrow: { fontSize: 13, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', opacity: 0.85 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', lineHeight: 32, marginTop: spacing.sm },
  stat: { fontSize: 52, fontWeight: '900', marginTop: spacing.md },
  statSub: { fontSize: 14.5, fontWeight: '600', textAlign: 'center', opacity: 0.9, marginTop: spacing.sm },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center', opacity: 0.95, marginTop: spacing.md },
});
