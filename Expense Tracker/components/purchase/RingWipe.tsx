import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

// Concentric discs bursting out of one point, one after another, until the
// last one covers the whole screen. The last color should be whatever sits
// underneath once this screen fades away (the app background), so the
// hand-off reads as one continuous motion rather than a cut.

export const RING_DURATION_MS = 560;

type Props = {
  origin: { x: number; y: number };
  colors: string[];
  staggerMs: number;
};

export function ringWipeTotalMs(ringCount: number, staggerMs: number): number {
  return (ringCount - 1) * staggerMs + RING_DURATION_MS;
}

export function RingWipe({ origin, colors, staggerMs }: Props) {
  const { width, height } = useWindowDimensions();
  // Distance to the farthest corner, so the final disc always covers the
  // screen whichever point it grows from.
  const radius = Math.hypot(Math.max(origin.x, width - origin.x), Math.max(origin.y, height - origin.y)) + 4;

  return (
    // Not pointerEvents="none": while it plays, the overlay swallows taps so
    // nothing underneath can start a second navigation.
    <View style={StyleSheet.absoluteFill}>
      {colors.map((color, i) => (
        <Ring key={i} color={color} delay={i * staggerMs} origin={origin} radius={radius} />
      ))}
    </View>
  );
}

function Ring({ color, delay, origin, radius }: { color: string; delay: number; origin: { x: number; y: number }; radius: number }) {
  const scale = useSharedValue(0.001);

  useEffect(() => {
    scale.value = withDelay(delay, withTiming(1, { duration: RING_DURATION_MS, easing: Easing.bezier(0.2, 0, 0, 1) }));
  }, [scale, delay]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          left: origin.x - radius,
          top: origin.y - radius,
          width: radius * 2,
          height: radius * 2,
          borderRadius: radius,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
});
