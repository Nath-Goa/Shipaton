import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { BenchmarkChart } from '@/components/charts/BenchmarkChart';
import { DonutChart, type DonutSegment } from '@/components/charts/DonutChart';
import { MarketsPortfolioSwitch } from '@/components/navigation/MarketsPortfolioSwitch';
import { ResultsCardModal } from '@/components/portfolio/ResultsCardModal';
import { TradeReflectionsCard } from '@/components/portfolio/TradeReflectionsCard';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { springs, triggerFeedback } from '@/constants/animations';
import { spacing } from '@/constants/theme';
import { SECTOR_COLORS, tickerOf } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { sharePortfolioSummary } from '@/services/export/exportData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import { money, signedMoney, signedPct } from '@/utils/money';
import { computePortfolioVsBenchmark, summarizePortfolio } from '@/utils/portfolioMath';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NetWorthTile({ value }: { value: number }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.97, springs.snappy);
    triggerFeedback('navigation');
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, springs.snappy);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPress={() => router.push('/markets/portfolio/networth')}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.netWorthTileWrap, animatedStyle]}>
      <StatTile label="Net worth" value={money(value)} sub="View history →" />
    </AnimatedPressable>
  );
}

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
  const activePortfolio = useActivePortfolio();
  const { name, cash, holdings, trades, dividends, autoInvests } = activePortfolio;
  const portfolioCount = usePortfolioStore((s) => Object.keys(s.portfolios).length);
  const showToast = useToastStore((s) => s.show);

  const symbols = useMemo(() => Object.keys(holdings), [holdings]);
  const { quotes, refresh } = useQuotes(symbols);
  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);
  const holdingList = useMemo(() => Object.values(holdings).sort((a, b) => a.symbol.localeCompare(b.symbol)), [holdings]);
  const dividendTotal = useMemo(() => dividends.reduce((s, d) => s + d.amount, 0), [dividends]);
  const benchmarkPoints = useMemo(() => computePortfolioVsBenchmark(activePortfolio, 90), [activePortfolio]);

  const sectorBreakdown = useMemo(() => {
    const bySector = new Map<string, number>();
    for (const h of holdingList) {
      const ticker = tickerOf(h.symbol);
      if (!ticker) continue;
      const price = quotes.get(h.symbol)?.price ?? h.avgCost;
      bySector.set(ticker.sector, (bySector.get(ticker.sector) ?? 0) + price * h.qty);
    }
    const total = Array.from(bySector.values()).reduce((s, v) => s + v, 0);
    const segments: DonutSegment[] = Array.from(bySector.entries())
      .map(([sector, value]) => ({ id: sector, label: sector, color: SECTOR_COLORS[sector as keyof typeof SECTOR_COLORS], value }))
      .sort((a, b) => b.value - a.value);
    const topShare = total > 0 && segments.length ? segments[0].value / total : 0;
    return { segments, total, topShare, topSector: segments[0]?.label };
  }, [holdingList, quotes]);

  // Contextual micro-lesson: the single biggest same-day move among actual
  // holdings (not the whole universe — that's components/home/
  // MarketSpotlightCard's job), read-only against the existing quotes.
  const bigMoveHolding = useMemo(() => {
    let biggest: { symbol: string; changePct: number } | null = null;
    for (const h of holdingList) {
      const changePct = quotes.get(h.symbol)?.changePct;
      if (changePct == null) continue;
      if (Math.abs(changePct) >= 5 && (!biggest || Math.abs(changePct) > Math.abs(biggest.changePct))) {
        biggest = { symbol: h.symbol, changePct };
      }
    }
    return biggest;
  }, [holdingList, quotes]);

  const [resultsCardOpen, setResultsCardOpen] = useState(false);

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
            <IconButton name="image-outline" onPress={() => setResultsCardOpen(true)} />
            <IconButton name="share-outline" onPress={handleShare} />
            <IconButton name="people-outline" onPress={() => router.push('/markets/portfolio/social')} />
            <IconButton name="trophy-outline" onPress={() => router.push('/markets/portfolio/leaderboard')} />
            <IconButton name="swap-horizontal-outline" onPress={() => router.push('/markets/portfolio/manage')} />
          </>
        }
      />
      <MarketsPortfolioSwitch active="portfolio" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.accent} />}>
        <View style={styles.statsRow}>
          <NetWorthTile value={summary.netWorth} />
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
        </View>

        {benchmarkPoints.length > 1 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>You vs. the market</Text>
            <Card style={{ marginTop: spacing.md }}>
              <BenchmarkChart points={benchmarkPoints} />
            </Card>
          </View>
        ) : null}

        <UpgradeBanner
          title="Trade with an edge"
          body="Upgrade to Max for historical backtesting and up to 5 separate paper portfolios."
        />

        <TradeReflectionsCard />

        {bigMoveHolding ? (
          <View>
            <Pressable onPress={() => router.push({ pathname: '/learn/quiz', params: { topic: 'volatility' } })}>
              <Card style={[styles.moveBanner, { borderColor: colors.accent }]}>
                <Ionicons name="pulse-outline" size={18} color={colors.accent} />
                <Text style={[styles.moveBannerText, { color: colors.text2 }]}>
                  {bigMoveHolding.symbol} moved {signedPct(bigMoveHolding.changePct)} today — want to understand why
                  prices move like this?
                </Text>
              </Card>
            </Pressable>
          </View>
        ) : null}

        {/* Holdings Section */}
        <View>
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
        </View>

        {/* Diversification Section */}
        {sectorBreakdown.segments.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Diversification</Text>
            <Card style={[styles.diversificationCard, { marginTop: spacing.md }]}>
              <DonutChart
                segments={sectorBreakdown.segments}
                centerLabel="Sectors"
                centerValue={String(sectorBreakdown.segments.length)}
                size={140}
                strokeWidth={18}
              />
              <View style={{ flex: 1, gap: 6 }}>
                {sectorBreakdown.segments.map((seg) => (
                  <View key={seg.id} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
                    <Text style={[styles.legendLabel, { color: colors.text2 }]} numberOfLines={1}>
                      {seg.label}
                    </Text>
                    <Text style={[styles.legendPct, { color: colors.text3 }]}>
                      {Math.round((seg.value / sectorBreakdown.total) * 100)}%
                    </Text>
                  </View>
                ))}
                {sectorBreakdown.topShare >= 0.5 ? (
                  <Text style={[styles.diversificationWarning, { color: colors.warning }]}>
                    {Math.round(sectorBreakdown.topShare * 100)}% of this portfolio is in {sectorBreakdown.topSector} —
                    consider diversifying.
                  </Text>
                ) : null}
              </View>
            </Card>
          </View>
        ) : null}

        {/* Auto-invest Plans Section */}
        {autoInvests.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Auto-invest plans</Text>
            <Card style={{ marginTop: spacing.md }}>
              {autoInvests.map((p, i) => (
                <View
                  key={p.id}
                  style={[styles.tradeRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.symbol, { color: colors.text }]}>{p.symbol}</Text>
                    <Text style={[styles.meta, { color: colors.text3 }]}>
                      {p.frequency === 'weekly' ? 'Weekly' : 'Monthly'} · next {p.nextRunDate}
                    </Text>
                  </View>
                  <Text style={[styles.value, { color: colors.text }]}>{money(p.amount)}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Dividend Income Section */}
        {dividends.length > 0 ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Dividend income</Text>
            <Card style={{ marginTop: spacing.md }}>
              <View style={styles.dividendTotalRow}>
                <Text style={[styles.dividendTotalLabel, { color: colors.text3 }]}>Lifetime total</Text>
                <Text style={[styles.dividendTotalValue, { color: colors.success }]}>{money(dividendTotal)}</Text>
              </View>
              {dividends.slice(0, 5).map((d, i) => (
                <View
                  key={d.id}
                  style={[styles.tradeRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.symbol, { color: colors.text }]}>{d.symbol}</Text>
                    <Text style={[styles.meta, { color: colors.text3 }]}>{new Date(d.date).toLocaleDateString()}</Text>
                  </View>
                  <Text style={[styles.value, { color: colors.success }]}>+{money(d.amount)}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {/* Recent Trades Section */}
        <View>
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
        </View>
      </ScrollView>

      <ResultsCardModal
        visible={resultsCardOpen}
        onClose={() => setResultsCardOpen(false)}
        name={name}
        netWorth={summary.netWorth}
        allTimePnl={summary.allTimePnl}
        allTimePnlPct={summary.allTimePnlPct}
        holdingsCount={summary.positionsCount}
        dividendTotal={dividendTotal}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingTop: 0, gap: spacing.xl, paddingBottom: spacing.xxl },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  netWorthTileWrap: { flexGrow: 1, flexBasis: '47%' },
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  moveBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1 },
  moveBannerText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  holdingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 2, gap: spacing.md },
  holdingRight: { alignItems: 'flex-end' },
  symbol: { fontSize: 14.5, fontWeight: '700' },
  meta: { fontSize: 12.5, marginTop: 1 },
  value: { fontSize: 14.5, fontWeight: '600' },
  pnl: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
  tradeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: spacing.md },
  sideBadge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8 },
  diversificationCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12.5, flex: 1 },
  legendPct: { fontSize: 12.5, fontWeight: '600' },
  diversificationWarning: { fontSize: 11.5, lineHeight: 15, marginTop: 4 },
  dividendTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  dividendTotalLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  dividendTotalValue: { fontSize: 17, fontWeight: '700' },
});
