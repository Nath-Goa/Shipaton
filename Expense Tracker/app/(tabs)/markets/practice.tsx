import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { StockListItem } from '@/components/stocks/StockListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { springs, triggerHaptic } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS, tickerOf } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { money, signedMoney } from '@/utils/money';

const SANDBOX_CASH = 100_000;

type SandboxHolding = { symbol: string; qty: number; avgCost: number };
type Side = 'buy' | 'sell';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function PracticeQtyButton({ label, onPress }: { label: string; onPress: () => void }) {
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

// A consequence-free scratchpad: local component state only, never touches
// usePortfolioStore. Resets automatically every time this screen is opened.
export default function PracticeTradeScreen() {
  const { colors } = useTheme();
  const [cash, setCash] = useState(SANDBOX_CASH);
  const [holdings, setHoldings] = useState<Record<string, SandboxHolding>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('buy');
  const [qtyText, setQtyText] = useState('1');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const symbols = useMemo(() => TICKERS.map((t) => t.symbol), []);
  const { quotes } = useQuotes(symbols, 4000);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TICKERS;
    return TICKERS.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q));
  }, [query]);

  const holdingsValue = Object.values(holdings).reduce(
    (s, h) => s + (quotes.get(h.symbol)?.price ?? h.avgCost) * h.qty,
    0
  );
  const netWorth = cash + holdingsValue;
  const pnl = netWorth - SANDBOX_CASH;

  const ticker = selected ? tickerOf(selected) : undefined;
  const price = selected ? (quotes.get(selected)?.price ?? ticker?.basePrice ?? 0) : 0;
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const owned = selected ? (holdings[selected]?.qty ?? 0) : 0;

  function resetSandbox() {
    triggerHaptic('medium');
    setCash(SANDBOX_CASH);
    setHoldings({});
    setMessage(null);
  }

  function adjustQty(delta: number) {
    setQtyText((prev) => {
      const current = Math.max(0, Math.floor(Number(prev) || 0));
      return String(Math.max(1, current + delta));
    });
  }

  function trade() {
    if (!selected || qty <= 0) return;
    setMessage(null);
    if (side === 'buy') {
      const cost = qty * price;
      if (cost > cash) {
        setMessage("That's more than your sandbox cash.");
        triggerHaptic('warning');
        return;
      }
      triggerHaptic('success');
      setCash((c) => c - cost);
      setHoldings((h) => {
        const existing = h[selected];
        const newQty = (existing?.qty ?? 0) + qty;
        const newAvgCost = existing ? (existing.avgCost * existing.qty + cost) / newQty : price;
        return { ...h, [selected]: { symbol: selected, qty: newQty, avgCost: newAvgCost } };
      });
      setMessage(`Bought ${qty} ${selected} @ ${money(price)} (practice only).`);
    } else {
      const existing = holdings[selected];
      if (!existing || existing.qty < qty) {
        setMessage("You don't own that many shares in this sandbox.");
        triggerHaptic('warning');
        return;
      }
      triggerHaptic('success');
      const proceeds = qty * price;
      setCash((c) => c + proceeds);
      setHoldings((h) => {
        const next = { ...h };
        const remaining = existing.qty - qty;
        if (remaining <= 0) delete next[selected];
        else next[selected] = { ...existing, qty: remaining };
        return next;
      });
      setMessage(`Sold ${qty} ${selected} @ ${money(price)} (practice only).`);
    }
    setQtyText('1');
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Animated.View entering={FadeInDown.duration(300).springify().damping(16)} style={styles.content}>
        <Card style={styles.summary}>
          <View>
            <Text style={[styles.summaryLabel, { color: colors.text3 }]}>Sandbox net worth</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{money(netWorth)}</Text>
            <Text style={[styles.summarySub, { color: pnl >= 0 ? colors.success : colors.danger }]}>
              {signedMoney(pnl)} vs starting $100,000
            </Text>
          </View>
          <Button label="Reset" variant="ghost" onPress={resetSandbox} />
        </Card>
        <Text style={[styles.disclaimer, { color: colors.text3 }]}>
          Practice sandbox — trades here are separate from your real mock portfolio and reset when you leave.
        </Text>

        {!selected ? (
          <>
            <View style={[styles.searchBox, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search symbol or company"
                placeholderTextColor={colors.text3}
                style={[styles.searchInput, { color: colors.text }]}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(t) => t.symbol}
              style={styles.list}
              renderItem={({ item }) => (
                <StockListItem
                  symbol={item.symbol}
                  name={item.name}
                  quote={quotes.get(item.symbol)}
                  onPress={() => {
                    setSelected(item.symbol);
                    setMessage(null);
                    setQtyText('1');
                  }}
                />
              )}
              ListEmptyComponent={<EmptyState icon="🔍" title="No matches" />}
            />
          </>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <Pressable onPress={() => setSelected(null)}>
              <Text style={[styles.changeStock, { color: colors.accent }]}>← Choose a different stock</Text>
            </Pressable>

            <View>
              <Text style={[styles.stockName, { color: colors.text3 }]}>{ticker?.name}</Text>
              <Text style={[styles.stockPrice, { color: colors.text }]}>
                {selected} · {money(price)}
              </Text>
            </View>

            <SegmentedControl
              options={[
                { value: 'buy', label: 'Buy' },
                { value: 'sell', label: 'Sell' },
              ]}
              value={side}
              onChange={(v) => {
                setSide(v as Side);
                setMessage(null);
              }}
            />

            <Card>
              <Text style={[styles.label, { color: colors.text3 }]}>Quantity</Text>
              <View style={styles.qtyRow}>
                <PracticeQtyButton label="−" onPress={() => adjustQty(-1)} />
                <TextInput
                  value={qtyText}
                  onChangeText={setQtyText}
                  keyboardType="number-pad"
                  style={[styles.qtyInput, { color: colors.text, borderColor: colors.border }]}
                />
                <PracticeQtyButton label="+" onPress={() => adjustQty(1)} />
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryRowLabel, { color: colors.text3 }]}>Estimated total</Text>
                <Text style={[styles.summaryRowValue, { color: colors.text }]}>{money(qty * price)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryRowLabel, { color: colors.text3 }]}>
                  {side === 'buy' ? 'Sandbox cash' : 'Sandbox shares owned'}
                </Text>
                <Text style={[styles.summaryRowValue, { color: colors.text2 }]}>
                  {side === 'buy' ? money(cash) : `${owned} sh`}
                </Text>
              </View>
            </Card>

            {message ? <Text style={[styles.message, { color: colors.text2 }]}>{message}</Text> : null}

            <Button
              label={`${side === 'buy' ? 'Buy' : 'Sell'} ${qty || ''} ${selected}`.trim()}
              variant={side === 'buy' ? 'primary' : 'danger'}
              fullWidth
              disabled={qty <= 0}
              onPress={trade}
            />
          </View>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.xl, gap: spacing.md },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  summarySub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  disclaimer: { fontSize: 12, lineHeight: 16 },
  searchBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  searchInput: { paddingVertical: 10, fontSize: 14 },
  list: { flex: 1 },
  changeStock: { fontSize: 13, fontWeight: '600' },
  stockName: { fontSize: 13, fontWeight: '600' },
  stockPrice: { fontSize: 22, fontWeight: '700', marginTop: 2 },
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
    paddingVertical: 8,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  summaryRowLabel: { fontSize: 13 },
  summaryRowValue: { fontSize: 14, fontWeight: '600' },
  message: { fontSize: 13, fontWeight: '600' },
});
