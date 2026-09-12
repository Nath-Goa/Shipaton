import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  label: string;
  active?: boolean;
  onPress?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Chip({ label, active, onPress }: Props) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withSequence(
        withSpring(1.08, springs.bouncy),
        withSpring(1, springs.snappy)
      );
    }
  }, [active, scale]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.92, springs.tap);
    triggerFeedback('selection');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.chip,
        {
          backgroundColor: active ? colors.accent : colors.surface2,
          borderColor: active ? colors.accent : colors.border,
        },
        animatedStyle,
      ]}>
      <Text style={[styles.label, { color: active ? colors.onAccent : colors.text2 }]} numberOfLines={1}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    // The pill hugs its label's *measured* width — at a larger device font
    // size the actually-rendered text can come out wider than what got
    // measured, and with nothing here to contain it, the overflow used to
    // paint straight past this pill's own edge and into the next chip in
    // the row, eating its first few letters ("Last 30 days" read as "t 30
    // days"). overflow: 'hidden' keeps any overflow inside this chip's own
    // rounded bounds instead of bleeding onto its neighbor; numberOfLines
    // on the label below is what makes that overflow ellipsize cleanly
    // rather than clip mid-word with nothing to show it was cut.
    overflow: 'hidden',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
