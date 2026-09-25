import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import type { ChatMessage } from '@/types/chat';

// Replies come back as Markdown (**bold**, "* " bullets, "#" headings) and
// were shown with the raw asterisks. Just enough of it is rendered here to
// read cleanly — no dependency, and anything unrecognised stays plain text.
function renderInline(line: string, key: string): ReactNode[] {
  // Single-asterisk emphasis is dropped rather than rendered as italics.
  // Like Markdown, the text must hug the asterisks, so "3 * 4 * 5" survives.
  const cleaned = line.replace(/(^|[^*])\*([^\s*](?:[^*\n]*[^\s*])?)\*(?!\*)/g, '$1$2');
  return cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <Text key={`${key}-${i}`} style={styles.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    )
  );
}

function renderMarkdown(text: string): ReactNode[] {
  return text.split('\n').flatMap((raw, i) => {
    let line = raw;
    const heading = /^\s*#{1,6}\s+/.test(line);
    if (heading) line = line.replace(/^\s*#{1,6}\s+/, '');
    line = line.replace(/^(\s*)[*-]\s+/, '$1• ');
    const content = heading
      ? [
          <Text key={`h-${i}`} style={styles.bold}>
            {renderInline(line, `h-${i}`)}
          </Text>,
        ]
      : renderInline(line, `l-${i}`);
    return i === 0 ? content : ['\n', ...content];
  });
}

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
          {isUser || message.isError ? message.text : renderMarkdown(message.text)}
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
  bold: { fontWeight: '700' },
});
