import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { DonutChart } from '@/components/charts/DonutChart';
import { ExpenseListItem } from '@/components/expenses/ExpenseListItem';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { PillBadge } from '@/components/ui/PillBadge';
import { Screen } from '@/components/ui/Screen';
import { StatTile } from '@/components/ui/StatTile';
import { Text } from '@/components/ui/Text';
import { TopBar } from '@/components/ui/TopBar';
import { UpgradeBanner } from '@/components/ui/UpgradeBanner';
import { CATEGORIES, categoryOf } from '@/constants/categories';
import { MOCK_CHART_SEGMENTS, MOCK_CHART_TOTAL } from '@/constants/mockExpenseChart';
import { TIER_FEATURES } from '@/constants/subscription';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useUpgradeToTier } from '@/hooks/useUpgradeToTier';
import { describeAiError } from '@/services/ai/errorMessage';
import { generateSpendingInsight, type SpendingInsight } from '@/services/ai/insights';
import { shareExpensesCsv } from '@/services/export/exportData';
import { useExpenseStore } from '@/store/useExpenseStore';
import { useSavedChartsStore } from '@/store/useSavedChartsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useToastStore } from '@/store/useToastStore';
import type { DateRangePreset, Expense } from '@/types/expense';
import { formatDayHeading, parseDateLocal } from '@/utils/date';
import { filterExpensesByPreset } from '@/utils/expenseFilters';
import { money } from '@/utils/money';

type Preset = DateRangePreset;

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'month', label: 'This month' },
  { value: '30', label: 'Last 30 days' },
  { value: 'year', label: 'This year' },
];

type Row = { kind: 'header'; date: string; total: number } | { kind: 'item'; expense: Expense };

export default function ExpensesScreen() {
  const { colors } = useTheme();
  const { expenses, seedIfNeeded, generateDueRecurring, deleteExpense, undoDelete } = useExpenseStore();
  const showToast = useToastStore((s) => s.show);
  const [preset, setPreset] = useState<Preset>('all');
  const [highlight, setHighlight] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [insight, setInsight] = useState<SpendingInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  useEffect(() => {
    seedIfNeeded();
    generateDueRecurring();
  }, [seedIfNeeded, generateDueRecurring]);

  useEffect(() => {
    setInsight(null);
    setInsightError(null);
  }, [preset]);

  const filtered = useMemo(() => filterExpensesByPreset(expenses, preset), [expenses, preset]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [filtered]
  );

  const total = filtered.reduce((s, e) => s + e.amount, 0);
  const count = filtered.length;
  const avg = count ? total / count : 0;

  const monthTotal = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = parseDateLocal(e.date);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((s, e) => s + e.amount, 0);
  }, [expenses]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, value: map.get(c.id) ?? 0 })).sort(
      (a, b) => b.value - a.value
    );
  }, [filtered]);

  const topCategory = byCategory[0]?.value ? byCategory[0] : null;

  // Saved pie charts: each one is its own independent view (name + date
  // range) over the same expense history — deliberately decoupled from the
  // list filter chips above, so switching a saved chart's range never moves
  // the transaction list underneath it.
  const tier = useSettingsStore((s) => s.tier);
  const upgradeToTier = useUpgradeToTier();
  const savedChartsState = useSavedChartsStore();
  const activeChart = savedChartsState.getActiveChart();
  const configuredCharts = useMemo(
    () => savedChartsState.charts.filter((c) => c.name && c.preset),
    [savedChartsState.charts]
  );

  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configureName, setConfigureName] = useState('');
  const [configurePreset, setConfigurePreset] = useState<Preset>('all');

  const chartExpenses = useMemo(
    () => (activeChart?.preset ? filterExpensesByPreset(expenses, activeChart.preset) : []),
    [expenses, activeChart?.preset]
  );
  const chartByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of chartExpenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color, value: map.get(c.id) ?? 0 })).sort(
      (a, b) => b.value - a.value
    );
  }, [chartExpenses]);
  const chartTotal = chartByCategory.reduce((s, c) => s + c.value, 0);

  const displaySegments = activeChart ? chartByCategory : MOCK_CHART_SEGMENTS;
  const displayTotal = activeChart ? chartTotal : MOCK_CHART_TOTAL;
  // Changing this remounts DonutChart, which is exactly what replays its
  // segment-drawing "opening" animation on a genuine chart switch.
  const chartKey = activeChart?.id ?? 'mock';

  function handleNewChart() {
    const result = savedChartsState.createDraftChart(TIER_FEATURES[tier].savedChartLimit);
    if (!result.ok) {
      Alert.alert('Chart limit reached', result.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => upgradeToTier('pro') },
      ]);
      return;
    }
    setHighlight(null);
    setConfigureName('');
    setConfigurePreset('all');
    setConfiguringId(result.id);
  }

  function handleCancelConfigure() {
    if (configuringId) savedChartsState.deleteChart(configuringId);
    setConfiguringId(null);
  }

  function handleSaveConfigure() {
    if (!configuringId || !configureName.trim()) return;
    savedChartsState.configureChart(configuringId, configureName.trim(), configurePreset);
    setConfiguringId(null);
  }

  function handleDeleteActiveChart() {
    if (!activeChart) return;
    Alert.alert(`Delete "${activeChart.name}"?`, 'This only removes the saved chart, not your expenses.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => savedChartsState.deleteChart(activeChart.id) },
    ]);
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    let lastDay: string | null = null;
    for (const e of sorted) {
      if (e.date !== lastDay) {
        lastDay = e.date;
        const dayTotal = sorted.filter((x) => x.date === e.date).reduce((s, x) => s + x.amount, 0);
        out.push({ kind: 'header', date: e.date, total: dayTotal });
      }
      out.push({ kind: 'item', expense: e });
    }
    return out;
  }, [sorted]);

  function onRefresh() {
    // Everything here is already local/synchronous (Zustand state) — there's
    // no real work to wait on, so this just gives the native pull gesture
    // one frame to settle instead of holding the spinner for an artificial
    // delay.
    setRefreshing(true);
    requestAnimationFrame(() => setRefreshing(false));
  }

  async function handleExport() {
    const result = await shareExpensesCsv(sorted);
    if (!result.ok) showToast(result.message);
  }

  async function handleGetInsight() {
    setInsightLoading(true);
    setInsightError(null);
    const payload = JSON.stringify({
      period: PRESETS.find((p) => p.value === preset)?.label,
      total: Number(total.toFixed(2)),
      expenseCount: count,
      byCategory: byCategory.filter((c) => c.value > 0).map((c) => ({ category: c.label, amount: Number(c.value.toFixed(2)) })),
    });
    const result = await generateSpendingInsight(payload);
    setInsightLoading(false);
    if (!result.ok) {
      setInsightError(describeAiError(result.error));
      return;
    }
    setInsight(result.data);
  }

  function onLongPressExpense(expense: Expense) {
    Alert.alert(expense.desc || categoryOf(expense.category).label, undefined, [
      { text: 'Edit', onPress: () => router.push(`/expenses/${expense.id}`) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteExpense(expense.id);
          Alert.alert('Expense deleted', undefined, [{ text: 'Undo', onPress: undoDelete }, { text: 'OK' }]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <TopBar
        title="Expenses"
        subtitle="Track spending — snap a receipt or add manually"
        right={
          <>
            <IconButton name="flag-outline" onPress={() => router.push('/expenses/goals')} />
            <IconButton name="pie-chart-outline" onPress={() => router.push('/expenses/budgets')} />
            <IconButton name="share-outline" onPress={handleExport} />
            <IconButton name="add" onPress={() => router.push('/expenses/add')} category="primary" />
          </>
        }
      />
      <FlatList
        data={rows}
        keyExtractor={(row, i) => (row.kind === 'header' ? `h-${row.date}` : row.expense.id) + i}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                {PRESETS.map((p) => (
                  <Chip key={p.value} label={p.label} active={preset === p.value} onPress={() => setPreset(p.value)} />
                ))}
              </ScrollView>
            </View>

            <UpgradeBanner
              title="Never miss a receipt"
              body="Upgrade to Pro for AI receipt auto-fill and zero ads."
            />

            <View style={styles.statsRow}>
              <StatTile label="Total spending" value={money(total)} sub={`${count} expense${count === 1 ? '' : 's'}`} />
              <StatTile label="This month" value={money(monthTotal)} />
              <StatTile label="Average" value={money(avg)} />
              <StatTile
                label="Top category"
                value={topCategory?.label ?? '—'}
                sub={topCategory ? money(topCategory.value) : 'no data'}
                dotColor={topCategory?.color}
              />
            </View>

            <View>
              <Card>
                <View style={styles.chartHeadRow}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>Spending by category</Text>
                  <View style={styles.chartHeadActions}>
                    {activeChart ? (
                      <IconButton name="trash-outline" category="destructive" onPress={handleDeleteActiveChart} />
                    ) : null}
                    <IconButton name="add-circle-outline" category="primary" onPress={handleNewChart} />
                  </View>
                </View>

                {configuredCharts.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chartChipsRow}>
                    {configuredCharts.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name!}
                        active={activeChart?.id === c.id}
                        onPress={() => savedChartsState.openChart(c.id)}
                      />
                    ))}
                  </ScrollView>
                ) : null}

                {configuringId ? (
                  <View style={styles.configureForm}>
                    <TextInput
                      value={configureName}
                      onChangeText={setConfigureName}
                      placeholder='Chart name (e.g. "Q1 spending")'
                      placeholderTextColor={colors.text3}
                      autoFocus
                      style={[
                        styles.nameInput,
                        { borderColor: colors.border, color: colors.text, backgroundColor: colors.surface2 },
                      ]}
                    />
                    <View style={styles.chipsRow}>
                      {PRESETS.map((p) => (
                        <Chip
                          key={p.value}
                          label={p.label}
                          active={configurePreset === p.value}
                          onPress={() => setConfigurePreset(p.value)}
                        />
                      ))}
                    </View>
                    <View style={styles.configureActions}>
                      <View style={{ flex: 1 }}>
                        <Button label="Cancel" variant="ghost" fullWidth onPress={handleCancelConfigure} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Button label="Save" fullWidth disabled={!configureName.trim()} onPress={handleSaveConfigure} />
                      </View>
                    </View>
                  </View>
                ) : (
                  <>
                    {!activeChart ? (
                      <View style={styles.mockRow}>
                        <PillBadge label="Sample data" />
                        <Text style={[styles.mockHint, { color: colors.text3 }]}>Tap + to save your own chart</Text>
                      </View>
                    ) : null}
                    {displayTotal > 0 ? (
                      <View style={styles.breakdown}>
                        <DonutChart
                          key={chartKey}
                          segments={displaySegments}
                          centerLabel={highlight ? categoryOf(highlight).label : 'Total'}
                          centerValue={
                            highlight
                              ? money(displaySegments.find((c) => c.id === highlight)?.value ?? 0)
                              : money(displayTotal)
                          }
                          highlightId={highlight}
                          onSegmentPress={(id) => setHighlight((h) => (h === id ? null : id))}
                        />
                        <View style={styles.legend}>
                          {displaySegments
                            .filter((c) => c.value > 0)
                            .map((c) => (
                              <Text
                                key={c.id}
                                onPress={() => setHighlight((h) => (h === c.id ? null : c.id))}
                                style={[styles.legendItem, { color: highlight && highlight !== c.id ? colors.text3 : colors.text2 }]}>
                                <Text style={{ color: c.color }}>●</Text> {c.label}{' '}
                                <Text style={{ fontWeight: '700', color: colors.text }}>{money(c.value)}</Text>
                              </Text>
                            ))}
                        </View>
                      </View>
                    ) : (
                      <EmptyState
                        icon="🧾"
                        title="No spending yet"
                        message={activeChart ? 'No expenses fall in this chart\'s date range.' : 'Add an expense to see the breakdown.'}
                      />
                    )}
                  </>
                )}
              </Card>
            </View>

            {total > 0 ? (
              <View>
                <Card>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>AI spending insight</Text>
                  {!insight ? (
                    <>
                      <Text style={[styles.insightIntro, { color: colors.text3 }]}>
                        Ask the AI for a quick take on your spending in this range.
                      </Text>
                      <View style={{ marginTop: spacing.md }}>
                        <Button label="Get AI insight" variant="ghost" loading={insightLoading} onPress={handleGetInsight} />
                      </View>
                      {insightError ? <Text style={[styles.insightError, { color: colors.danger }]}>{insightError}</Text> : null}
                    </>
                  ) : (
                    <View style={{ gap: spacing.sm }}>
                      <Text style={[styles.insightText, { color: colors.text2 }]}>{insight.observation}</Text>
                      <Text style={[styles.insightTip, { color: colors.accent }]}>💡 {insight.tip}</Text>
                      <Button label="Refresh" variant="ghost" loading={insightLoading} onPress={handleGetInsight} />
                    </View>
                  )}
                </Card>
              </View>
            ) : null}

            <Text style={[styles.cardTitle, { color: colors.text, marginTop: spacing.sm }]}>
              Expenses <Text style={{ color: colors.text3 }}>({sorted.length})</Text>
            </Text>
          </View>
        }
        renderItem={({ item, index }) =>
          item.kind === 'header' ? (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 25, 300)).springify().damping(16)} style={styles.dayHead}>
              <Text style={[styles.dayHeadText, { color: colors.text3 }]}>{formatDayHeading(item.date)}</Text>
              <Text style={[styles.dayHeadText, { color: colors.text3 }]}>{money(item.total)}</Text>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 25, 300)).springify().damping(16)}>
              <ExpenseListItem
                expense={item.expense}
                onPress={() => router.push(`/expenses/${item.expense.id}`)}
                onLongPress={() => onLongPressExpense(item.expense)}
              />
            </Animated.View>
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="🧾"
            title="No expenses match"
            message="Try a different range, or add your first expense."
            actionLabel="Add expense"
            onAction={() => router.push('/expenses/add')}
          />
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  headerBlock: { gap: spacing.lg, marginBottom: spacing.md },
  chipsRow: { flexDirection: 'row', gap: spacing.sm },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: spacing.md },
  chartHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  chartHeadActions: { flexDirection: 'row', gap: spacing.sm },
  chartChipsRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.md },
  configureForm: { gap: spacing.md },
  nameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  configureActions: { flexDirection: 'row', gap: spacing.sm },
  mockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  mockHint: { fontSize: 12 },
  breakdown: { alignItems: 'center', gap: spacing.lg },
  insightIntro: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  insightText: { fontSize: 13.5, lineHeight: 19 },
  insightTip: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  insightError: { fontSize: 12.5, fontWeight: '600', marginTop: spacing.sm },
  legend: { width: '100%', gap: 8 },
  legendItem: { fontSize: 13 },
  dayHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  dayHeadText: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
