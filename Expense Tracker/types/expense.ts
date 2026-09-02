import type { CategoryId } from '@/constants/categories';

export type Expense = {
  id: string;
  desc: string;
  amount: number;
  date: string; // "YYYY-MM-DD", local
  category: CategoryId;
  photoUri?: string;
};
