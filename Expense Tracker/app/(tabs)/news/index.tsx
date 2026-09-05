import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { NewsCard } from '@/components/news/NewsCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { useTheme } from '@/hooks/useTheme';
import { loadMarketNews, type NewsSection } from '@/services/news/marketNews';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import type { NewsItem } from '@/types/prediction';

// One headline fills the screen at a time (InShort-style — see NewsCard),
// sourced from marketNews.ts's sectioned fetch (Market / Today's biggest
// movers / one section per held-or-watched stock) rather than a second news
// source — the sections are flattened into one ordered feed here since a
// swipeable single-headline view is the presentation the user actually
// asked for, but the section each headline came from is kept and shown on
// its card (and drives which cards get a star toggle).
const FOCUSED_REFRESH_MS = 60 * 60 * 1000;

type FlatNewsEntry = { item: NewsItem; sectionLabel: string; symbol?: string };

function flatten(sections: NewsSection[]): FlatNewsEntry[] {
  const out: FlatNewsEntry[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      out.push({ item, sectionLabel: section.title, symbol: section.symbol });
    }
  }
  return out;
}

export default function NewsScreen() {
  const { colors } = useTheme();
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const toggleWatchlist = usePortfolioStore((s) => s.toggleWatchlist);

  const [sections, setSections] = useState<NewsSection[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  // A background load (focus, hourly tick) still in flight must not block an
  // explicit pull-to-refresh — chaining onto whatever's already running
  // (rather than a plain in-flight boolean guard that would just skip the
  // refresh outright) means a force load always actually runs, while
  // overlapping background loads still collapse into one.
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback((force: boolean): Promise<void> => {
    if (!force && inFlightRef.current) return inFlightRef.current;
    const previous = inFlightRef.current ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => loadMarketNews(force))
      .then((next) => setSections(next))
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load, watchlist])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  function onLayout(e: { nativeEvent: { layout: { height: number } } }) {
    setContainerHeight(e.nativeEvent.layout.height);
  }

  const entries = flatten(sections ?? []);

  return (
    <Screen>
      <TopBar title="News" subtitle="Markets, headline by headline" />
      <View style={styles.feedWrap} onLayout={onLayout}>
        {sections === null ? (
          <View style={styles.center}>
            <Text style={{ color: colors.text3 }}>Loading headlines…</Text>
          </View>
        ) : entries.length === 0 ? (
          <EmptyState
            icon="📰"
            title="No headlines right now"
            message="Couldn't reach the news feed just now — pull down to try again."
            actionLabel="Retry"
            onAction={() => load(true)}
          />
        ) : containerHeight > 0 ? (
          <FlatList
            data={entries}
            keyExtractor={(entry, index) => `${entry.symbol ?? 'general'}-${entry.item.id}-${index}`}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={containerHeight}
            decelerationRate="fast"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} />}
            renderItem={({ item: entry }) => (
              <NewsCard
                item={entry.item}
                height={containerHeight}
                sectionLabel={entry.sectionLabel}
                symbol={entry.symbol}
                watched={entry.symbol ? watchlist.includes(entry.symbol) : undefined}
                onToggleWatch={entry.symbol ? () => toggleWatchlist(entry.symbol!) : undefined}
              />
            )}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedWrap: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
