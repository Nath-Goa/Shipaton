import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { springs } from '@/constants/animations';

// The top of the purchase celebration screen: a slowly turning sunburst, a
// soft glow, the tier's diamond emblem popping in and then floating, and a
// few twinkling sparkles around it. Tapping the emblem fires more confetti.

export const HERO_HEIGHT = 250;
const BURST_SIZE = 380;
const EMBLEM_SIZE = 124;
const RAY_COUNT = 18;

// Built once at module load; a static path string is all the sunburst needs.
const RAYS_PATH = (() => {
  const c = BURST_SIZE / 2;
  const half = Math.PI / RAY_COUNT / 2;
  let d = '';
  for (let i = 0; i < RAY_COUNT; i++) {
    const a = (i / RAY_COUNT) * Math.PI * 2;
    const x1 = c + Math.cos(a - half) * c;
    const y1 = c + Math.sin(a - half) * c;
    const x2 = c + Math.cos(a + half) * c;
    const y2 = c + Math.sin(a + half) * c;
    d += `M${c} ${c} L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z `;
  }
  return d;
})();

const SPARKLES: { x: number; y: number; size: number; delay: number }[] = [
  { x: -96, y: -58, size: 22, delay: 0 },
  { x: 100, y: -44, size: 18, delay: 450 },
  { x: -84, y: 60, size: 16, delay: 900 },
  { x: 92, y: 66, size: 24, delay: 250 },
  { x: 8, y: -104, size: 14, delay: 650 },
];

type Props = {
  gradient: [string, string];
  reducedMotion: boolean;
  onEmblemPress: () => void;
};

export function CelebrationHero({ gradient, reducedMotion, onEmblemPress }: Props) {
  const spin = useSharedValue(0);
  const pop = useSharedValue(reducedMotion ? 1 : 0);
  const float = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    spin.value = withRepeat(withTiming(360, { duration: 26_000, easing: Easing.linear }), -1, false);
    pop.value = withDelay(180, withSpring(1, springs.bouncy));
    float.value = withDelay(
      900,
      withRepeat(
        withSequence(
          withTiming(-9, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, [reducedMotion, spin, pop, float]);

  const burstStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const emblemStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 1.5),
    transform: [{ translateY: float.value }, { scale: pop.value }, { rotate: `${(1 - pop.value) * -25}deg` }],
  }));

  return (
    <View style={styles.hero}>
      <Animated.View pointerEvents="none" style={[styles.burst, burstStyle]}>
        <Svg width={BURST_SIZE} height={BURST_SIZE}>
          <Defs>
            <RadialGradient id="heroRayFade" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.34} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Path d={RAYS_PATH} fill="url(#heroRayFade)" />
        </Svg>
      </Animated.View>

      <View pointerEvents="none" style={styles.glow}>
        <Svg width={240} height={240}>
          <Defs>
            <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={120} cy={120} r={120} fill="url(#heroGlow)" />
        </Svg>
      </View>

      {SPARKLES.map((s, i) => (
        <Sparkle key={i} {...s} reducedMotion={reducedMotion} />
      ))}

      <Animated.View style={emblemStyle}>
        <Pressable
          feedbackCategory="success"
          accessibilityRole="button"
          accessibilityLabel="Celebrate again"
          hitSlop={12}
          onPress={onEmblemPress}
          style={[styles.emblem, { backgroundColor: gradient[1] }]}>
          <Svg width={EMBLEM_SIZE} height={EMBLEM_SIZE} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="heroEmblem" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={gradient[0]} />
                <Stop offset="1" stopColor={gradient[1]} />
              </LinearGradient>
            </Defs>
            <Circle cx={EMBLEM_SIZE / 2} cy={EMBLEM_SIZE / 2} r={EMBLEM_SIZE / 2 - 3} fill="url(#heroEmblem)" stroke="#ffffff" strokeWidth={5} />
          </Svg>
          <Ionicons name="diamond" size={56} color="#ffffff" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function Sparkle({ x, y, size, delay, reducedMotion }: { x: number; y: number; size: number; delay: number; reducedMotion: boolean }) {
  const twinkle = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    twinkle.value = withDelay(
      500 + delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) }),
          withTiming(0.25, { duration: 900, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [reducedMotion, delay, twinkle]);

  const style = useAnimatedStyle(() => ({
    opacity: twinkle.value,
    transform: [{ scale: 0.6 + twinkle.value * 0.5 }, { rotate: `${twinkle.value * 45}deg` }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.sparkle, { marginLeft: x - size / 2, marginTop: y - size / 2 }, style]}>
      <Ionicons name="sparkles" size={size} color="#ffffff" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: { height: HERO_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  burst: { position: 'absolute', width: BURST_SIZE, height: BURST_SIZE },
  glow: { position: 'absolute', width: 240, height: 240 },
  sparkle: { position: 'absolute', left: '50%', top: '50%' },
  emblem: {
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
    borderRadius: EMBLEM_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
});
