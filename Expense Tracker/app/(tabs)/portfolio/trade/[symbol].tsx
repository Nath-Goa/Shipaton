import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { springs, triggerHaptic } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { subscribeLiveQuote } from '@/services/marketData/mockMarketData';
import { usePortfolioStore } from '@/store/usePortfolioStore';
import { useToastStore } from '@/store/useToastStore';
import type { Quote } from '@/types/stock';
import { money } from '@/utils/money';

type Side = 'buy' | 'sell';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function QtyButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, springs.snappy);
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
      style={[styles.qtyBtn, { borderColor: colors.border }, animatedStyle]}>
      <Text style={[styles.qtyBtnText, { color: colors.text }]}>{label}</Text>
    </AnimatedPressable>
  );
}

export default function TradeScreen() {
  const { symbol: rawSymbol, side: rawSide } = useLocalSearchParams<{ symbol: string; side?: string }>();
  const symbol = (rawSymbol ?? '').toUpperCase();
  const { colors } = useTheme();
  const ticker = tickerOf(symbol);
  const { cash, holdings, buy, sell } = usePortfolioStore();
  const showToast = useToastStore((s) => s.show);

  const [side, setSide] = useState<Side>(rawSide === 'sell' ? 'sell' : 'buy');
  const [qtyText, setQtyText] = useState('1');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref (not state) so a rapid double-tap is blocked synchronously, without
  // waiting on a render to commit the "already submitting" flag.
  const submittingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeLiveQuote(symbol, setQuote);
      return unsubscribe;
    }, [symbol])
  );

  const price = quote?.price ?? ticker?.basePrice ?? 0;
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const total = qty * price;
  const owned = holdings[symbol]?.qty ?? 0;

  function adjustQty(delta: number) {
    setQtyText((prev) => {
      const current = Math.max(0, Math.floor(Number(prev) || 0));
      return String(Math.max(1, current + delta));
    });
  }

  function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    const result = side === 'buy' ? buy(symbol, qty, price) : sell(symbol, qty, price);
    if (!result.ok) {
      submittingRef.current = false;
      setError(result.message);
      return;
    }
    showToast(`${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${symbol} @ ${money(price)}`);
    router.back();
  }

  if (!ticker) {
    return (
      <Screen>
        <View style={styles.content}>
          <Text style={{ color: colors.text }}>Unknown symbol.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: `Trade ${symbol}` }} />
      <Animated.View entering={FadeInDown.duration(300).springify().damping(16)} style={styles.content}>
        <View>
          <Text style={[styles.name, { color: colors.text3 }]}>{ticker.name}</Text>
          <Text style={[styles.price, { color: colors.text }]}>{money(price)}</Text>
        </View>

        <SegmentedControl
          options={[
            { value: 'buy', label: 'Buy' },
            { value: 'sell', label: 'Sell' },
          ]}
          value={side}
          onChange={(v) => {
            setSide(v as Side);
            setError(null);
          }}
        />

        <Card>
          <Text style={[styles.label, { color: colors.text3 }]}>Quantity</Text>
          <View style={styles.qtyRow}>
            <QtyButton label="−" onPress={() => adjustQty(-1)} />
            <TextInput
              value={qtyText}
              onChangeText={setQtyText}
              keyboardType="number-pad"
              style={[styles.qtyInput, { color: colors.text, borderColor: colors.border }]}
            />
            <QtyButton label="+" onPress={() => adjustQty(1)} />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.text3 }]}>Estimated total</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{money(total)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.text3 }]}>
              {side === 'buy' ? 'Cash available' : 'Shares owned'}
            </Text>
            <Text style={[styles.summaryValue, { color: colors.text2 }]}>
              {side === 'buy' ? money(cash) : `${owned} sh`}
            </Text>
          </View>
        </Card>

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Button
          label={`${side === 'buy' ? 'Buy' : 'Sell'} ${qty || ''} ${symbol}`.trim()}
          variant={side === 'buy' ? 'primary' : 'danger'}
          fullWidth
          disabled={qty <= 0}
          onPress={submit}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg },
  name: { fontSize: 13, fontWeight: '600' },
  price: { fontSize: 26, fontWeight: '700', marginTop: 2 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  qtyBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 20, fontWeight: '600' },
  qtyInput: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingVertical: 9,
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  error: { fontSize: 13, fontWeight: '600' },
});
