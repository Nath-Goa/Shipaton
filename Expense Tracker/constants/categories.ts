// Ported directly from the reference web app's CATEGORIES list (app.js).
export type CategoryId =
  | 'food'
  | 'transport'
  | 'housing'
  | 'utilities'
  | 'shopping'
  | 'health'
  | 'entertainment'
  | 'travel'
  | 'education'
  | 'other';

export type Category = {
  id: CategoryId;
  label: string;
  color: string;
  icon: string;
};

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food & Dining', color: '#f5a524', icon: '🍔' },
  { id: 'transport', label: 'Transport', color: '#3b82f6', icon: '🚗' },
  { id: 'housing', label: 'Housing', color: '#8b5cf6', icon: '🏠' },
  { id: 'utilities', label: 'Utilities', color: '#06b6d4', icon: '💡' },
  { id: 'shopping', label: 'Shopping', color: '#ec4899', icon: '🛍️' },
  { id: 'health', label: 'Health', color: '#ef4444', icon: '💊' },
  { id: 'entertainment', label: 'Entertainment', color: '#a855f7', icon: '🎬' },
  { id: 'travel', label: 'Travel', color: '#14b8a6', icon: '✈️' },
  { id: 'education', label: 'Education', color: '#6366f1', icon: '📚' },
  { id: 'other', label: 'Other', color: '#6b7280', icon: '🧾' },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryOf(id: string): Category {
  return CATEGORY_MAP.get(id as CategoryId) ?? (CATEGORY_MAP.get('other') as Category);
}
