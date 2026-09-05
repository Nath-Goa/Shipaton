import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { MarketSpotlightCard } from '@/components/home/MarketSpotlightCard';
import { DirectionBadge } from '@/components/stocks/DirectionBadge';
import { StockListItem } from '@/components/stocks/StockListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { springs, triggerFeedback } from '@/constants/animations';
import { categoryOf } from '@/constants/categories';
import { spacing } from '@/constants/theme';
import { TIER_LABELS } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { useQuotes } from '@/hooks/useQuotes';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { generateWeeklyRecap } from '@/services/ai/insights';
import { describeAiError } from '@/services/ai/errorMessage';
import { computeDirectionCall } from '@/services/market/signals';
import { getFullHistory } from '@/services/marketData/marketData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useExpenseStore } from '@/store/useExpenseStore';
import { useSavingsGoalStore } from '@/store/useSavingsGoalStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useWeeklyRecapStore } from '@/store/useWeeklyRecapStore';
import { daysAgo } from '@/utils/date';
import { money, signedMoney, signedPct } from '@/utils/money';
import { computeNetWorthHistory, summarizePortfolio } from '@/utils/portfolioMath';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const { colors } = useTheme();
  const portfolio = useActivePortfolio();
  const { cash, holdings } = portfolio;
  const watchlist = usePortfolioStore((s) => s.watchlist);
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const expenses = useExpenseStore((s) => s.expenses);
  const goals = useSavingsGoalStore((s) => s.goals);
  const { recap, setRecap } = useWeeklyRecapStore();
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);

  const trackedSymbols = useMemo(
    () => Array.from(new Set([...Object.keys(holdings), ...watchlist])),
    [holdings, watchlist]
  );
  const { quotes, refresh } = useQuotes(trackedSymbols);

  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);

  const weekPayload = useMemo(() => {
    const since = daysAgo(6);
    const weekExpenses = expenses.filter((e) => e.date >= since);
    const total = weekExpenses.reduce((s, e) => s + e.amount, 0);
    const byCategory = new Map<string, number>();
    for (const e of weekExpenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    const topEntry = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

    const history = computeNetWorthHistory(portfolio, 8);
    const weekChange = history.length >= 2 ? history[history.length - 1].netWorth - history[0].netWorth : null;
    const weekChangePct = weekChange != null && history[0].netWorth ? (weekChange / history[0].netWorth) * 100 : null;
    const goalsSaved = goals.reduce((s, g) => s + g.currentAmount, 0);

    return {
      period: 'last 7 days',
      expenses:
        weekExpenses.length > 0
          ? { total: Number(total.toFixed(2)), count: weekExpenses.length, topCategory: topEntry ? categoryOf(topEntry[0]).label : null }
          : null,
      portfolio: {
        netWorth: Number(summary.netWorth.toFixed(2)),
        weekChange: weekChange != null ? Number(weekChange.toFixed(2)) : null,
        weekChangePct: weekChangePct != null ? Number(weekChangePct.toFixed(2)) : null,
      },
      goals:
        goals.length > 0
          ? { totalSaved: Number(goalsSaved.toFixed(2)), goalsCount: goals.length, goalsReached: goals.filter((g) => g.completedAt).length }
          : null,
    };
  }, [expenses, goals, portfolio, summary.netWorth]);

  async function handleGetRecap() {
    setRecapLoading(true);
    setRecapError(null);
    const result = await generateWeeklyRecap(JSON.stringify(weekPayload));
    setRecapLoading(false);
    if (!result.ok) {
      setRecapError(describeAiError(result.error));
      return;
    }
    setRecap(result.data);
  }

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
        <View style={styles.statsRow}>
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
        </View>

        {tier === 'free' ? (
          <View>
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
          </View>
        ) : null}
        <View>
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
        </View>

        <MarketSpotlightCard />

        {/* Quick Actions with Spring Press Scale */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: spacing.md }]}>Quick actions</Text>
          <View style={styles.actionsRow}>
            <QuickAction icon="pie-chart-outline" label="Portfolio" onPress={() => router.push('/markets/portfolio')} />
            <QuickAction icon="receipt-outline" label="Log expense" onPress={() => router.push('/expenses/add')} />
            <QuickAction icon="stats-chart-outline" label="Explore markets" onPress={() => router.push('/markets')} />
            <QuickAction icon="sparkles-outline" label="Ask the analyst" onPress={() => router.push('/assistant')} />
          </View>
        </View>

        {/* AI Weekly Recap */}
        <View>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Weekly recap</Text>
            {recap ? (
              <Pressable onPress={handleGetRecap} disabled={recapLoading}>
                <Text style={[styles.link, { color: colors.accent }]}>{recapLoading ? 'Refreshing…' : 'Refresh'}</Text>
              </Pressable>
            ) : null}
          </View>
          <Card>
            {recap ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.recapHeadline, { color: colors.text }]}>{recap.headline}</Text>
                {recap.highlights.map((h, i) => (
                  <Text key={i} style={[styles.recapHighlight, { color: colors.text2 }]}>
                    • {h}
                  </Text>
                ))}
                <Text style={[styles.recapTip, { color: colors.accent }]}>💡 {recap.tip}</Text>
              </View>
            ) : (
              <>
                <Text style={[styles.recapIntro, { color: colors.text3 }]}>
                  Get an AI recap of your spending, portfolio, and goals from the last 7 days.
                </Text>
                <View style={{ marginTop: spacing.md }}>
                  <Button label="Get this week's recap" variant="ghost" loading={recapLoading} onPress={handleGetRecap} />
                </View>
              </>
            )}
            {recapError ? <Text style={[styles.recapError, { color: colors.danger }]}>{recapError}</Text> : null}
          </Card>
        </View>
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
  // Four across is too narrow for the labels on a phone, so these wrap to a
  // 2x2 grid: basis under half the row forces two per line, and flexGrow
  // then spreads them to fill it exactly.
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actionItem: { flexGrow: 1, flexBasis: '45%' },
  actionCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  recapIntro: { fontSize: 13, lineHeight: 18 },
  recapHeadline: { fontSize: 14.5, fontWeight: '700', lineHeight: 20 },
  recapHighlight: { fontSize: 13, lineHeight: 18 },
  recapTip: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  recapError: { fontSize: 12.5, fontWeight: '600', marginTop: spacing.sm },
});
