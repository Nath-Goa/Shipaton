import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { springs, triggerFeedback } from '@/constants/animations';
import { badgeInfo } from '@/constants/badges';
import { radius, spacing } from '@/constants/theme';
import { TIER_FEATURES } from '@/constants/subscription';
import { tickerOf } from '@/constants/tickers';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { subscribeLiveQuote } from '@/services/marketData/marketData';
import { useActivePortfolio, usePortfolioStore } from '@/store/usePortfolioStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import type { Quote } from '@/types/stock';
import { money } from '@/utils/money';

type Side = 'buy' | 'sell';
type OrderType = 'market' | 'limit';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function QtyButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.88, springs.snappy);
    triggerFeedback('selection');
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
  const { cash, holdings, limitOrders } = useActivePortfolio();
  const { buy, sell, placeLimitOrder, cancelLimitOrder } = usePortfolioStore();
  const tier = useSettingsStore((s) => s.tier);
  const features = TIER_FEATURES[tier];
  const upgradeToTier = useUpgradeToTier();
  const showToast = useToastStore((s) => s.show);

  const [side, setSide] = useState<Side>(rawSide === 'sell' ? 'sell' : 'buy');
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [qtyText, setQtyText] = useState('1');
  const [limitPriceText, setLimitPriceText] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ref (not state) so a rapid double-tap is blocked synchronously, without
  // waiting on a render to commit the "already submitting" flag.
  const submittingRef = useRef(false);

  // Expo Router can reuse this same screen instance across navigations to
  // the same route with a different `side` param (e.g. Sell, back, then
  // Buy on another stock) — the useState initializer above only runs once
  // on mount, so without this the tab stays stuck on whichever side it
  // first opened with.
  useEffect(() => {
    setSide(rawSide === 'sell' ? 'sell' : 'buy');
  }, [rawSide]);

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = subscribeLiveQuote(symbol, setQuote);
      return unsubscribe;
    }, [symbol])
  );

  const price = quote?.price ?? ticker?.basePrice ?? 0;
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const limitPrice = Math.max(0, Number(limitPriceText) || 0);
  const total = qty * (orderType === 'limit' && limitPrice > 0 ? limitPrice : price);
  const owned = holdings[symbol]?.qty ?? 0;
  const symbolOrders = limitOrders.filter((o) => o.symbol === symbol);

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

    if (orderType === 'limit') {
      if (limitPrice <= 0) {
        submittingRef.current = false;
        setError('Enter a valid target price.');
        return;
      }
      const result = placeLimitOrder(symbol, side, qty, limitPrice);
      if (!result.ok) {
        submittingRef.current = false;
        setError(result.message);
        return;
      }
      showToast(
        `Limit order placed: ${side === 'buy' ? 'buy' : 'sell'} ${qty} ${symbol} at ${money(limitPrice)}`
      );
      router.back();
      return;
    }

    const result = side === 'buy' ? buy(symbol, qty, price) : sell(symbol, qty, price);
    if (!result.ok) {
      submittingRef.current = false;
      setError(result.message);
      return;
    }
    const base = `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${symbol} @ ${money(price)}`;
    const badge = 'badgeEarned' in result ? result.badgeEarned : undefined;
    showToast(badge ? `${base} · 🏅 ${badgeInfo(badge).label} badge earned!` : base);
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

        {features.limitOrders ? (
          <SegmentedControl
            options={[
              { value: 'market', label: 'Market order' },
              { value: 'limit', label: 'Limit order' },
            ]}
            value={orderType}
            onChange={(v) => {
              setOrderType(v as OrderType);
              setError(null);
            }}
          />
        ) : (
          <Pressable onPress={() => upgradeToTier('max')}>
            <Card style={styles.lockedRow}>
              <Ionicons name="lock-closed" size={14} color={colors.text3} />
              <Text style={[styles.lockedText, { color: colors.text3 }]}>
                Limit orders — fill automatically at a target price. Max only.
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.text3} />
            </Card>
          </Pressable>
        )}

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

          {orderType === 'limit' ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={[styles.label, { color: colors.text3 }]}>
                Target price ({side === 'buy' ? 'fills at or below' : 'fills at or above'})
              </Text>
              <TextInput
                value={limitPriceText}
                onChangeText={setLimitPriceText}
                keyboardType="decimal-pad"
                placeholder={price.toFixed(2)}
                placeholderTextColor={colors.text3}
                style={[styles.limitInput, { color: colors.text, borderColor: colors.border, marginTop: spacing.sm }]}
              />
            </View>
          ) : null}

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

        {symbolOrders.length > 0 ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={[styles.label, { color: colors.text3 }]}>Pending orders</Text>
            {symbolOrders.map((o) => (
              <View key={o.id} style={styles.pendingRow}>
                <Text style={[styles.pendingText, { color: colors.text }]}>
                  {o.side === 'buy' ? 'Buy' : 'Sell'} {o.qty} @ {money(o.targetPrice)}
                </Text>
                <Pressable hitSlop={8} onPress={() => cancelLimitOrder(o.id)}>
                  <Ionicons name="close-circle" size={20} color={colors.text3} />
                </Pressable>
              </View>
            ))}
          </Card>
        ) : null}

        {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}

        <Button
          label={
            orderType === 'limit'
              ? `Place ${side === 'buy' ? 'buy' : 'sell'} limit order`
              : `${side === 'buy' ? 'Buy' : 'Sell'} ${qty || ''} ${symbol}`.trim()
          }
          variant={side === 'buy' ? 'primary' : 'danger'}
          fullWidth
          disabled={qty <= 0 || (orderType === 'limit' && limitPrice <= 0)}
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
  limitInput: {
    textAlign: 'center',
    fontSize: 16,
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
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockedText: { fontSize: 12, flex: 1 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pendingText: { fontSize: 13, fontWeight: '600' },
});
