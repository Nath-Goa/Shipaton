import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { TICKERS, tickerOf } from '@/constants/tickers';
import { trackingFor } from '@/constants/typography';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { money, signedPct } from '@/utils/money';

const SPOTLIGHT_SYMBOLS = TICKERS.map((ticker) => ticker.symbol);
// Poll the in-memory cache frequently so an async provider response becomes
// visible promptly. Network requests remain independently TTL-gated and
// throttled by liveMarketData.ts, so this does not hammer the provider.
const SPOTLIGHT_POLL_MS = 5_000;

export function MarketSpotlightCard() {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const { quotes } = useQuotes(SPOTLIGHT_SYMBOLS, SPOTLIGHT_POLL_MS);

  const spotlight = useMemo(() => {
    const currentQuotes = Array.from(quotes.values());
    if (currentQuotes.length === 0) return null;
    return currentQuotes.reduce((biggest, quote) =>
      Math.abs(quote.changePct) > Math.abs(biggest.changePct) ? quote : biggest
    );
  }, [quotes]);

  if (!spotlight) return null;
  const ticker = tickerOf(spotlight.symbol);
  const up = spotlight.changePct >= 0;

  return (
    <Animated.View
      entering={
        // §14: reduced motion drops elastic/spring entrances for a short
        // opacity cross-fade instead of a slide+spring.
        reducedMotion ? FadeIn.duration(150) : FadeInDown.delay(100).springify().damping(16)
      }>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Market spotlight</Text>
        <View style={[styles.livePill, { backgroundColor: colors.accentSoft }]}>
          <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.liveText, { color: colors.accent }]}>AUTO</Text>
        </View>
      </View>
      <Card style={{ marginTop: spacing.md }}>
        <View style={styles.row}>
          <Text style={styles.emoji}>{up ? '📈' : '📉'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headline, { color: colors.text }]}>
              {spotlight.symbol} {up ? 'jumped' : 'dropped'} {signedPct(spotlight.changePct)} today
            </Text>
            <Text style={[styles.subtext, { color: colors.text3 }]} numberOfLines={2}>
              {ticker?.name ?? spotlight.symbol} · {money(spotlight.price)} · updates automatically
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emoji: { fontSize: 24 },
  headline: { fontSize: 14, fontWeight: '700' },
  subtext: { fontSize: 12, marginTop: 2, lineHeight: 16, letterSpacing: trackingFor(12) },
});
