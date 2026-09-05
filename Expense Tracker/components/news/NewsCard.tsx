import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StarButton } from '@/components/stocks/StarButton';
import { Button } from '@/components/ui/Button';
import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';
import { describeAiError } from '@/services/ai/errorMessage';
import { explainHeadline } from '@/services/ai/learn';
import { timeAgo } from '@/utils/date';
import type { NewsItem } from '@/types/prediction';

// One headline fills the screen (InShort-style) rather than a scrolling
// list. AI explanation is on-demand per card, not automatic — running it
// for every card in a whole feed would burn the shared AI_FEATURE_DAILY_LIMIT
// fast, and headlines are already short enough to read on their own.
// Explanations are cached module-wide by headline id so swiping back to an
// already-explained card never re-spends quota.
const explanationCache = new Map<string, string>();

type Props = {
  item: NewsItem;
  height: number;
  /** Which section this card came from — "Market", "Today's biggest movers", or a stock's name. */
  sectionLabel: string;
  /** Present only for a section tied to one symbol (not the general/trending ones). */
  symbol?: string;
  watched?: boolean;
  onToggleWatch?: () => void;
};

export function NewsCard({ item, height, sectionLabel, symbol, watched, onToggleWatch }: Props) {
  const { colors } = useTheme();
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(() => explanationCache.get(item.id) ?? null);
  const [error, setError] = useState<string | null>(null);

  function handleExplain() {
    if (explanation || explaining) return;
    triggerFeedback('secondary');
    setExplaining(true);
    setError(null);
    explainHeadline(item).then((result) => {
      setExplaining(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        return;
      }
      explanationCache.set(item.id, result.data);
      setExplanation(result.data);
    });
  }

  function handleOpenSource() {
    if (item.url) Linking.openURL(item.url);
  }

  return (
    <View style={[styles.card, { height }]}>
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionLabel, { color: colors.accent }]}>{sectionLabel}</Text>
        {symbol && onToggleWatch ? (
          <StarButton symbol={symbol} watched={!!watched} onToggle={onToggleWatch} />
        ) : null}
      </View>
      <View style={styles.meta}>
        <PillBadge label={item.publisher} />
        <Text style={[styles.time, { color: colors.text3 }]}>{timeAgo(item.publishedAt)}</Text>
      </View>

      <Text style={[styles.headline, { color: colors.text }]}>{item.title}</Text>

      {explanation ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[styles.explainBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Text style={[styles.explainLabel, { color: colors.text3 }]}>Why this matters</Text>
          <Text style={[styles.explainText, { color: colors.text2 }]}>{explanation}</Text>
        </Animated.View>
      ) : null}
      {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button
          label={explanation ? 'Explained' : 'Explain this'}
          variant="ghost"
          loading={explaining}
          disabled={!!explanation}
          onPress={handleExplain}
        />
        {item.url ? <Button label="Read source" variant="ghost" onPress={handleOpenSource} /> : null}
      </View>

      <Text style={[styles.hint, { color: colors.text3 }]}>Swipe up for the next headline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, justifyContent: 'flex-start' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  time: { fontSize: 12, fontWeight: '600' },
  headline: { fontSize: 26, fontWeight: '700', lineHeight: 33, marginTop: spacing.xl },
  explainBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: spacing.md, marginTop: spacing.xl, gap: 4 },
  explainLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  explainText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 12.5, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  hint: { position: 'absolute', bottom: spacing.xl, left: spacing.xl, right: spacing.xl, textAlign: 'center', fontSize: 11.5 },
});
