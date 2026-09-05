import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { StarButton } from '@/components/stocks/StarButton';
import { Button } from '@/components/ui/Button';
import { PillBadge } from '@/components/ui/PillBadge';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { describeAiError } from '@/services/ai/errorMessage';
import { explainHeadlineCached, getCachedHeadlineExplanation } from '@/services/ai/learn';
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
// list. The AI gloss loads automatically for whichever card is the one
// currently focused (see news/index.tsx's viewability tracking) — not for
// every mounted card — so cost stays identical to the old on-demand button
// (one call per newly-viewed headline), the app answers "why does this
// matter" without the user leaving for the source link, and swiping back to
// an already-explained card never re-spends quota (services/ai/learn.ts's
// cache is shared module-wide, keyed by headline id).
type Props = {
  item: NewsItem;
  height: number;
  /** Which section this card came from — "Market", "Today's biggest movers", or a stock's name. */
  sectionLabel: string;
  /** Present only for a section tied to one symbol (not the general/trending ones). */
  symbol?: string;
  watched?: boolean;
  onToggleWatch?: () => void;
  /** True only for the single card currently centered in the feed — drives the auto-summary fetch. */
  isFocused?: boolean;
};

export function NewsCard({ item, height, sectionLabel, symbol, watched, onToggleWatch, isFocused }: Props) {
  const { colors } = useTheme();
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(() => getCachedHeadlineExplanation(item));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFocused || explanation || explaining) return;
    setExplaining(true);
    setError(null);
    explainHeadlineCached(item).then((result) => {
      setExplaining(false);
      if (!result.ok) {
        setError(describeAiError(result.error));
        return;
      }
      setExplanation(result.data);
    });
    // Re-running only cares about focus changing or the item itself changing
    // (a fresh card reusing this component instance mid-scroll) — explanation/
    // explaining are read as guards, not triggers, or a resolved fetch would
    // immediately refire itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, item]);

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
        ) : explaining ? (
          <View style={[styles.explainBox, styles.explainLoading, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <ActivityIndicator size="small" color={colors.text3} />
            <Text style={[styles.explainLabel, { color: colors.text3 }]}>Summarizing…</Text>
          </View>
        ) : null}
        {error ? <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <View>
        {item.url ? (
          <View style={styles.actions}>
            <Button label="Read source" variant="ghost" onPress={handleOpenSource} />
          </View>
        ) : null}
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
  explainLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  explainLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  explainText: { fontSize: 14, lineHeight: 20 },
  errorText: { fontSize: 12.5 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  hint: { textAlign: 'center', fontSize: 11.5, marginTop: spacing.lg },
});
