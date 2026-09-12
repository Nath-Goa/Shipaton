import { Ionicons } from '@expo/vector-icons';
import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { springs, triggerFeedback, type SoundCategory } from '@/constants/animations';
import { radius } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  // Most icon buttons are simple navigation/utility actions; pass
  // 'destructive' for trash/remove icons so they get the danger feedback.
  category?: SoundCategory;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function IconButton({ name, onPress, size = 18, category = 'navigation' }: Props) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.9, springs.tap);
    triggerFeedback(category);
  }, [scale, category]);

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
      hitSlop={8}
      style={[
        styles.btn,
        { backgroundColor: colors.surface, borderColor: colors.border },
        animatedStyle,
      ]}>
      <Ionicons name={name} size={size} color={colors.text2} />
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
