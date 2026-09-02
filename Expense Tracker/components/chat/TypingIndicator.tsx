import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

function PulsingDot({ delay }: { delay: number }) {
  const { colors } = useTheme();
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 300 }),
          withTiming(0, { duration: 300 }),
          withTiming(0, { duration: 400 })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300 }),
          withTiming(0.4, { duration: 300 }),
          withTiming(0.4, { duration: 400 })
        ),
        -1,
        false
      )
    );
  }, [delay, translateY, opacity]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, animatedStyle]} />;
}

export function TypingIndicator() {
  const { colors } = useTheme();

  return (
    <Animated.View
      entering={FadeInUp.springify().damping(16)}
      style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <PulsingDot delay={0} />
      <PulsingDot delay={180} />
      <PulsingDot delay={360} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderTopLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
