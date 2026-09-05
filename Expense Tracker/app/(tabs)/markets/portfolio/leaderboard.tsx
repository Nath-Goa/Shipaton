import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/ui/Card';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useQuotes } from '@/hooks/useQuotes';
import { getLeaderboardBots } from '@/services/leaderboard/leaderboard';
import { useActivePortfolio } from '@/store/usePortfolioStore';
import { money, signedPct } from '@/utils/money';
import { summarizePortfolio } from '@/utils/portfolioMath';

const RANK_MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

type Row = { id: string; name: string; avatar: string; netWorth: number; allTimePnlPct: number; isYou: boolean };

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const { name, cash, holdings } = useActivePortfolio();

  const symbols = useMemo(() => Object.keys(holdings), [holdings]);
  const { quotes } = useQuotes(symbols);
  const summary = useMemo(() => summarizePortfolio(cash, holdings, quotes), [cash, holdings, quotes]);

  const rows = useMemo<Row[]>(() => {
    const bots = getLeaderboardBots().map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      netWorth: b.netWorth,
      allTimePnlPct: b.allTimePnlPct,
      isYou: false,
    }));
    const you: Row = {
      id: 'you',
      name,
      avatar: '🧑',
      netWorth: summary.netWorth,
      allTimePnlPct: summary.allTimePnlPct,
      isYou: true,
    };
    return [...bots, you].sort((a, b) => b.allTimePnlPct - a.allTimePnlPct);
  }, [name, summary.netWorth, summary.allTimePnlPct]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.disclaimer, { color: colors.text3 }]}>
            Simulated leaderboard — these are seeded bot traders generated from the same mock market data, not real
            other people. Ranked by all-time return.
          </Text>
        </Animated.View>

        <Card style={{ padding: 0 }}>
          {rows.map((r, i) => {
            const rank = i + 1;
            return (
              <Animated.View key={r.id} entering={FadeInDown.delay(60 + Math.min(i * 35, 350)).springify().damping(16)}>
                <View
                  style={[
                    styles.row,
                    i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    r.isYou && { backgroundColor: colors.accentSoft },
                  ]}>
                  <Text style={styles.rank}>{RANK_MEDAL[rank] ?? `#${rank}`}</Text>
                  <Text style={styles.avatar}>{r.avatar}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      {r.isYou ? <PillBadge label="You" /> : null}
                    </View>
                    <Text style={[styles.netWorth, { color: colors.text3 }]}>{money(r.netWorth)}</Text>
                  </View>
                  <Text style={[styles.pct, { color: r.allTimePnlPct >= 0 ? colors.success : colors.danger }]}>
                    {signedPct(r.allTimePnlPct)}
                  </Text>
                </View>
              </Animated.View>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  disclaimer: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  rank: { fontSize: 15, fontWeight: '700', width: 28 },
  avatar: { fontSize: 20 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 14.5, fontWeight: '700', flexShrink: 1 },
  netWorth: { fontSize: 12, marginTop: 2 },
  pct: { fontSize: 14, fontWeight: '700' },
});
