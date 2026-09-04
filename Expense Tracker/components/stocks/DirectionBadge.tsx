import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Direction } from '@/types/stock';

const LABEL: Record<Direction, string> = { up: 'Up', down: 'Down', flat: 'Flat' };
const ICON: Record<Direction, keyof typeof Ionicons.glyphMap> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'remove-outline',
};

export function DirectionBadge({ direction, size = 'md' }: { direction: Direction; size?: 'sm' | 'md' }) {
  const { colors } = useTheme();
  const color = direction === 'up' ? colors.success : direction === 'down' ? colors.danger : colors.text2;
  const bg = direction === 'up' ? colors.successSoft : direction === 'down' ? colors.dangerSoft : colors.surface2;
  const small = size === 'sm';

  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withSpring(1.12, springs.bouncy),
      withSpring(1, springs.snappy)
    );
  }, [direction, scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Animated.View style={[styles.pill, { backgroundColor: bg }, small && styles.pillSm, animatedStyle]}>
      <Ionicons name={ICON[direction]} size={small ? 12 : 14} color={color} />
      <Text style={[styles.label, { color }, small && styles.labelSm]}>{LABEL[direction]}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  pillSm: { paddingVertical: 3, paddingHorizontal: spacing.sm },
  label: { fontSize: 12.5, fontWeight: '700' },
  labelSm: { fontSize: 11 },
});
