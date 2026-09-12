import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

import { Text } from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The +/- quantity button used on both trade screens (real and practice) —
// identical press-scale behavior and styling on both.
export function QtyStepperButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  function handlePressIn() {
    scale.value = withSpring(0.88, springs.tap);
    triggerFeedback('selection');
  }

  function handlePressOut() {
    scale.value = withSpring(1, springs.tap);
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.qtyBtn, { borderColor: colors.border }, animatedStyle]}>
      <Text style={[styles.qtyBtnText, { color: colors.text }]}>{label}</Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  qtyBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 20, fontWeight: '600' },
});
