import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { ExpenseForm } from '@/components/expenses/ExpenseForm';
import { Screen } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import { useExpenseStore } from '@/store/useExpenseStore';
import { useToastStore } from '@/store/useToastStore';

export default function AddExpenseScreen() {
  const addExpense = useExpenseStore((s) => s.addExpense);
  const showToast = useToastStore((s) => s.show);

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing.xxl }}>
        <ExpenseForm
          submitLabel="Add expense"
          onSubmit={(values) => {
            addExpense(values);
            showToast('Expense added.');
            router.back();
          }}
        />
      </ScrollView>
    </Screen>
  );
}
