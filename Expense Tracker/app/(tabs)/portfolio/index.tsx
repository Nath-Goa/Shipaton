import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { springs, triggerHaptic } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { tickerOf } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { sharePortfolioSummary } from '@/services/export/exportData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import { money, signedMoney, signedPct } from '@/utils/money';
import { summarizePortfolio } from '@/utils/portfolioMath';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function HoldingRow({
  holding,
  quotePrice,
  isFirst,
}: {
  holding: { symbol: string; qty: number; avgCost: number };
  quotePrice?: number;
  isFirst: boolean;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const price = quotePrice ?? holding.avgCost;
  const value = price * holding.qty;
  const pnl = (price - holding.avgCost) * holding.qty;
  const pnlPct = holding.avgCost ? (pnl / (holding.avgCost * holding.qty)) * 100 : 0;

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, springs.snappy);
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
      onPress={() => router.push(`/markets/${holding.symbol}`)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.holdingRow,
        !isFirst && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
        animatedStyle,
      ]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.symbol, { color: colors.text }]}>{holding.symbol}</Text>
        <Text style={[styles.meta, { color: colors.text3 }]}>
          {holding.qty} sh · avg {money(holding.avgCost)}
        </Text>
      </View>
      <View style={styles.holdingRight}>
        <Text style={[styles.value, { color: colors.text }]}>{money(value)}</Text>
        <Text style={[styles.pnl, { color: pnl >= 0 ? colors.success : colors.danger }]}>
          {signedMoney(pnl)} ({signedPct(pnlPct)})
        </Text>
      </View>
    </AnimatedPressable>
  );
}

export default function PortfolioScreen() {
  const { colors } = useTheme();
  const { name, cash, holdings, trades } = useActivePortfolio();
  const portfolioCount = usePortfolioStore((s) => Object.keys(s.portfolios).length);
  const showToast = useToastStore((s) => s.show);

  const symbols = useMemo(() => Object.keys(holdings), [holdings]);
  const { quotes, refresh } = useQuotes(symbols);
  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);
  const holdingList = useMemo(() => Object.values(holdings).sort((a, b) => a.symbol.localeCompare(b.symbol)), [holdings]);

  async function handleShare() {
    const result = await sharePortfolioSummary({
      name,
      netWorth: summary.netWorth,
      cash,
      allTimePnl: summary.allTimePnl,
      allTimePnlPct: summary.allTimePnlPct,
      holdingsCount: summary.positionsCount,
    });
    if (!result.ok) showToast(result.message);
  }

  return (
    <Screen>
      <TopBar
        title="Portfolio"
        subtitle={portfolioCount > 1 ? name : 'Paper trading — no real money involved'}
        right={
          <>
            <IconButton name="share-outline" onPress={handleShare} />
            <IconButton name="trophy-outline" onPress={() => router.push('/portfolio/leaderboard')} />
            <IconButton name="swap-horizontal-outline" onPress={() => router.push('/portfolio/manage')} />
          </>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}>
        {/* Animated Staggered Stats */}
        <Animated.View entering={FadeInDown.duration(350).springify().damping(16)} style={styles.statsRow}>
          <StatTile label="Net worth" value={money(summary.netWorth)} />
          <StatTile label="Cash" value={money(cash)} />
          <StatTile
            label="Today"
            value={signedMoney(summary.todayPnl)}
            valueColor={summary.todayPnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile
            label="All-time"
            value={signedPct(summary.allTimePnlPct)}
            valueColor={summary.allTimePnl >= 0 ? colors.success : colors.danger}
          />
        </Animated.View>

        <UpgradeBanner
          title="Trade with an edge"
          body="Upgrade to Max for historical backtesting and up to 5 separate paper portfolios."
          delay={40}
        />

        {/* Holdings Section */}
        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Holdings</Text>
          <Card style={{ marginTop: spacing.md }}>
            {holdingList.length === 0 ? (
              <EmptyState
                icon="💼"
                title="No positions yet"
                message="Head to Markets and buy your first mock stock with your $100,000 starting cash."
                actionLabel="Explore markets"
                onAction={() => router.push('/markets')}
              />
            ) : (
              holdingList.map((h, i) => (
                <HoldingRow
                  key={h.symbol}
                  holding={h}
                  quotePrice={quotes.get(h.symbol)?.price}
                  isFirst={i === 0}
                />
              ))
            )}
          </Card>
        </Animated.View>

        {/* Recent Trades Section */}
        <Animated.View entering={FadeInDown.delay(160).springify().damping(16)}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent trades</Text>
          <Card style={{ marginTop: spacing.md }}>
            {trades.length === 0 ? (
              <EmptyState icon="🧾" title="No trades yet" message="Your buy and sell history will show up here." />
            ) : (
              trades.slice(0, 10).map((t, i) => (
                <View
                  key={t.id}
                  style={[styles.tradeRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View
                    style={[
                      styles.sideBadge,
                      { backgroundColor: t.side === 'buy' ? colors.successSoft : colors.dangerSoft },
                    ]}>
                    <Text style={{ color: t.side === 'buy' ? colors.success : colors.danger, fontSize: 11, fontWeight: '700' }}>
                      {t.side.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.symbol, { color: colors.text }]}>
                      {t.symbol} · {tickerOf(t.symbol)?.name ?? ''}
                    </Text>
                    <Text style={[styles.meta, { color: colors.text3 }]}>
                      {t.qty} sh @ {money(t.price)} · {new Date(t.date).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={[styles.value, { color: colors.text }]}>{money(t.total)}</Text>
                </View>
              ))
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl, paddingBottom: spacing.xxl },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 2, gap: spacing.md },
  holdingRight: { alignItems: 'flex-end' },
  symbol: { fontSize: 14.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 1 },
  value: { fontSize: 14.5, fontWeight: '600' },
  pnl: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: spacing.md },
  sideBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
});
