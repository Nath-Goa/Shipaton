import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StarButton } from '@/components/stocks/StarButton';
import { Button } from '@/components/ui/Button';
import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { triggerFeedback } from '@/constants/animations';
import { useTheme } from '@/hooks/useTheme';
import { describeAiError } from '@/services/ai/errorMessage';
import { explainHeadline } from '@/services/ai/learn';
import { timeAgo } from '@/utils/date';
import type { NewsItem } from '@/types/prediction';

// Which glyph badges a card, purely decorative — keyed on the section label
// text itself rather than a separate enum, since that's all this component
// already receives and a third section kind would need a matching label
// change anyway.
function categoryIcon(sectionLabel: string): keyof typeof Ionicons.glyphMap {
  if (sectionLabel === 'Market') return 'globe-outline';
  if (sectionLabel === "Today's biggest movers") return 'flame-outline';
  return 'trending-up-outline';
}

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
      <View>
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
      </View>

      {/* flex:1 + centered rather than everything clustered under the meta
          row — a short headline with no explanation yet used to leave most
          of the card's height as dead space above the pinned-looking
          actions row. */}
      <View style={styles.middleBlock}>
        <View style={[styles.headlineCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.iconBadge, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name={categoryIcon(sectionLabel)} size={20} color={colors.accent} />
          </View>
          <Text style={[styles.headline, { color: colors.text }]}>{item.title}</Text>
        </View>

        {explanation ? (
          <Animated.View
            entering={FadeIn.duration(220)}
            style={[styles.explainBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Text style={[styles.explainLabel, { color: colors.text3 }]}>Why this matters</Text>
            <Text style={[styles.explainText, { color: colors.text2 }]}>{explanation}</Text>
          </Animated.View>
        ) : null}
        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'column', paddingHorizontal: spacing.xl, paddingVertical: spacing.xl },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  time: { fontSize: 12, fontWeight: '600' },
  middleBlock: { flex: 1, justifyContent: 'center', gap: spacing.lg },
  headlineCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontSize: 27, fontWeight: '700', lineHeight: 35 },
  explainBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: spacing.md, gap: 4 },
  explainLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  explainText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 12.5 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  hint: { textAlign: 'center', fontSize: 11.5, marginTop: spacing.lg },
});
