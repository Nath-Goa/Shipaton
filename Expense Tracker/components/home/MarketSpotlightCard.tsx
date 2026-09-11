import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { tickerOf } from '@/constants/tickers';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTheme } from '@/hooks/useTheme';
import { getAllQuotes } from '@/services/marketData/marketData';
import { signedPct } from '@/utils/money';

// A read-only "scripted event" — narrates the biggest real move already
// present in today's price data rather than injecting new volatility into
// the market-data engine. Naturally stable through the day since quotes
// don't drift here (no live subscription).
const MIN_INTERESTING_MOVE_PCT = 3;

export function MarketSpotlightCard() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();

  const spotlight = useMemo(() => {
    const quotes = getAllQuotes();
    if (quotes.length === 0) return null;
    return quotes.reduce((biggest, q) => (Math.abs(q.changePct) > Math.abs(biggest.changePct) ? q : biggest));
  }, []);

  if (!spotlight || Math.abs(spotlight.changePct) < MIN_INTERESTING_MOVE_PCT) return null;
  const ticker = tickerOf(spotlight.symbol);
  const up = spotlight.changePct >= 0;

  return (
    <Animated.View
      entering={
        // §14: reduced motion drops elastic/spring entrances for a short
        // opacity cross-fade instead of a slide+spring.
        reducedMotion ? FadeIn.duration(150) : FadeInDown.delay(100).springify().damping(16)
      }>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Market spotlight</Text>
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.row}>
          <Text style={styles.emoji}>{up ? '📈' : '📉'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headline, { color: colors.text }]}>
              {spotlight.symbol} {up ? 'jumped' : 'dropped'} {signedPct(spotlight.changePct)} today
            </Text>
            <Text style={[styles.subtext, { color: colors.text3 }]} numberOfLines={2}>
              {ticker?.name ?? spotlight.symbol} — one of the day's biggest movers.
            </Text>
          </View>
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Learn why prices move like this"
            variant="ghost"
            fullWidth
            onPress={() => router.push({ pathname: '/learn/quiz', params: { topic: 'volatility' } })}
          />
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 24 },
  headline: { fontSize: 14, fontWeight: '700' },
  subtext: { fontSize: 12, marginTop: 2, lineHeight: 16, letterSpacing: trackingFor(12) },
});
