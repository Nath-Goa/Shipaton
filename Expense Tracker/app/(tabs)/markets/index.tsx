import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { TopBar } from '@/components/ui/TopBar';
import { springs, triggerHaptic } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
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
    triggerHaptic('light');
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
    triggerHaptic('selection');
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
  const { quotes, refresh } = useQuotes(symbols);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TICKERS;
    return TICKERS.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [query]);

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
      <Animated.View entering={FadeInDown.duration(300).springify().damping(16)} style={styles.searchWrap}>
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
      <Animated.View entering={FadeInDown.delay(60).springify().damping(16)} style={styles.actionsRow}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
