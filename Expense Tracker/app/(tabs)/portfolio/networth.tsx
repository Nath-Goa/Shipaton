import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { PriceChart } from '@/components/charts/PriceChart';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { spacing } from '@/constants/theme';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { useActivePortfolio } from '@/store/usePortfolioStore';
import { money, signedMoney, signedPct } from '@/utils/money';
import { computeNetWorthHistory, summarizePortfolio } from '@/utils/portfolioMath';
import type { PriceBar } from '@/types/stock';

export default function NetWorthScreen() {
  const { colors } = useTheme();
  const portfolio = useActivePortfolio();
  const { cash, holdings } = portfolio;

  const symbols = useMemo(() => Object.keys(holdings), [holdings]);
  const { quotes } = useQuotes(symbols);
  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);

  const history = useMemo(() => computeNetWorthHistory(portfolio, 90), [portfolio]);
  const bars: PriceBar[] = useMemo(
    () => history.map((h) => ({ date: h.date, open: h.netWorth, high: h.netWorth, low: h.netWorth, close: h.netWorth })),
    [history]
  );

  const first = history[0];
  const windowChange = first ? summary.netWorth - first.netWorth : 0;
  const windowChangePct = first && first.netWorth ? (windowChange / first.netWorth) * 100 : 0;
  const cashShare = summary.netWorth > 0 ? (cash / summary.netWorth) * 100 : 0;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Net worth' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.bigValue, { color: colors.text }]}>{money(summary.netWorth)}</Text>
          {bars.length > 1 ? (
            <Text style={[styles.changeLine, { color: windowChange >= 0 ? colors.success : colors.danger }]}>
              {signedMoney(windowChange)} ({signedPct(windowChangePct)}) over this period
            </Text>
          ) : null}
        </Animated.View>

        {bars.length > 1 ? (
          <Animated.View entering={FadeInDown.delay(40).springify().damping(16)}>
            <Card>
              <PriceChart bars={bars} height={180} trend={windowChange >= 0 ? 'up' : 'down'} />
            </Card>
          </Animated.View>
        ) : (
          <EmptyState
            icon="📈"
            title="Not enough history yet"
            message="Make a trade or two — net worth history builds up as you go."
          />
        )}

        <Animated.View entering={FadeInDown.delay(80).springify().damping(16)} style={styles.statsRow}>
          <StatTile label="Cash" value={money(cash)} sub={`${Math.round(cashShare)}% of net worth`} />
          <StatTile label="Holdings value" value={money(summary.holdingsValue)} sub={`${summary.positionsCount} position${summary.positionsCount === 1 ? '' : 's'}`} />
          <StatTile
            label="All-time P&L"
            value={signedMoney(summary.allTimePnl)}
            valueColor={summary.allTimePnl >= 0 ? colors.success : colors.danger}
          />
          <StatTile
            label="Today"
            value={signedMoney(summary.todayPnl)}
            valueColor={summary.todayPnl >= 0 ? colors.success : colors.danger}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify().damping(16)}>
          <Card style={styles.breakdownCard}>
            <View style={[styles.breakdownBar, { backgroundColor: colors.border }]}>
              <View style={[styles.breakdownFill, { width: `${Math.max(0, Math.min(100, cashShare))}%`, backgroundColor: colors.accent }]} />
            </View>
            <View style={styles.breakdownLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.legendText, { color: colors.text2 }]}>Cash · {money(cash)}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
                <Text style={[styles.legendText, { color: colors.text2 }]}>Holdings · {money(summary.holdingsValue)}</Text>
              </View>
            </View>
          </Card>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  bigValue: { fontSize: 34, fontWeight: '700', letterSpacing: -0.6 },
  changeLine: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  breakdownCard: { gap: spacing.md },
  breakdownBar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 5 },
  breakdownLegend: { flexDirection: 'row', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12.5, fontWeight: '600' },
});
