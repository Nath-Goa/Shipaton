import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { Button } from './Button';

type Props = {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
};

export function EmptyState({
  icon = '📭',
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: Props) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(0);

  useEffect(() => {
    // A single float up-down (1.4s total) rather than an endless loop —
    // decorative animations here are capped at ~2s and then hold static.
    // Skipped entirely under reduced motion.
    if (reducedMotion) return;
    translateY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 700 }),
        withTiming(0, { duration: 700 })
      ),
      1,
      true
    );
  }, [translateY, reducedMotion]);

  const floatStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View entering={FadeIn.duration(350)} style={styles.wrap}>
      <Animated.View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.surface2, borderColor: colors.border },
          floatStyle,
        ]}>
        <Text style={styles.icon}>{icon}</Text>
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.text3 }]}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.md, gap: spacing.sm, alignItems: 'center' }}>
          <Button label={actionLabel} variant="ghost" onPress={onAction} />
          {secondaryActionLabel && onSecondaryAction ? (
            <Button label={secondaryActionLabel} variant="ghost" onPress={onSecondaryAction} />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: 6,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  icon: { fontSize: 26, letterSpacing: trackingFor(26) },
  title: { fontSize: 15, letterSpacing: trackingFor(15), fontWeight: '600', textAlign: 'center', maxWidth: 280, flexShrink: 1 },
  message: { fontSize: 13, letterSpacing: trackingFor(13), textAlign: 'center', maxWidth: 280, lineHeight: 18 },
});
