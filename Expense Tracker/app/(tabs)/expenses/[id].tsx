import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useTheme';
import { useExpenseStore } from '@/store/useExpenseStore';
import { useToastStore } from '@/store/useToastStore';
import { confirmAction } from '@/utils/confirm';

export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { expenses, updateExpense, deleteExpense, undoDelete } = useExpenseStore();
  const showToast = useToastStore((s) => s.show);
  const expense = expenses.find((e) => e.id === id);

  if (!expense) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        <View style={{ padding: spacing.xl }}>
          <Text style={{ color: colors.text }}>Expense not found.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <ExpenseForm
            initial={expense}
            submitLabel="Save changes"
            onSubmit={(values) => {
              updateExpense(expense.id, values);
              showToast('Expense updated.');
              router.back();
            }}
            onDelete={() => {
              confirmAction({ title: 'Delete this expense?', confirmLabel: 'Delete', destructive: true }, () => {
                deleteExpense(expense.id);
                router.back();
                showToast('Expense deleted.', { actionLabel: 'Undo', onAction: undoDelete });
              });
            }}
          />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
