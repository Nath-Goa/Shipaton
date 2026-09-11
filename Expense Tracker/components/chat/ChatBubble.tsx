import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import type { ChatMessage } from '@/types/chat';

export function ChatBubble({ message }: { message: ChatMessage }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const isUser = message.role === 'user';

  return (
    <Animated.View
      entering={reducedMotion ? FadeIn.duration(150) : FadeInUp.springify().damping(16).mass(0.8)}
      style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.accent, borderTopRightRadius: 4 }
            : {
                backgroundColor: message.isError ? colors.dangerSoft : colors.surface,
                borderColor: colors.border,
                borderWidth: message.isError ? 0 : StyleSheet.hairlineWidth,
                borderTopLeftRadius: 4,
              },
        ]}>
        <Text
          style={[
            styles.text,
            { color: isUser ? colors.onAccent : message.isError ? colors.danger : colors.text },
          ]}>
          {message.text}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 4 },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '84%',
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  text: { fontSize: 14.5, letterSpacing: trackingFor(14.5), lineHeight: 20 },
});
