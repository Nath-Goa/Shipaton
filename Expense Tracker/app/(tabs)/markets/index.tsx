import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';

import { MarketsPortfolioSwitch } from '@/components/navigation/MarketsPortfolioSwitch';
import { StarButton } from '@/components/stocks/StarButton';
import { StockListItem } from '@/components/stocks/StockListItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/SkeletonList';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { isLiveMarketDataConfigured, searchSymbols, type SymbolSearchResult } from '@/services/marketData/marketData';
import { regenerateMarket } from '@/services/marketData/regenerateMarket';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const TICKER_SYMBOLS = new Set(TICKERS.map((t) => t.symbol));

function MarketActionBtn({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.95, springs.snappy);
    triggerFeedback('secondary');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.actionBtn,
        { backgroundColor: colors.surface, borderColor: colors.border },
        animatedStyle,
      ]}>
      <Ionicons name={icon} size={16} color={colors.accent} />
      <Text style={[styles.actionLabel, { color: colors.text2 }]}>{label}</Text>
    </AnimatedPressable>
  );
}

export default function MarketsScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const { watchlist, toggleWatchlist } = usePortfolioStore(
    useShallow((s) => ({ watchlist: s.watchlist, toggleWatchlist: s.toggleWatchlist }))
  );
  const showToast = useToastStore((s) => s.show);

  const symbols = useMemo(() => TICKERS.map((t) => t.symbol), []);
  // Markets stays mounted as the tab root (CLAUDE.md §5.1), so a plain
  // mount effect would only ever fetch once, on the very first visit —
  // refetching on every focus is what actually gives "one fresh pull each
  // time you open this tab." No background polling while it sits open
  // (pollMs=0): pull-to-refresh and the Refresh prices action are the only
  // other ways prices update while you're on this screen.
  const { quotes, refresh } = useQuotes(symbols, 0);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TICKERS;
    return TICKERS.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [query]);

  // A niche stock nobody's heard of isn't in the curated 27 — rather than a
  // flat "no matches," fall back to a real live symbol search once the
  // local list comes up empty. Debounced and gated behind that empty-local-
  // result check so this never fires on every keystroke while a real
  // curated ticker is still matching. markets/[symbol].tsx renders a
  // reduced view (live price + chart only, no mock trading/predictor) for
  // anything not in TICKERS — see its untracked-symbol branch.
  const [liveResults, setLiveResults] = useState<SymbolSearchResult[]>([]);
  const [liveSearching, setLiveSearching] = useState(false);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (filtered.length > 0 || query.trim().length < 2) {
      setLiveResults([]);
      setLiveSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setLiveSearching(true);
    const timer = setTimeout(() => {
      searchSymbols(query, 6).then((results) => {
        if (searchSeq.current !== seq) return; // a newer keystroke superseded this one
        setLiveResults(results.filter((r) => !TICKER_SYMBOLS.has(r.symbol)));
        setLiveSearching(false);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, filtered.length]);

  const liveData = isLiveMarketDataConfigured();

  function confirmRegenerate() {
    confirmAction(
      liveData
        ? {
            title: 'Refresh prices?',
            message:
              'This re-fetches the latest real prices for every stock and resets your mock portfolio (cash, holdings, and trade history) since the old prices no longer apply.',
            confirmLabel: 'Refresh',
            destructive: true,
          }
        : {
            title: 'Regenerate the market?',
            message:
              'This re-simulates fresh prices for every stock and resets your mock portfolio (cash, holdings, and trade history) since the old prices no longer apply.',
            confirmLabel: 'Regenerate',
            destructive: true,
          },
      () => {
        regenerateMarket();
        refresh();
        showToast(liveData ? 'Prices refreshed — portfolio reset to $100,000.' : 'Market regenerated — portfolio reset to $100,000.');
      }
    );
  }

  return (
    <Screen>
      <TopBar title="Markets" subtitle={liveData ? 'Mock trading — real live prices' : 'Mock stocks — simulated prices, real symbols'} />
      <MarketsPortfolioSwitch active="markets" />
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search symbol or company"
            placeholderTextColor={colors.text3}
            style={[styles.searchInput, { color: colors.text }]}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>
      </View>
      <View style={styles.bannerWrap}>
        <UpgradeBanner
          title="Unlock full forecasts"
          body="Upgrade to Pro for price-range forecasts, live sentiment, and deep pattern analysis."
        />
      </View>
      <View style={styles.actionsRow}>
        <MarketActionBtn
          icon="flask-outline"
          label="Practice trade"
          onPress={() => router.push('/markets/practice')}
        />
        <MarketActionBtn
          icon={liveData ? 'refresh-outline' : 'shuffle-outline'}
          label={liveData ? 'Refresh prices' : 'Regenerate market'}
          onPress={confirmRegenerate}
        />
        <MarketActionBtn
          icon="camera-outline"
          label="Scan"
          onPress={() => router.push('/scanner')}
        />
        <MarketActionBtn
          icon="analytics-outline"
          label="Backtest"
          onPress={() => router.push('/markets/backtest')}
        />
      </View>
      <View style={styles.listWrap}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={
            liveSearching ? (
              <View style={styles.liveSearchCenter}>
                <Text style={{ color: colors.text3, marginTop: spacing.sm }}>Searching the wider market…</Text>
                <SkeletonList rows={3} />
              </View>
            ) : liveResults.length > 0 ? (
              <View>
                <Text style={[styles.liveSearchHeading, { color: colors.text3 }]}>Not in this app's tracked list, but found on the market:</Text>
                {liveResults.map((r) => (
                  <Pressable
                    key={r.symbol}
                    style={[styles.liveResultRow, { borderColor: colors.border }]}
                    onPress={() => router.push(`/markets/${r.symbol}`)}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{r.symbol}</Text>
                      <Text style={{ color: colors.text3, fontSize: 12.5 }} numberOfLines={1}>
                        {r.name}
                        {r.exchange ? ` · ${r.exchange}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.text3} />
                  </Pressable>
                ))}
                <Text style={[styles.liveSearchFootnote, { color: colors.text3 }]}>
                  These aren't part of this app's mock-trading universe — you can look up their live price, but not buy or sell them here.
                </Text>
              </View>
            ) : (
              <EmptyState icon="🔍" title="No matches" message="Try a different symbol or company name." />
            )
          }
          renderItem={({ item, index }) => {
            const watched = watchlist.includes(item.symbol);
            return (
              <Animated.View entering={FadeInDown.delay(Math.min(index * 35, 400)).springify().damping(16)}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <StockListItem
                      symbol={item.symbol}
                      name={item.name}
                      quote={quotes.get(item.symbol)}
                      onPress={() => router.push(`/markets/${item.symbol}`)}
                      onSwipeLeft={() => toggleWatchlist(item.symbol)}
                      onSwipeRight={() => router.push(`/markets/${item.symbol}`)}
                    />
                  </View>
                  <StarButton symbol={item.symbol} watched={watched} onToggle={() => toggleWatchlist(item.symbol)} />
                </View>
              </Animated.View>
            );
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
  liveSearchCenter: { alignItems: 'center', paddingVertical: spacing.xxl },
  liveSearchHeading: { fontSize: 12.5, marginBottom: spacing.sm, paddingHorizontal: 2 },
  liveResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  liveSearchFootnote: { fontSize: 11.5, lineHeight: 15, marginTop: spacing.md },
  searchWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  bannerWrap: { paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
  // 4 actions no longer fit one row without squeezing labels like "Practice
  // trade" onto two lines with the icon flush against the rounded corner
  // (no horizontal padding to inset it) — wraps to 2x2 instead, same fix as
  // Home's quick-actions row.
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  actionBtn: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
  },
  actionLabel: { fontSize: 12.5, fontWeight: '600' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center' },
});
