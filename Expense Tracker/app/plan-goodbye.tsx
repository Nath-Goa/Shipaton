import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { triggerHaptic } from '@/constants/animations';
import { TIER_LABELS } from '@/constants/subscription';
import { spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';

// Shown after going from Pro or Max back to Free (services/purchases/
// planChangeScreens.ts decides). The deliberate opposite of
// app/purchase-success.tsx: theme neutrals only, no accent color, no
// confetti, slow fades. Registered with a fade in app/_layout.tsx, so both
// exits simply dissolve into their destination.

export default function PlanGoodbyeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ from?: string }>();
  const fromLabel = params.from === 'max' ? TIER_LABELS.max : TIER_LABELS.pro;
  const hasLeft = useRef(false);

  const settle = useSharedValue(reducedMotion ? 1 : 0);
  const drift = useSharedValue(0);

  useEffect(() => {
    triggerHaptic('light');
    if (reducedMotion) return;
    settle.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
    drift.value = withDelay(
      1400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      )
    );
  }, [reducedMotion, settle, drift]);

  // The cloud drifts slowly down into place and then just hangs there.
  const iconStyle = useAnimatedStyle(() => ({
    opacity: settle.value,
    transform: [{ translateY: -18 * (1 - settle.value) + drift.value * 5 }],
  }));

  function leave(route: Href) {
    if (hasLeft.current) return;
    hasLeft.current = true;
    // Same exit as the celebration screen: back to the tabs, then on to
    // the destination. canDismiss covers a cold deep link with nothing
    // underneath.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(route);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={styles.body}>
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          <Ionicons name="rainy-outline" size={64} color={colors.text3} />
        </Animated.View>

        <Animated.View entering={FadeIn.delay(500).duration(900)}>
          <Text style={[styles.title, { color: colors.text }]}>It's sad to see you go...</Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(1000).duration(900)} style={styles.copy}>
          <Text style={[styles.message, { color: colors.text2 }]}>
            You've moved from {fromLabel} back to Free. Everything you've built is still here, and {fromLabel} is
            always there if you want it back.
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.note, { color: colors.text3 }]}>
            Free still has unlimited paper trading, lessons and quizzes, budgets and savings goals.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeIn.delay(1500).duration(900)} style={styles.footer}>
        <Button label="Back to Home" variant="ghost" fullWidth onPress={() => leave('/')} />
        <Pressable
          feedbackCategory="secondary"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => leave('/settings/upgrade')}
          style={styles.link}>
          <Text style={[styles.linkLabel, { color: colors.text3 }]}>Changed your mind? See plans</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.lg },
  iconWrap: { alignSelf: 'center', marginBottom: spacing.sm },
  title: { fontSize: 26, lineHeight: 32, letterSpacing: trackingFor(26), fontWeight: '600', textAlign: 'center' },
  copy: { gap: spacing.lg },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  divider: { alignSelf: 'center', width: 40, height: StyleSheet.hairlineWidth * 2 },
  note: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.xl, gap: spacing.sm },
  link: { alignSelf: 'stretch', paddingVertical: spacing.sm },
  linkLabel: { fontSize: 13, textAlign: 'center' },
});
