import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import type { Quote } from '@/types/stock';
import { gestureIntent, rubberband } from '@/utils/motion';
import { money, signedPct } from '@/utils/money';

// Swipe-commit threshold and the hard drag clamp it sits inside — the clamp
// also doubles as `rubberband`'s dimension, so the "give" past it scales
// with the row's own drag range instead of being imperceptibly tiny.
const SWIPE_CLAMP = 70;
const SWIPE_COMMIT = 62;

type Props = {
  symbol: string;
  name: string;
  quote?: Quote;
  onPress?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function StockListItem({ symbol, name, quote, onPress, onSwipeLeft, onSwipeRight }: Props) {
  const { colors } = useTheme();
  const up = (quote?.changePct ?? 0) >= 0;
  const changeColor = up ? colors.success : colors.danger;

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const prevPriceRef = useRef(quote?.price);

  useEffect(() => {
    if (quote?.price && prevPriceRef.current && quote.price !== prevPriceRef.current) {
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 150 }),
        withTiming(0, { duration: 600 })
      );
    }
    prevPriceRef.current = quote?.price;
  }, [quote?.price, flashOpacity]);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, springs.snappy);
    triggerFeedback('navigation');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }, { scale: scale.value }],
    };
  });

  const flashStyle = useAnimatedStyle(() => {
    return {
      opacity: flashOpacity.value,
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
      style={[
        styles.row,
        { borderBottomColor: colors.border },
        animatedStyle,
      ]}>
      {/* Subtle live price tick flash background */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: up ? colors.successSoft : colors.dangerSoft,
            borderRadius: radius.sm,
          },
          flashStyle,
        ]}
      />
      <View style={[styles.avatar, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
        <Text style={[styles.avatarText, { color: colors.text2 }]}>{symbol.slice(0, 2)}</Text>
      </View>
      <View style={styles.main}>
        <Text style={[styles.symbol, { color: colors.text }]} numberOfLines={1}>
          {symbol}
        </Text>
        <Text style={[styles.name, { color: colors.text3 }]} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <View style={styles.priceWrap}>
        <Text style={[styles.price, { color: colors.text }]}>{money(quote?.price ?? 0)}</Text>
        <Text style={[styles.change, { color: changeColor }]}>{signedPct(quote?.changePct ?? 0)}</Text>
      </View>
    </AnimatedPressable>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 11, fontWeight: '700' },
  main: { flex: 1, minWidth: 0 },
  symbol: { fontSize: 14.5, fontWeight: '700' },
  name: { fontSize: 12.5, marginTop: 1 },
  priceWrap: { alignItems: 'flex-end' },
  price: { fontSize: 14.5, fontWeight: '600' },
  change: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
});
