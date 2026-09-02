import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { triggerHaptic } from '@/constants/animations';
import { radius, shadow, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useToastStore } from '@/store/useToastStore';

export function ToastHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { message, actionLabel, onAction, hide } = useToastStore();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) return;
    triggerHaptic('light');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, 4000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [message, hide]);

  if (!message) return null;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16).mass(0.8)}
      exiting={FadeOutDown.duration(200)}
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 78 }]}>
      <Pressable
        onPress={hide}
        style={[
          styles.toast,
          { backgroundColor: colors.surface, borderColor: colors.border },
          shadow.md,
        ]}>
        <Text style={[styles.msg, { color: colors.text }]} numberOfLines={2}>
          {message}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              onAction();
              hide();
            }}>
            <Text style={[styles.action, { color: colors.accent }]}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '92%',
  },
  msg: { fontSize: 14, flexShrink: 1, fontWeight: '500' },
  action: { fontSize: 13, fontWeight: '700' },
});
