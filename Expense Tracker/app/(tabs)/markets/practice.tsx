import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { StockListItem } from '@/components/stocks/StockListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { QtyStepperButton } from '@/components/ui/QtyStepperButton';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { triggerFeedback } from '@/constants/animations';
import { radius, spacing } from '@/constants/theme';
import { TICKERS, tickerOf } from '@/constants/tickers';
import { useQuotes } from '@/hooks/useQuotes';
import { useTheme } from '@/hooks/useTheme';
import { money, signedMoney, signedPct } from '@/utils/money';

const SANDBOX_CASH = 100_000;

type SandboxHolding = { symbol: string; qty: number; avgCost: number };
type Side = 'buy' | 'sell';

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
  // A pushed screen that remounts fresh on every visit (CLAUDE.md §5.1), so
  // a mount-only fetch already gives one refresh per entry — no need to
  // keep polling while the sandbox is open, matching the rest of the
  // Markets tab.
  const { quotes } = useQuotes(symbols, 0);

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
  const pnlPct = (pnl / SANDBOX_CASH) * 100;
  const pnlColor = pnl >= 0 ? colors.success : colors.danger;

  const ticker = selected ? tickerOf(selected) : undefined;
  const price = selected ? (quotes.get(selected)?.price ?? ticker?.basePrice ?? 0) : 0;
  const qty = Math.max(0, Math.floor(Number(qtyText) || 0));
  const owned = selected ? (holdings[selected]?.qty ?? 0) : 0;

  function resetSandbox() {
    triggerFeedback('destructive');
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
        triggerFeedback('error');
        return;
      }
      triggerFeedback('success');
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
        triggerFeedback('error');
        return;
      }
      triggerFeedback('success');
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
        <View style={styles.summaryHead}>
          <Text style={[styles.summaryHeadLabel, { color: colors.text3 }]}>Practice performance</Text>
          <Button label="Reset" variant="ghost" onPress={resetSandbox} />
        </View>

        <Button label="Compete vs AI →" variant="ghost" onPress={() => router.push('/markets/arena')} />

        <View style={styles.statsRow}>
          {/* The number that actually moves the instant you buy — shown
              separately from net worth so a purchase visibly "costs"
              something, not just a net-worth figure that (correctly)
              doesn't move until the stock's price does. */}
          <StatTile label="Sandbox balance" value={money(cash)} />
          <StatTile label="Net worth" value={money(netWorth)} />
        </View>

        <Card style={styles.pnlCard}>
          <Text style={[styles.pnlLabel, { color: colors.text3 }]}>vs starting $100,000</Text>
          <View style={styles.pnlRow}>
            <View style={styles.pnlPctGroup}>
              <Ionicons name={pnl >= 0 ? 'trending-up' : 'trending-down'} size={22} color={pnlColor} />
              <Text style={[styles.pnlValue, { color: pnlColor }]}>{signedPct(pnlPct)}</Text>
            </View>
            <Text style={[styles.pnlValue, { color: pnlColor }]}>{signedMoney(pnl)}</Text>
          </View>
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
          <ScrollView
            contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled">
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
                <QtyStepperButton label="−" onPress={() => adjustQty(-1)} />
                <TextInput
                  value={qtyText}
                  onChangeText={setQtyText}
                  keyboardType="number-pad"
                  style={[styles.qtyInput, { color: colors.text, borderColor: colors.border }]}
                />
                <QtyStepperButton label="+" onPress={() => adjustQty(1)} />
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
          </ScrollView>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.xl, gap: spacing.md },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryHeadLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  statsRow: { flexDirection: 'row', gap: spacing.md },
  pnlCard: { gap: spacing.sm },
  pnlLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  pnlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pnlPctGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pnlValue: { fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  disclaimer: { fontSize: 12, lineHeight: 16 },
  searchBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  searchInput: { paddingVertical: 10, fontSize: 14 },
  list: { flex: 1 },
  changeStock: { fontSize: 13, fontWeight: '600' },
  stockName: { fontSize: 13, fontWeight: '600' },
  stockPrice: { fontSize: 22, fontWeight: '700', marginTop: 2 },
  label: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
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
