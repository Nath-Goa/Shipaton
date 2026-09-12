import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';

// Toggles a symbol's presence in usePortfolioStore's watchlist — the one
// star control shared by every screen that lets you save a stock to watch
// without buying it (Markets' list, News' per-stock sections). Kept as a
// single component so the toggle animation and watchlist semantics can't
// drift between call sites.
export function StarButton({ symbol, watched, onToggle }: { symbol: string; watched: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const showToast = useToastStore((state) => state.show);
  const scale = useSharedValue(1);
  // RN's Pressable fires onPressIn -> onPress -> onPressOut on a successful
  // tap, so onPressOut always runs right after handlePress's own bouncy pop
  // sequence starts — without this guard it would immediately spring scale
  // back to 1 and cut the pop off mid-overshoot. Only reset here when the
  // press was actually cancelled (dragged away, never committed).
  const pressCommittedRef = useRef(false);

  function handlePressIn() {
    pressCommittedRef.current = false;
    // Instant, subtle feedback the moment the finger lands — nothing has
    // been committed yet, so no haptic here (§13: feedback must be tied to
    // its actual cause, which for a toggle is the commit, not the touch).
    scale.value = withSpring(0.92, springs.tap);
  }

  function handlePressOut() {
    if (pressCommittedRef.current) return;
    scale.value = withSpring(1, springs.tap);
  }

  function handlePress() {
    pressCommittedRef.current = true;
    triggerFeedback('selection');
    scale.value = withSequence(withSpring(1.35, springs.bouncy), withSpring(1, springs.snappy));
    onToggle();
    showToast(watched ? `${symbol} removed from watchlist.` : `${symbol} added to watchlist.`, {
      actionLabel: 'Undo',
      onAction: onToggle,
    });
  }

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable hitSlop={8} onPressIn={handlePressIn} onPress={handlePress} onPressOut={handlePressOut} style={styles.star}>
      <Animated.View style={animatedStyle}>
        <Ionicons name={watched ? 'star' : 'star-outline'} size={19} color={watched ? colors.warning : colors.text3} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
});
