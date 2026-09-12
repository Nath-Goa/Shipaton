import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedProps, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { material } from '@/constants/materials';
import { useTheme } from '@/hooks/useTheme';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

type Props = {
  /** A shared value fed by the scrolling list's useAnimatedScrollHandler. */
  scrollY: SharedValue<number>;
  height?: number;
  /** Scroll distance (px) over which the edge ramps from invisible to full. */
  fadeDistance?: number;
};

// A soft edge where floating chrome overlaps scrolling content, instead of a
// hard 1px divider — per the apple-design skill's "scroll edge effects, not
// hard dividers" rule (§12). Reuses the same BlurView technique already
// proven in this app (SlidingTabs' tab bar) rather than faking a gradient —
// no gradient library is installed, and adding one is a new native
// dependency that would need a fresh EAS build. At scrollY=0 (top of the
// list) there's no blur at all, so content starts flush under the header;
// scrolling past `fadeDistance` ramps in a full-strength blurred edge,
// telling you there's more content above without a border ever appearing.
//
// Not yet wired into any screen. TopBar today is a static, non-floating
// header with no scroll-value plumbing — each screen that wants this needs
// its own useAnimatedScrollHandler feeding `scrollY` in, which is a
// per-screen integration decision, not something this primitive can do on
// its own.
export function ScrollEdgeFade({ scrollY, height = 20, fadeDistance = 24 }: Props) {
  const { scheme } = useTheme();

  const animatedProps = useAnimatedProps(() => ({
    intensity: interpolate(scrollY.value, [0, fadeDistance], [0, material.chrome.intensity], Extrapolation.CLAMP),
  }));
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, fadeDistance], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <AnimatedBlurView
      pointerEvents="none"
      tint={scheme === 'dark' ? 'dark' : 'light'}
      animatedProps={animatedProps}
      style={[styles.fade, { height }, style]}
    />
  );
}

const styles = StyleSheet.create({
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});
