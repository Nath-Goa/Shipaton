import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

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
        <Animated.View entering={FadeInDown.duration(300).springify().damping(16)}>
          <ExpenseForm
            submitLabel="Add expense"
            onSubmit={(values) => {
              addExpense(values);
              showToast('Expense added.');
              router.back();
            }}
          />
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}
