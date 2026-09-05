import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { RecapCardView, toneColors } from '@/components/recap/RecapCardView';
import { triggerFeedback } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { buildWeeklyRecapCards, type RecapCard } from '@/services/recap/weeklyRecap';

// A single-screen modal route, same convention as scanner.tsx and
// settings/upgrade.tsx — no nested _layout, headerShown:false is set on the
// parent Stack.Screen in app/_layout.tsx since this needs to be fully
// immersive (no native header at all, own progress bar + close button).

const AUTO_ADVANCE_MS = 15_000;
// Same "emphasized decelerate" family of curve SlidingTabs.tsx uses for the
// tab-to-tab slide — reused here rather than a spring so a manual tap and
// the identical auto-advance transition always feel the same.
const SLIDE_DURATION_MS = 380;
const SLIDE_EASING = Easing.out(Easing.cubic);

export default function WeeklyRecapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Built once per visit, not memoized on any store field — a static deck
  // for the session it's open is exactly what "wrapped" decks are; nothing
  // should reshuffle mid-swipe just because a background poll ticked a price.
  const [cards] = useState<RecapCard[]>(() => buildWeeklyRecapCards());
  const [activeIndex, setActiveIndex] = useState(0);

  // Drives the whole deck's horizontal position — the same translateX-row
  // technique SlidingTabs.tsx uses to slide between tabs, reused here
  // instead of a FlatList's own scroll so "tap to advance" and "auto-advance
  // after 15s" are driven by the exact same code path with no dependence on
  // scrollTo working a particular way against a disabled-scroll FlatList.
  const slidePosition = useSharedValue(0);
  // The one shared value driving the active progress segment's fill. Only
  // the currently-active segment ever animates — segments before it render
  // as a plain, already-full bar and segments after as a plain empty one —
  // so this doesn't need one shared value per card no matter how long the
  // deck gets.
  const fillProgress = useSharedValue(0);

  const activeTone = useMemo(() => toneColors(colors, cards[activeIndex]?.tone ?? 'accent'), [colors, cards, activeIndex]);

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(cards.length - 1, index));
    setActiveIndex(clamped);
    slidePosition.value = withTiming(clamped, { duration: SLIDE_DURATION_MS, easing: SLIDE_EASING });
  }

  function handleAdvance() {
    if (activeIndex >= cards.length - 1) {
      router.back();
      return;
    }
    goTo(activeIndex + 1);
  }

  // Auto-advance + the segment fill it visually represents both restart
  // whenever activeIndex changes, whether that came from the timer itself
  // or a tap — exactly how Stories-style progress bars behave.
  useEffect(() => {
    fillProgress.value = 0;
    fillProgress.value = withTiming(1, { duration: AUTO_ADVANCE_MS, easing: Easing.linear });
    const timer = setTimeout(handleAdvance, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function handleTapZone(direction: 'back' | 'forward') {
    triggerFeedback('navigation');
    if (direction === 'back') goTo(activeIndex - 1);
    else handleAdvance();
  }

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -slidePosition.value * width }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillProgress.value * 100}%` }));

  return (
    <View style={[styles.root, { backgroundColor: activeTone.bg }]}>
      <Animated.View style={[styles.row, { width: width * cards.length }, rowStyle]}>
        {cards.map((card, index) => (
          <View key={card.key} style={{ width }}>
            <RecapCardView card={card} isActive={index === activeIndex} />
          </View>
        ))}
      </Animated.View>

      {/* Tap zones sit above the deck: left third steps back, the rest
          advances — the same split every Stories-style UI uses so a thumb
          resting anywhere on the right side always moves forward. */}
      <View style={[StyleSheet.absoluteFill, styles.tapZones]} pointerEvents="box-none">
        <Pressable style={styles.tapBack} onPress={() => handleTapZone('back')} />
        <Pressable style={styles.tapForward} onPress={() => handleTapZone('forward')} />
      </View>

      <View style={[styles.chrome, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
        <View style={styles.topRow}>
          <View style={styles.progressRow}>
            {cards.map((card, i) => (
              <View key={card.key} style={[styles.segmentTrack, { backgroundColor: `${activeTone.fg}40` }]}>
                {i < activeIndex ? (
                  <View style={[styles.segmentFill, { width: '100%', backgroundColor: activeTone.fg }]} />
                ) : i === activeIndex ? (
                  <Animated.View style={[styles.segmentFill, fillStyle, { backgroundColor: activeTone.fg }]} />
                ) : null}
              </View>
            ))}
          </View>
          <Pressable
            hitSlop={12}
            style={styles.closeBtn}
            onPress={() => {
              triggerFeedback('secondary');
              router.back();
            }}>
            <Ionicons name="close" size={22} color={activeTone.fg} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  row: { flex: 1, flexDirection: 'row' },
  tapZones: { flexDirection: 'row' },
  tapBack: { flex: 1 },
  tapForward: { flex: 2 },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progressRow: { flex: 1, flexDirection: 'row', gap: 4 },
  segmentTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  segmentFill: { height: '100%', borderRadius: 2 },
  closeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
