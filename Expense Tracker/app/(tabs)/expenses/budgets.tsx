import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { CATEGORIES, type CategoryId } from '@/constants/categories';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useBudgetStore } from '@/store/useBudgetStore';
import { useExpenseStore } from '@/store/useExpenseStore';
import { parseDateLocal } from '@/utils/date';
import { money } from '@/utils/money';

function ProgressBar({ pct, color, track }: { pct: number; color: string; track: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={[styles.track, { backgroundColor: track }]}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

function BudgetRow({
  label,
  icon,
  spent,
  budget,
  onSave,
}: {
  label: string;
  icon?: string;
  spent: number;
  budget: number | null;
  onSave: (amount: number | null) => void;
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(budget ? String(budget) : '');
  const pct = budget ? (spent / budget) * 100 : 0;
  const over = budget != null && spent > budget;

  function save() {
    const parsed = parseFloat(input);
    onSave(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
    setEditing(false);
  }

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>
          {icon ? `${icon} ` : ''}
          {label}
        </Text>
        {editing ? (
          <View style={styles.editRow}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="No limit"
              placeholderTextColor={colors.text3}
              keyboardType="decimal-pad"
              autoFocus
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
            />
            <Button label="Save" onPress={save} />
          </View>
        ) : (
          <Text style={[styles.rowValue, { color: colors.text2 }]} onPress={() => setEditing(true)}>
            {budget ? `${money(spent)} / ${money(budget)}` : 'Set budget'}
          </Text>
        )}
      </View>
      {!editing && budget ? (
        <ProgressBar pct={pct} color={over ? colors.danger : colors.accent} track={colors.surface2} />
      ) : null}
    </View>
  );
}

export default function BudgetsScreen() {
  const { colors } = useTheme();
  const expenses = useExpenseStore((s) => s.expenses);
  const { overallBudget, categoryBudgets, setOverallBudget, setCategoryBudget } = useBudgetStore();

  const monthTotals = useMemo(() => {
    const now = new Date();
    const byCategory = new Map<CategoryId, number>();
    let overall = 0;
    for (const e of expenses) {
      const d = parseDateLocal(e.date);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      overall += e.amount;
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
    }
    return { overall, byCategory };
  }, [expenses]);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.intro, { color: colors.text3 }]}>
            Set monthly limits — this only tracks against expenses logged this calendar month.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).springify().damping(16)}>
          <Card>
            <BudgetRow
              label="Overall monthly budget"
              spent={monthTotals.overall}
              budget={overallBudget}
              onSave={setOverallBudget}
            />
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).springify().damping(16)}>
          <Card style={{ gap: spacing.lg }}>
            {CATEGORIES.map((c, i) => (
              <View key={c.id} style={i > 0 ? [styles.divider, { borderTopColor: colors.border }] : undefined}>
                <BudgetRow
                  label={c.label}
                  icon={c.icon}
                  spent={monthTotals.byCategory.get(c.id) ?? 0}
                  budget={categoryBudgets[c.id] ?? null}
                  onSave={(amount) => setCategoryBudget(c.id, amount)}
                />
              </View>
            ))}
          </Card>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  row: { gap: spacing.sm },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  rowLabel: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  rowValue: { fontSize: 13, fontWeight: '600' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    width: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'right',
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.lg },
});
