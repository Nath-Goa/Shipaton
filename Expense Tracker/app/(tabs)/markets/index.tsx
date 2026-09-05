import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { StockListItem } from '@/components/stocks/StockListItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { springs, triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTabEntrance } from '@/hooks/useTabEntrance';
import { useTheme } from '@/hooks/useTheme';
import { isLiveMarketDataConfigured } from '@/services/marketData/marketData';
import { regenerateMarket } from '@/services/marketData/regenerateMarket';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

function StarButton({ symbol, watched, onToggle }: { symbol: string; watched: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  function handlePress() {
    triggerFeedback('selection');
    scale.value = withSequence(
      withSpring(1.35, springs.bouncy),
      withSpring(1, springs.snappy)
    );
    onToggle();
  }

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Pressable hitSlop={8} onPress={handlePress} style={styles.star}>
      <Animated.View style={animatedStyle}>
        <Ionicons name={watched ? 'star' : 'star-outline'} size={19} color={watched ? colors.warning : colors.text3} />
      </Animated.View>
    </Pressable>
  );
}

export default function MarketsScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const { watchlist, toggleWatchlist } = usePortfolioStore();
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

  const liveData = isLiveMarketDataConfigured();

  const searchEntrance = useTabEntrance(0);
  const actionsEntrance = useTabEntrance(60);
  const listEntrance = useTabEntrance(120);

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
      <Animated.View style={[styles.searchWrap, searchEntrance]}>
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
      </Animated.View>
      <View style={styles.bannerWrap}>
        <UpgradeBanner
          title="Unlock full forecasts"
          body="Upgrade to Pro for price-range forecasts, live sentiment, and deep pattern analysis."
          delay={40}
        />
      </View>
      <Animated.View style={[styles.actionsRow, actionsEntrance]}>
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
          icon="analytics-outline"
          label="Backtest"
          onPress={() => router.push('/markets/backtest')}
        />
      </Animated.View>
      <Animated.View style={[styles.listWrap, listEntrance]}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.symbol}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}
          ListEmptyComponent={<EmptyState icon="🔍" title="No matches" message="Try a different symbol or company name." />}
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
                    />
                  </View>
                  <StarButton symbol={item.symbol} watched={watched} onToggle={() => toggleWatchlist(item.symbol)} />
                </View>
              </Animated.View>
            );
          }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  listWrap: { flex: 1 },
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
  actionsRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 10,
  },
  actionLabel: { fontSize: 12.5, fontWeight: '600' },
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center' },
  star: { paddingLeft: spacing.sm, paddingVertical: spacing.sm },
});
