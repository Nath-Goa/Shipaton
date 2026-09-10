import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { FeedbackPressable as Pressable } from '@/components/ui/FeedbackPressable';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';

const PAIRS = [
  ['P/E', 'Price ÷ earnings'],
  ['ETF', 'A basket of assets'],
  ['Bull', 'A rising market'],
] as const;

export function MarketMatchLoader() {
  const { colors } = useTheme();
  const cards = useMemo(() => PAIRS.flatMap(([term, definition], pair) => [
    { id: `${pair}-term`, pair, label: term },
    { id: `${pair}-definition`, pair, label: definition },
  ]).sort(() => Math.random() - 0.5), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<number[]>([]);

  function choose(id: string, pair: number) {
    if (matched.includes(pair)) return;
    if (!selected) {
      setSelected(id);
      return;
    }
    const first = cards.find((card) => card.id === selected);
    if (first?.pair === pair && first.id !== id) setMatched((items) => [...items, pair]);
    setSelected(null);
  }

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.text }]}>Market Match</Text>
      <Text style={[styles.help, { color: colors.text3 }]}>{matched.length === PAIRS.length ? 'All matched — nice work!' : 'Match each term to its meaning while you wait.'}</Text>
      <View style={styles.grid}>
        {cards.map((item) => {
          const done = matched.includes(item.pair);
          const active = selected === item.id;
          return (
            <Pressable
              key={item.id}
              feedbackCategory={done ? 'success' : 'selection'}
              onPress={() => choose(item.id, item.pair)}
              style={[styles.tile, { backgroundColor: done ? colors.successSoft : active ? colors.accentSoft : colors.surface2, borderColor: done ? colors.success : active ? colors.accent : colors.border }]}>
              <Text style={[styles.tileText, { color: done ? colors.success : colors.text2 }]} numberOfLines={2}>{done ? '✓' : item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, width: '100%' },
  title: { fontSize: 14, fontWeight: '800', textAlign: 'center' },
  help: { fontSize: 11.5, lineHeight: 15, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flexBasis: '46%', flexGrow: 1, minHeight: 48, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
  tileText: { fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
});

