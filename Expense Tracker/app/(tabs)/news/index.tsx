import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StarButton } from '@/components/stocks/StarButton';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { loadMarketNews, type NewsSection } from '@/services/news/marketNews';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import type { NewsItem } from '@/types/prediction';
import { timeAgo } from '@/utils/date';

// Auto-refresh while the tab sits open, on top of the per-section 1h TTL
// inside marketNews.ts itself — the TTL alone only refetches on the next
// load call, which wouldn't happen at all if someone just leaves this
// screen open past the hour instead of leaving and reopening it.
const FOCUSED_REFRESH_MS = 60 * 60 * 1000;

export default function NewsScreen() {
  const { colors } = useTheme();
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const toggleWatchlist = usePortfolioStore((s) => s.toggleWatchlist);

  const [sections, setSections] = useState<NewsSection[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // A background load (focus, hourly tick) that's still in flight must not
  // block an explicit pull-to-refresh — chaining onto whatever's already
  // running (rather than a plain in-flight boolean guard that would just
  // skip the refresh outright) means a force load always actually runs,
  // while overlapping background loads still collapse into one.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback((force: boolean): Promise<void> => {
    if (!force && inFlightRef.current) return inFlightRef.current;
    const previous = inFlightRef.current ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => loadMarketNews(force))
      .then((next) => setSections(next))
      // loadMarketNews already degrades every fetch failure to an empty
      // section rather than throwing; this is only a backstop against a
      // genuinely unexpected error, so the screen never gets stuck showing
      // a spinner or a stale refresh indicator over one.
      .catch(() => undefined);
    inFlightRef.current = run;
    run.finally(() => {
      if (inFlightRef.current === run) inFlightRef.current = null;
    });
    return run;
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(false);
      const timer = setInterval(() => load(false), FOCUSED_REFRESH_MS);
      return () => clearInterval(timer);
      // watchlist/holdings changing while focused (e.g. starring a stock
      // from this very screen) should pick up a section for it without
      // waiting for the next hourly tick.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, watchlist])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  function openHeadline(item: NewsItem) {
    if (item.url) Linking.openURL(item.url).catch(() => undefined);
  }

  const hasAnyItems = (sections ?? []).some((s) => s.items.length > 0);
  // Only per-stock sections carry a symbol, so this is exactly "the user
  // holds or watches nothing yet" — read off the sections that were actually
  // built rather than re-reading the portfolio store outside a subscription,
  // which would leave the hint stale for someone who holds stocks.
  const followsAnyStock = (sections ?? []).some((s) => s.symbol);

  return (
    <Screen>
      <TopBar title="News" subtitle="Market headlines — refreshes hourly" />
      {sections === null ? (
        <View style={styles.loading}>
          <Text style={{ color: colors.text3 }}>Loading headlines…</Text>
        </View>
      ) : !hasAnyItems ? (
        <EmptyState
          icon="📰"
          title="No headlines right now"
          message="Couldn't reach the news feed just now."
          actionLabel="Retry"
          onAction={() => load(true)}
        />
      ) : (
        <SectionList
          sections={sections
            .filter((s) => s.items.length > 0)
            .map((s) => ({ ...s, data: s.items }))}
          // The same headline can legitimately appear under Market and under
          // a stock section, so the item id alone isn't unique across the
          // whole list — item.symbol is the query it was fetched under, which
          // is what tells the two copies apart.
          keyExtractor={(item, index) => `${item.symbol}-${item.id}-${index}`}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
          ListHeaderComponent={
            !followsAnyStock ? (
              <Animated.View entering={FadeInDown.duration(250)}>
                <Card style={styles.hintCard}>
                  <Text style={[styles.hintText, { color: colors.text2 }]}>
                    Star a stock in Markets to give it its own section here.
                  </Text>
                </Card>
              </Animated.View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHead, { backgroundColor: colors.bg }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
              {section.symbol ? (
                <StarButton
                  symbol={section.symbol}
                  watched={watchlist.includes(section.symbol)}
                  onToggle={() => toggleWatchlist(section.symbol!)}
                />
              ) : null}
            </View>
          )}
          renderItem={({ item, section }) => (
            <Pressable disabled={!item.url} onPress={() => openHeadline(item)}>
              <Card style={styles.newsCard}>
                <Text style={[styles.headline, { color: colors.text }]} numberOfLines={3}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, { color: colors.text3 }]}>
                  {item.publisher} · {timeAgo(item.publishedAt)}
                  {section.key === 'trending' ? ` · ${item.symbol}` : ''}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  hintCard: { marginBottom: spacing.sm },
  hintText: { fontSize: 13, lineHeight: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  newsCard: { marginBottom: spacing.sm, gap: 4 },
  headline: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  meta: { fontSize: 11.5 },
});
