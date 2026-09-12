import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DirectionBadge } from '@/components/stocks/DirectionBadge';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { TICKERS, tickerOf } from '@/constants/tickers';
import { trackingFor } from '@/constants/typography';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { runBacktest } from '@/services/market/backtest';
import { useSettingsStore } from '@/store/useSettingsStore';
import type { Direction } from '@/types/stock';

const HORIZON_OPTIONS: { value: '7' | '30'; label: string }[] = [
  { value: '7', label: '7-day' },
  { value: '30', label: '30-day' },
];

const DIRECTION_LABEL: Record<Direction, string> = { up: 'Up', down: 'Down', flat: 'Flat' };

export default function BacktestScreen() {
  const { colors } = useTheme();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const upgradeToTier = useUpgradeToTier();

  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState(TICKERS[0].symbol);
  const [horizon, setHorizon] = useState<'7' | '30'>('7');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TICKERS;
    return TICKERS.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [query]);

  const result = useMemo(() => runBacktest(symbol, Number(horizon)), [symbol, horizon]);
  const ticker = tickerOf(symbol);

  if (!features.backtesting) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <TopBar title="Backtest" />
        <EmptyState
          icon="🔒"
          title="Backtesting is a Max feature"
          message="See how the direction-call algorithm would've performed historically, symbol by symbol, with a full accuracy breakdown."
          actionLabel="Upgrade to Max"
          onAction={() => upgradeToTier('max')}
        />
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <TopBar title="Backtest" subtitle="How the direction call would've done historically" />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Card>
            <Text style={[styles.label, { color: colors.text3 }]}>Horizon</Text>
            <View style={{ marginTop: spacing.sm }}>
              <SegmentedControl options={HORIZON_OPTIONS} value={horizon} onChange={setHorizon} />
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
          <View>
            <Text style={[styles.label, { color: colors.text3 }]}>Symbol</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search symbol or company"
              placeholderTextColor={colors.text3}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {filtered.map((t) => (
                <Chip key={t.symbol} label={t.symbol} active={symbol === t.symbol} onPress={() => setSymbol(t.symbol)} />
              ))}
            </ScrollView>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify().damping(16)}>
          <Card>
            <Text style={[styles.resultTitle, { color: colors.text }]}>
              {ticker?.name ?? symbol} · {horizon}-day calls
            </Text>
            <Text style={[styles.resultSub, { color: colors.text3 }]}>
              {result.sampleSize} simulated calls across the available mock history
            </Text>

            <View style={styles.statsRow}>
              <StatTile
                label="Accuracy"
                value={`${result.accuracyPct.toFixed(1)}%`}
                sub={`${result.hits} of ${result.sampleSize} correct`}
                valueColor={result.accuracyPct >= 50 ? colors.success : colors.danger}
              />
            </View>

            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {(Object.keys(result.byDirection) as Direction[]).map((d) => {
                const bucket = result.byDirection[d];
                const pct = bucket.predicted ? (bucket.correct / bucket.predicted) * 100 : 0;
                return (
                  <View key={d} style={[styles.directionRow, { borderColor: colors.border }]}>
                    <DirectionBadge direction={d} size="sm" />
                    <Text style={[styles.directionLabel, { color: colors.text2 }]}>{DIRECTION_LABEL[d]} calls</Text>
                    <Text style={[styles.directionValue, { color: colors.text }]}>
                      {bucket.predicted ? `${pct.toFixed(0)}% of ${bucket.predicted}` : '—'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).springify().damping(16)}>
          <Text style={[styles.disclaimer, { color: colors.text3 }]}>
            Simulated against this app's mock price history — a replay of the same algorithm the Direction call card
            uses, for practice only. Not a guarantee of future accuracy, real or simulated.
          </Text>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  searchInput: {
    marginTop: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    letterSpacing: trackingFor(14),
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, paddingVertical: 2 },
  resultTitle: { fontSize: 15.5, letterSpacing: trackingFor(15.5), fontWeight: '700' },
  resultSub: { fontSize: 12.5, letterSpacing: trackingFor(12.5), marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  directionLabel: { fontSize: 13, letterSpacing: trackingFor(13), flex: 1 },
  directionValue: { fontSize: 13, letterSpacing: trackingFor(13), fontWeight: '700' },
  disclaimer: { fontSize: 11.5, letterSpacing: trackingFor(11.5), lineHeight: 16, textAlign: 'center' },
});
