import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

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
    scale.value = withSpring(0.92, springs.snappy);
    triggerFeedback('selection');
  }, [scale]);

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
      <Text style={[styles.label, { color: active ? colors.onAccent : colors.text2 }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '600',
  },
});
