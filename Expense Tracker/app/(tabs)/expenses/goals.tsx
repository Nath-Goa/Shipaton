import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { MAX_SAVINGS_GOALS, type SavingsGoal, useSavingsGoalStore } from '@/store/useSavingsGoalStore';
import { useToastStore } from '@/store/useToastStore';
import type { RecurringFrequency } from '@/types/expense';
import { confirmAction } from '@/utils/confirm';
import { formatShortDate, parseDateLocal, todayStr } from '@/utils/date';
import { money } from '@/utils/money';

const GOAL_ICONS = ['🎯', '✈️', '🏠', '🚗', '💻', '🎓', '💍', '🎁'];
const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function GoalCard({ goal, index }: { goal: SavingsGoal; index: number }) {
  const { colors } = useTheme();
  const { addContribution, deleteGoal, setRecurringContribution, cancelRecurringContribution } = useSavingsGoalStore();
  const [expanded, setExpanded] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoAmountText, setAutoAmountText] = useState('');
  const [autoFreq, setAutoFreq] = useState<RecurringFrequency>('monthly');

  const pct = goal.targetAmount ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const done = !!goal.completedAt;

  function handleAdd() {
    const parsed = parseFloat(amountText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    addContribution(goal.id, parsed);
    setAmountText('');
  }

  function handleStartAuto() {
    const parsed = parseFloat(autoAmountText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setRecurringContribution(goal.id, parsed, autoFreq);
    setAutoAmountText('');
    setAutoOpen(false);
  }

  function handleDelete() {
    confirmAction(
      {
        title: `Delete "${goal.name}"?`,
        message: 'This removes the goal and its saved progress for good.',
        confirmLabel: 'Delete',
        destructive: true,
      },
      () => deleteGoal(goal.id)
    );
  }

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 40, 240)).springify().damping(16)}>
      <Card style={{ gap: spacing.md }}>
        <View style={styles.head}>
          <Pressable style={styles.headLeft} onPress={() => setExpanded((v) => !v)}>
            <Text style={styles.icon}>{goal.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>{goal.name}</Text>
              <Text style={[styles.sub, { color: colors.text2 }]}>
                {money(goal.currentAmount)} / {money(goal.targetAmount)}
                {goal.targetDate ? ` · by ${formatShortDate(goal.targetDate)}` : ''}
              </Text>
            </View>
          </Pressable>
          <IconButton name="trash-outline" size={15} onPress={handleDelete} category="destructive" />
        </View>

        <ProgressBar pct={pct} color={done ? colors.success : colors.accent} track={colors.surface2} />
        {done ? <Text style={[styles.doneText, { color: colors.success }]}>🎉 Goal reached!</Text> : null}

        {expanded ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.contribRow}>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                placeholder="Add amount"
                placeholderTextColor={colors.text3}
                keyboardType="decimal-pad"
                style={[styles.contribInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <Button label="Add" onPress={handleAdd} />
            </View>

            <View style={[styles.autoSection, { borderTopColor: colors.border }]}>
              {goal.recurringAmount && goal.recurringFrequency ? (
                <View style={styles.autoRow}>
                  <Text style={[styles.autoText, { color: colors.text2 }]}>
                    💸 Auto-saving {money(goal.recurringAmount)}/{goal.recurringFrequency === 'weekly' ? 'week' : 'month'}
                  </Text>
                  <IconButton
                    name="close-circle-outline"
                    size={15}
                    onPress={() => cancelRecurringContribution(goal.id)}
                    category="destructive"
                  />
                </View>
              ) : autoOpen ? (
                <View style={{ gap: spacing.sm }}>
                  <TextInput
                    value={autoAmountText}
                    onChangeText={setAutoAmountText}
                    placeholder="Amount per cycle"
                    placeholderTextColor={colors.text3}
                    keyboardType="decimal-pad"
                    style={[styles.contribInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                  />
                  <SegmentedControl options={FREQUENCY_OPTIONS} value={autoFreq} onChange={setAutoFreq} />
                  <View style={styles.createRow}>
                    <View style={{ flex: 1 }}>
                      <Button label="Cancel" variant="ghost" fullWidth onPress={() => setAutoOpen(false)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Start" fullWidth onPress={handleStartAuto} />
                    </View>
                  </View>
                </View>
              ) : (
                <Button label="+ Auto-save" variant="ghost" fullWidth onPress={() => setAutoOpen(true)} />
              )}
            </View>
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

export default function GoalsScreen() {
  const { colors } = useTheme();
  const goals = useSavingsGoalStore((s) => s.goals);
  const createGoal = useSavingsGoalStore((s) => s.createGoal);
  const roundUpGoalId = useSavingsGoalStore((s) => s.roundUpGoalId);
  const setRoundUpGoal = useSavingsGoalStore((s) => s.setRoundUpGoal);
  const showToast = useToastStore((s) => s.show);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(GOAL_ICONS[0]);
  const [targetText, setTargetText] = useState('');
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const sorted = useMemo(
    () => [...goals].sort((a, b) => Number(!!a.completedAt) - Number(!!b.completedAt) || b.createdAt - a.createdAt),
    [goals]
  );
  const atCap = goals.length >= MAX_SAVINGS_GOALS;

  function resetForm() {
    setName('');
    setIcon(GOAL_ICONS[0]);
    setTargetText('');
    setTargetDate(null);
    setShowDatePicker(false);
  }

  function handleCreate() {
    const parsed = parseFloat(targetText);
    const result = createGoal(name, icon, parsed, targetDate);
    if (!result.ok) {
      showToast(result.message);
      return;
    }
    resetForm();
    setCreating(false);
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <Text style={[styles.intro, { color: colors.text3 }]}>
            Set targets — a trip, a laptop, an emergency fund — and add contributions manually as you save.
          </Text>
        </Animated.View>

        {goals.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(15).springify().damping(16)}>
            <Card style={{ gap: spacing.sm }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Round-up savings</Text>
              <Text style={[styles.roundUpSub, { color: colors.text3 }]}>
                Every expense you log rounds up to the next dollar — the spare change goes into a goal.
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                <Chip label="Off" active={!roundUpGoalId} onPress={() => setRoundUpGoal(null)} />
                {goals.map((g) => (
                  <Chip
                    key={g.id}
                    label={`${g.icon} ${g.name}`}
                    active={roundUpGoalId === g.id}
                    onPress={() => setRoundUpGoal(g.id)}
                  />
                ))}
              </ScrollView>
            </Card>
          </Animated.View>
        ) : null}

        {sorted.length === 0 && !creating ? (
          <EmptyState
            icon="🐷"
            title="No savings goals yet"
            message="Create your first goal below and start adding to it."
          />
        ) : (
          sorted.map((g, i) => <GoalCard key={g.id} goal={g} index={i} />)
        )}

        <Animated.View entering={FadeInDown.delay(Math.min(sorted.length * 40, 240) + 40).springify().damping(16)}>
          {creating ? (
            <Card style={{ gap: spacing.md }}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Goal name"
                placeholderTextColor={colors.text3}
                autoFocus
                style={[styles.formInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <View style={styles.iconRow}>
                {GOAL_ICONS.map((ic) => (
                  <Chip key={ic} label={ic} active={icon === ic} onPress={() => setIcon(ic)} />
                ))}
              </View>
              <TextInput
                value={targetText}
                onChangeText={setTargetText}
                placeholder="Target amount"
                placeholderTextColor={colors.text3}
                keyboardType="decimal-pad"
                style={[styles.formInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <Pressable
                onPress={() => setShowDatePicker((v) => !v)}
                style={[styles.formInput, styles.dateInput, { borderColor: colors.border, backgroundColor: colors.surface2 }]}>
                <Text style={{ color: targetDate ? colors.text : colors.text3 }}>
                  {targetDate ? formatShortDate(targetDate) : 'Target date (optional)'}
                </Text>
                {targetDate ? (
                  <Pressable hitSlop={8} onPress={() => setTargetDate(null)}>
                    <Ionicons name="close-circle" size={16} color={colors.text3} />
                  </Pressable>
                ) : null}
              </Pressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={parseDateLocal(targetDate ?? todayStr())}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={(event, selected) => {
                    if (event.type === 'dismissed') {
                      setShowDatePicker(false);
                      return;
                    }
                    if (selected) {
                      const y = selected.getFullYear();
                      const m = String(selected.getMonth() + 1).padStart(2, '0');
                      const d = String(selected.getDate()).padStart(2, '0');
                      setTargetDate(`${y}-${m}-${d}`);
                    }
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                  }}
                />
              ) : null}
              <View style={styles.createRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Cancel"
                    variant="ghost"
                    fullWidth
                    onPress={() => {
                      resetForm();
                      setCreating(false);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Create" fullWidth onPress={handleCreate} />
                </View>
              </View>
            </Card>
          ) : (
            <Button
              label={atCap ? `Goal limit reached (${MAX_SAVINGS_GOALS})` : '+ New goal'}
              variant="ghost"
              fullWidth
              disabled={atCap}
              onPress={() => setCreating(true)}
            />
          )}
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  roundUpSub: { fontSize: 12, lineHeight: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { fontSize: 24 },
  name: { fontSize: 15, fontWeight: '700' },
  sub: { fontSize: 12.5, marginTop: 2 },
  doneText: { fontSize: 12.5, fontWeight: '600' },
  autoSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  autoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  autoText: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  contribRow: { flexDirection: 'row', gap: spacing.sm },
  contribInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  formInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
  },
  dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  createRow: { flexDirection: 'row', gap: spacing.md },
});
