import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { DirectionBadge } from '@/components/stocks/DirectionBadge';
import { StockListItem } from '@/components/stocks/StockListItem';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { TopBar } from '@/components/ui/TopBar';
import { springs, triggerFeedback } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { TIER_LABELS } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { useQuotes } from '@/hooks/useQuotes';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { computeDirectionCall } from '@/services/market/signals';
import { getFullHistory } from '@/services/marketData/marketData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { money, signedMoney, signedPct } from '@/utils/money';
import { summarizePortfolio } from '@/utils/portfolioMath';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const { colors } = useTheme();
  const { cash, holdings } = useActivePortfolio();
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();

  const trackedSymbols = useMemo(
    () => Array.from(new Set([...Object.keys(holdings), ...watchlist])),
    [holdings, watchlist]
  );
  const { quotes, refresh } = useQuotes(trackedSymbols);

  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);

  return (
    <Screen>
      <TopBar
        title="Home"
        subtitle="Your mock portfolio, at a glance"
        right={<IconButton name="settings-outline" onPress={() => router.push('/settings')} />}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}>
        {/* Animated Staggered Stats Row */}
        <Animated.View entering={FadeInDown.duration(400).springify().damping(16)} style={styles.statsRow}>
          <StatTile label="Net worth" value={money(summary.netWorth)} sub={`Cash: ${money(cash)}`} />
          <StatTile
            label="Today's P&L"
            value={signedMoney(summary.todayPnl)}
            sub={signedPct(summary.todayPnlPct)}
            valueColor={summary.todayPnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile
            label="All-time P&L"
            value={signedMoney(summary.allTimePnl)}
            sub={signedPct(summary.allTimePnlPct)}
            valueColor={summary.allTimePnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile label="Positions" value={String(summary.positionsCount)} sub={`Plan: ${TIER_LABELS[tier]}`} />
        </Animated.View>

        {tier === 'free' ? (
          <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
            <Pressable onPress={() => upgradeToTier('pro')}>
              <Card style={[styles.upsell, { borderColor: colors.accent }]}>
                <Ionicons name="sparkles" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.upsellTitle, { color: colors.text }]}>Unlock full forecasts</Text>
                  <Text style={[styles.upsellBody, { color: colors.text3 }]}>
                    Upgrade to Pro for price-range forecasts, live sentiment, and an unlimited analyst.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text3} />
              </Card>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Watchlist Section with Entrance Transition */}
        <Animated.View entering={FadeInDown.delay(140).springify().damping(16)}>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Watchlist</Text>
            <Pressable onPress={() => router.push('/markets')}>
              <Text style={[styles.link, { color: colors.accent }]}>See all markets</Text>
            </Pressable>
          </View>
          <Card>
            {watchlist.length === 0 ? (
              <EmptyState
                icon="⭐"
                title="No stocks watched yet"
                message="Browse mock stocks and tap the star to add one to your watchlist."
                actionLabel="Explore markets"
                onAction={() => router.push('/markets')}
              />
            ) : (
              watchlist.map((symbol) => {
                const t = tickerOf(symbol);
                const direction = computeDirectionCall(symbol, getFullHistory(symbol)).direction;
                return (
                  <View key={symbol} style={styles.watchRow}>
                    <View style={{ flex: 1 }}>
                      <StockListItem
                        symbol={symbol}
                        name={t?.name ?? symbol}
                        quote={quotes.get(symbol)}
                        onPress={() => router.push(`/markets/${symbol}`)}
                      />
                    </View>
                    <DirectionBadge direction={direction} size="sm" />
                  </View>
                );
              })
            )}
          </Card>
        </Animated.View>

        {/* Quick Actions with Spring Press Scale */}
        <Animated.View entering={FadeInDown.delay(200).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.md }]}>Quick actions</Text>
          <View style={styles.actionsRow}>
            <QuickAction icon="receipt-outline" label="Log expense" onPress={() => router.push('/expenses/add')} />
            <QuickAction icon="stats-chart-outline" label="Explore markets" onPress={() => router.push('/markets')} />
            <QuickAction icon="sparkles-outline" label="Ask the analyst" onPress={() => router.push('/assistant')} />
          </View>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

function QuickAction({
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
    scale.value = withSpring(0.94, springs.snappy);
    triggerFeedback('navigation');
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
      style={[styles.actionItem, animatedStyle]}>
      <Card style={styles.actionCard}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
      </Card>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl, paddingBottom: spacing.xxl },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  upsell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  upsellTitle: { fontSize: 14.5, fontWeight: '700' },
  upsellBody: { fontSize: 12.5, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.md },
  actionItem: { flex: 1 },
  actionCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
