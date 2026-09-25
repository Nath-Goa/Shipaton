import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { CelebrationHero } from '@/components/purchase/CelebrationHero';
import { Confetti } from '@/components/purchase/Confetti';
import { RingWipe, ringWipeTotalMs } from '@/components/purchase/RingWipe';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { triggerFeedback, triggerHaptic } from '@/constants/animations';
import { TIER_LABELS, type Tier } from '@/constants/subscription';
import { spacing } from '@/constants/theme';
import { benefitSectionsFor, type TierBenefit } from '@/constants/tierBenefits';
import { trackingFor } from '@/constants/typography';
import { useIsJudgeMode } from '@/hooks/useAgePermissions';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { useAgeStore } from '@/store/useAgeStore';
import { useSettingsStore } from '@/store/useSettingsStore';

// Shown once, right after a purchase actually lands (useUpgradeToTier and
// settings/upgrade.tsx push it only on a confirmed paid tier, never on a
// restore or a cancelled paywall). A fullScreenModal with a fade animation
// in app/_layout.tsx, so the exit transitions below can end on a solid
// app-background color and let the fade reveal the destination seamlessly.
//
// Deliberately draws its own vivid colors instead of the theme's: it is a
// one-off celebration, like the Weekly Recap deck, and white text on these
// gradients reads the same in light and dark mode. Only the final wipe color
// comes from the theme, because that one has to match what's underneath.

type PaidTier = Exclude<Tier, 'free'>;

const TIER_THEME: Record<PaidTier, { background: [string, string, string]; emblem: [string, string]; glows: [string, string]; ink: string }> = {
  pro: {
    background: ['#4C1D95', '#C026D3', '#FB923C'],
    emblem: ['#F472B6', '#9333EA'],
    glows: ['#F9A8D4', '#FDE68A'],
    ink: '#9D1FB0',
  },
  max: {
    background: ['#1E1B4B', '#4F46E5', '#DB2777'],
    emblem: ['#60A5FA', '#7C3AED'],
    glows: ['#93C5FD', '#F9A8D4'],
    ink: '#4338CA',
  },
};

const CONFETTI_COLORS = ['#FF4D8D', '#FF9F1C', '#FFD60A', '#2EC4B6', '#4D96FF', '#9B5DE5', '#FFFFFF'];
const RAINBOW = ['#FF4D8D', '#FF9F1C', '#FFD60A', '#2EC4B6', '#4D96FF', '#9B5DE5'];
const ICON_COLORS = ['#FF4D8D', '#FF8A00', '#12B886', '#3B82F6', '#8B5CF6', '#EF4444', '#0EA5E9', '#D946EF'];

// "Let's go" exit: a rainbow of rings bursts from the button, ending on the
// app background, while the diamond pops up in the middle and the camera
// flies through it. Timed so the zoom finishes just as the last ring lands.
const LETS_GO_STAGGER_MS = 70;
const LETS_GO_RINGS = RAINBOW.length + 1;
const ZOOM_START_MS = ringWipeTotalMs(LETS_GO_RINGS, LETS_GO_STAGGER_MS) - 80;
const ZOOM_DURATION_MS = 380;
const LETS_GO_TOTAL_MS = ZOOM_START_MS + ZOOM_DURATION_MS;

// Tapping a perk: a shorter two-ring wipe from the finger, then straight there.
const PERK_STAGGER_MS = 90;

type Leaving = { origin: { x: number; y: number }; colors: string[]; stagger: number; letsGo: boolean };

function parseTier(param: string | undefined, fallback: Tier): PaidTier {
  if (param === 'pro' || param === 'max') return param;
  return fallback === 'max' ? 'max' : 'pro';
}

export default function PurchaseSuccessScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ tier?: string }>();
  const storeTier = useSettingsStore((s) => s.tier);
  // TEMPORARY (constants/judgeMode.ts). This screen replaced the toast that
  // told judges the unlock came through RevenueCat Test Store, so it has to
  // keep saying so.
  const isJudge = useIsJudgeMode();
  const judgeAccessSource = useAgeStore((s) => s.judgeAccessSource);
  // Read once: the celebration is for the purchase that opened this screen,
  // and shouldn't swap its whole look if the tier listener lands mid-visit.
  const [tier] = useState<PaidTier>(() => parseTier(params.tier, storeTier));
  const theme = TIER_THEME[tier];
  const [sections] = useState(() => benefitSectionsFor(tier));

  const [bursts, setBursts] = useState<number[]>([0]);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  const [footerHeight, setFooterHeight] = useState(150);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A ref, not the `leaving` state: two taps in the same frame both see the
  // state as still null, and the second would queue a second navigation.
  const hasLeft = useRef(false);

  useEffect(() => {
    triggerFeedback('success');
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  function goTo(route: Href) {
    // Pops the root stack back to the tabs (this screen, plus Settings if
    // the purchase started there), then opens the destination inside them.
    // canDismiss guards a cold deep link, where nothing sits underneath and
    // POP_TO_TOP would go unhandled.
    if (router.canDismiss()) router.dismissAll();
    router.navigate(route);
  }

  function leave(route: Href, next: Leaving) {
    if (hasLeft.current) return;
    hasLeft.current = true;
    if (reducedMotion) {
      goTo(route);
      return;
    }
    setLeaving(next);
    const total = next.letsGo ? LETS_GO_TOTAL_MS : ringWipeTotalMs(next.colors.length, next.stagger);
    leaveTimer.current = setTimeout(() => goTo(route), total);
  }

  function handleLetsGo(e: GestureResponderEvent) {
    triggerHaptic('heavy');
    leave('/', {
      origin: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY },
      colors: [...RAINBOW, colors.bg],
      stagger: LETS_GO_STAGGER_MS,
      letsGo: true,
    });
  }

  function handleBenefit(benefit: TierBenefit, color: string, e: GestureResponderEvent) {
    if (!benefit.route) return;
    leave(benefit.route, {
      origin: { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY },
      colors: [color, colors.bg],
      stagger: PERK_STAGGER_MS,
      letsGo: false,
    });
  }

  function celebrateAgain() {
    if (reducedMotion) return;
    // Keep the burst still in flight alongside the new one instead of
    // cutting it off, so rapid taps pile up rather than flicker.
    setBursts((prev) => [...prev.slice(-1), (prev[prev.length - 1] ?? 0) + 1]);
  }

  let rowIndex = 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background[1] }]}>
      <StatusBar style="light" />
      <Backdrop width={width} height={height} theme={theme} reducedMotion={reducedMotion} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.sm, paddingBottom: footerHeight + spacing.xl },
        ]}>
        <CelebrationHero gradient={theme.emblem} reducedMotion={reducedMotion} onEmblemPress={celebrateAgain} />

        <Animated.View entering={FadeInDown.delay(320).duration(520).easing(Easing.out(Easing.cubic))}>
          <Text style={styles.title}>Thank you for your purchase!!!</Text>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(460).duration(520).easing(Easing.out(Easing.cubic))} style={styles.subtitleBlock}>
          <View style={styles.tierPill}>
            <Ionicons name="diamond" size={13} color="#ffffff" />
            <Text style={styles.tierPillText} numberOfLines={1}>
              {TIER_LABELS[tier].toUpperCase()} UNLOCKED
            </Text>
          </View>
          <Text style={styles.subtitle}>
            Welcome to Markva {TIER_LABELS[tier]} 🎉 Hope you enjoy your benefits!
          </Text>
          {isJudge && judgeAccessSource === 'test_store' ? (
            <Text style={styles.sourceNote}>Unlocked through RevenueCat Test Store. Nothing was charged.</Text>
          ) : null}
        </Animated.View>

        {sections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            <Animated.View entering={FadeInDown.delay(600 + sectionIndex * 120).duration(480)}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {sectionIndex === 0 ? (
                <Text style={styles.sectionHint}>Tap any perk to jump straight in and try it.</Text>
              ) : null}
            </Animated.View>
            {section.benefits.map((benefit) => {
              const index = rowIndex++;
              const color = ICON_COLORS[index % ICON_COLORS.length];
              return (
                <BenefitRow
                  key={benefit.key}
                  benefit={benefit}
                  color={color}
                  delay={680 + index * 70}
                  onPress={(e) => handleBenefit(benefit, color, e)}
                />
              );
            })}
          </View>
        ))}
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="footerFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#0E0822" stopOpacity={0} />
              <Stop offset="0.22" stopColor="#0E0822" stopOpacity={0.72} />
              <Stop offset="1" stopColor="#0E0822" stopOpacity={0.86} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#footerFade)" />
        </Svg>
        <Animated.View entering={FadeInDown.delay(900).duration(520).easing(Easing.out(Easing.cubic))}>
          <Text style={styles.footerHint}>Everything is unlocked. Explore now or whenever you like.</Text>
          <View style={styles.buttonWrap}>
            {reducedMotion ? null : <PulseHalo />}
            <Pressable
              feedbackCategory="primary"
              accessibilityRole="button"
              accessibilityLabel="Let's go. Opens the home screen."
              onPress={handleLetsGo}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
              <Text style={[styles.buttonLabel, { color: theme.ink }]} numberOfLines={1}>
                Let's go!! 🚀
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>

      {reducedMotion ? null : bursts.map((id) => <Confetti key={id} colors={CONFETTI_COLORS} />)}

      {leaving ? (
        <>
          <RingWipe origin={leaving.origin} colors={leaving.colors} staggerMs={leaving.stagger} />
          {leaving.letsGo ? <ZoomThrough gradient={theme.emblem} width={width} height={height} /> : null}
        </>
      ) : null}
    </View>
  );
}

function BenefitRow({
  benefit,
  color,
  delay,
  onPress,
}: {
  benefit: TierBenefit;
  color: string;
  delay: number;
  onPress: (e: GestureResponderEvent) => void;
}) {
  const content = (
    <>
      <View style={[styles.iconBubble, { backgroundColor: color }]}>
        <Ionicons name={benefit.icon} size={22} color="#ffffff" />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{benefit.title}</Text>
        <Text style={styles.rowDescription}>{benefit.description}</Text>
      </View>
      {benefit.route ? (
        <View style={styles.tryPill}>
          <Text style={[styles.tryLabel, { color }]} numberOfLines={1}>
            Try it
          </Text>
          <Ionicons name="chevron-forward" size={13} color={color} />
        </View>
      ) : (
        <View style={styles.activePill}>
          <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
          <Text style={styles.activeLabel} numberOfLines={1}>
            Active
          </Text>
        </View>
      )}
    </>
  );

  // Entrance animation on a plain wrapper, touch on a plain Pressable inside
  // it (CLAUDE.md §7 rule #2).
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(16)}>
      {benefit.route ? (
        <Pressable
          feedbackCategory="navigation"
          accessibilityRole="button"
          accessibilityLabel={`${benefit.title}. ${benefit.description} Opens it so you can try it.`}
          onPress={onPress}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          {content}
        </Pressable>
      ) : (
        <View style={styles.row} accessible accessibilityLabel={`${benefit.title}. ${benefit.description} Already active.`}>
          {content}
        </View>
      )}
    </Animated.View>
  );
}

// Full-screen diagonal gradient with two soft glows drifting across it.
function Backdrop({
  width,
  height,
  theme,
  reducedMotion,
}: {
  width: number;
  height: number;
  theme: (typeof TIER_THEME)[PaidTier];
  reducedMotion: boolean;
}) {
  const drift = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [reducedMotion, drift]);

  const glowSize = width * 1.1;
  const glowA = useAnimatedStyle(() => ({
    transform: [{ translateX: -glowSize * 0.35 + drift.value * width * 0.35 }, { translateY: height * 0.05 + drift.value * 60 }],
  }));
  const glowB = useAnimatedStyle(() => ({
    transform: [{ translateX: width - glowSize * 0.6 - drift.value * width * 0.3 }, { translateY: height * 0.55 - drift.value * 90 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="successBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.background[0]} />
            <Stop offset="0.55" stopColor={theme.background[1]} />
            <Stop offset="1" stopColor={theme.background[2]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#successBg)" />
      </Svg>
      <Animated.View style={[styles.glow, glowA]}>
        <Glow id="glowA" size={glowSize} color={theme.glows[0]} />
      </Animated.View>
      <Animated.View style={[styles.glow, glowB]}>
        <Glow id="glowB" size={glowSize} color={theme.glows[1]} />
      </Animated.View>
    </View>
  );
}

function Glow({ id, size, color }: { id: string; size: number; color: string }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}

// A ripple that keeps breathing out from behind the Let's go button.
function PulseHalo() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withDelay(1400, withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
  }, [pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.5 * (1 - pulse.value),
    transform: [{ scaleX: 1 + pulse.value * 0.08 }, { scaleY: 1 + pulse.value * 0.35 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.halo, style]} />;
}

// The diamond popping up mid-screen during the Let's go wipe, then rushing
// toward the camera until it's gone, like flying through a logo.
function ZoomThrough({ gradient, width, height }: { gradient: [string, string]; width: number; height: number }) {
  const scale = useSharedValue(0.001);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withSequence(
      withDelay(120, withTiming(1, { duration: 420, easing: Easing.out(Easing.back(2.2)) })),
      withDelay(ZOOM_START_MS - 540, withTiming(16, { duration: ZOOM_DURATION_MS, easing: Easing.in(Easing.cubic) }))
    );
    opacity.value = withDelay(ZOOM_START_MS + 140, withTiming(0, { duration: ZOOM_DURATION_MS - 140 }));
  }, [scale, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.zoomEmblem, { left: width / 2 - ZOOM_EMBLEM / 2, top: height / 2 - ZOOM_EMBLEM / 2 }, style]}>
      <Svg width={ZOOM_EMBLEM} height={ZOOM_EMBLEM} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="zoomEmblem" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradient[0]} />
            <Stop offset="1" stopColor={gradient[1]} />
          </LinearGradient>
        </Defs>
        <Circle cx={ZOOM_EMBLEM / 2} cy={ZOOM_EMBLEM / 2} r={ZOOM_EMBLEM / 2} fill="url(#zoomEmblem)" />
      </Svg>
      <Ionicons name="diamond" size={50} color="#ffffff" />
    </Animated.View>
  );
}

const ZOOM_EMBLEM = 112;
const BUTTON_HEIGHT = 60;

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { paddingHorizontal: spacing.xl },
  glow: { position: 'absolute', left: 0, top: 0 },
  title: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 37,
    letterSpacing: trackingFor(31),
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitleBlock: { marginTop: spacing.md, gap: spacing.md },
  tierPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  tierPillText: { flexShrink: 1, color: '#ffffff', fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  subtitle: { color: 'rgba(255,255,255,0.92)', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  sourceNote: { color: 'rgba(255,255,255,0.75)', fontSize: 12, textAlign: 'center' },
  section: { marginTop: spacing.xxl, gap: spacing.md },
  sectionTitle: { color: '#ffffff', fontSize: 21, letterSpacing: trackingFor(21), fontWeight: '800' },
  sectionHint: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.26)', transform: [{ scale: 0.98 }] },
  iconBubble: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: '#ffffff', fontSize: 15.5, fontWeight: '700' },
  rowDescription: { color: 'rgba(255,255,255,0.82)', fontSize: 13, lineHeight: 18 },
  tryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 10,
    paddingRight: 7,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  tryLabel: { flexShrink: 1, fontSize: 12, fontWeight: '800' },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  activeLabel: { flexShrink: 1, color: '#ffffff', fontSize: 12, fontWeight: '800' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl + spacing.md },
  footerHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', marginBottom: spacing.md },
  buttonWrap: { height: BUTTON_HEIGHT },
  halo: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999, backgroundColor: '#ffffff' },
  button: {
    height: BUTTON_HEIGHT,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  buttonPressed: { transform: [{ scale: 0.97 }] },
  buttonLabel: { flexShrink: 1, fontSize: 20, letterSpacing: trackingFor(20), fontWeight: '800' },
  zoomEmblem: {
    position: 'absolute',
    width: ZOOM_EMBLEM,
    height: ZOOM_EMBLEM,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
