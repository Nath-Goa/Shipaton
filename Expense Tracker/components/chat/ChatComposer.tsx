import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function ChatComposer({ onSend, disabled, loading, placeholder = 'Ask a question…' }: Props) {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const scale = useSharedValue(1);

  const canSubmit = !disabled && !loading && !!text.trim();

  const handlePressIn = useCallback(() => {
    if (!canSubmit) return;
    scale.value = withSpring(0.88, springs.snappy);
    triggerFeedback('primary');
  }, [canSubmit, scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled || loading) return;
    onSend(trimmed);
    setText('');
  }

  const btnAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.text3}
        editable={!disabled}
        multiline
        style={[styles.input, { color: colors.text }]}
      />
      <AnimatedPressable
        onPress={submit}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!canSubmit}
        style={[
          styles.sendBtn,
          { backgroundColor: colors.accent, opacity: canSubmit ? 1 : 0.4 },
          btnAnimatedStyle,
        ]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.onAccent} />
        ) : (
          <Ionicons name="arrow-up" size={18} color={colors.onAccent} />
        )}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  input: { flex: 1, maxHeight: 100, fontSize: 14.5, paddingVertical: 6 },
  sendBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
