import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { categoryOf } from '@/constants/categories';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Expense } from '@/types/expense';
import { gestureIntent, rubberband } from '@/utils/motion';
import { money } from '@/utils/money';

// Swipe-commit threshold and the hard drag clamp it sits inside — the clamp
// also doubles as `rubberband`'s dimension, so the "give" past it scales
// with the row's own drag range instead of being imperceptibly tiny.
const SWIPE_CLAMP = 82;
const SWIPE_COMMIT = 70;

type Props = {
  expense: Expense;
  onPress?: () => void;
  onLongPress?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ExpenseListItem({ expense, onPress, onLongPress, onSwipeLeft, onSwipeRight }: Props) {
  const { colors } = useTheme();
  const cat = categoryOf(expense.category);
  const categoryLabel = expense.category === 'other' && expense.customCategoryLabel ? expense.customCategoryLabel : cat.label;
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, springs.tap);
    triggerFeedback('navigation');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.tap);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }, { scale: scale.value }],
    };
  });

  const swipe = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      const raw = event.translationX;
      translateX.value =
        raw < -SWIPE_CLAMP
          ? -SWIPE_CLAMP - rubberband(-raw - SWIPE_CLAMP, SWIPE_CLAMP)
          : raw > SWIPE_CLAMP
            ? SWIPE_CLAMP + rubberband(raw - SWIPE_CLAMP, SWIPE_CLAMP)
            : raw;
    })
    .onEnd((event) => {
      // Position blended with velocity (same 0.12 weighting SlidingTabs'
      // own swipe already uses) — a fast flick can now commit the action
      // even short of the pure-position threshold, previously ignored
      // entirely.
      const intent = gestureIntent(event.translationX, event.velocityX);
      if (intent < -SWIPE_COMMIT && onSwipeLeft) runOnJS(onSwipeLeft)();
      if (intent > SWIPE_COMMIT && onSwipeRight) runOnJS(onSwipeRight)();
      translateX.value = withSpring(0, { ...springs.snappy, velocity: event.velocityX });
    });

  return (
    <GestureDetector gesture={swipe}>
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={() => {
        triggerFeedback('secondary');
        onLongPress?.();
      }}
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        animatedStyle,
      ]}>
      {expense.photoUri ? (
        <Image source={{ uri: expense.photoUri }} style={styles.photo} />
      ) : (
        <View style={[styles.icon, { backgroundColor: `${cat.color}26`, borderColor: `${cat.color}4D` }]}>
          <Text style={styles.iconText}>{cat.icon}</Text>
        </View>
      )}
      <View style={styles.main}>
        <View style={styles.descRow}>
          <Text style={[styles.desc, { color: colors.text }]} numberOfLines={1}>
            {expense.desc || categoryLabel}
          </Text>
          {expense.recurring ? <Ionicons name="repeat" size={13} color={colors.text3} /> : null}
        </View>
        <Text style={[styles.meta, { color: colors.text3 }]} numberOfLines={1}>
          <Text style={{ color: cat.color, fontWeight: '600' }}>{categoryLabel}</Text>
        </Text>
      </View>
      <Text style={[styles.amount, { color: colors.text }]}>{money(expense.amount)}</Text>
    </AnimatedPressable>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 17 },
  photo: { width: 38, height: 38, borderRadius: radius.sm },
  main: { flex: 1, minWidth: 0 },
  descRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  desc: { fontSize: 14.5, fontWeight: '500', flexShrink: 1 },
  meta: { fontSize: 12.5, marginTop: 1 },
  amount: { fontSize: 15, fontWeight: '600' },
});
