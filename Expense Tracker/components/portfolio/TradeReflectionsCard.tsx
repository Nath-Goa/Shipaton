import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { generateTradeReflection } from '@/services/ai/learn';
import { useMistakeJournalStore } from '@/store/useMistakeJournalStore';

function formatHeld(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
}

// Only ever shows the single most recent undismissed entry — a heuristic
// "loss" detection (see utils/tradeReflection.ts), not a real trading log.
export function TradeReflectionsCard() {
  const { colors } = useTheme();
  const entries = useMistakeJournalStore((s) => s.entries);
  const setReflection = useMistakeJournalStore((s) => s.setReflection);
  const dismiss = useMistakeJournalStore((s) => s.dismiss);
  const [loading, setLoading] = useState(false);

  const latest = entries.find((e) => !e.dismissed);
  if (!latest) return null;

  async function handleReflect() {
    setLoading(true);
    const result = await generateTradeReflection({ symbol: latest!.symbol, gainPct: latest!.gainPct, heldMs: latest!.heldMs });
    setLoading(false);
    if (result.ok) setReflection(latest!.id, result.data);
  }

  return (
    <Animated.View entering={FadeInDown.delay(70).springify().damping(16)}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Trade reflections</Text>
      <Card style={{ marginTop: spacing.md }}>
        <Text style={[styles.headline, { color: colors.text }]}>
          {latest.symbol} — sold at a {Math.abs(latest.gainPct).toFixed(1)}% loss after just {formatHeld(latest.heldMs)}
        </Text>
        <Text style={[styles.subtext, { color: colors.text3 }]}>
          Looks like a panic sell — a common pattern worth understanding, not a failure.
        </Text>
        {latest.reflection ? (
          <Text style={[styles.reflection, { color: colors.text2 }]}>{latest.reflection}</Text>
        ) : null}
        <View style={styles.actions}>
          {!latest.reflection ? (
            <View style={{ flex: 1 }}>
              <Button label="Get AI reflection" variant="ghost" fullWidth loading={loading} onPress={handleReflect} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Button label="Dismiss" variant="ghost" fullWidth onPress={() => dismiss(latest!.id)} />
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 15.5, fontWeight: '700' },
  headline: { fontSize: 14, fontWeight: '700' },
  subtext: { fontSize: 12.5, marginTop: 4, lineHeight: 17 },
  reflection: { fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
});
