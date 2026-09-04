import { categoryOf } from '@/constants/categories';

// A fixed, clearly-fake sample breakdown shown before a user has logged any
// real expenses (or saved a real chart) — same shape DonutChart expects, so
// it renders through the exact same component as real data.
const MOCK_AMOUNTS: Record<string, number> = {
  food: 420.5,
  housing: 1200,
  transport: 185,
  shopping: 310.25,
  entertainment: 95,
};

export const MOCK_CHART_SEGMENTS = Object.entries(MOCK_AMOUNTS)
  .map(([id, value]) => {
    const c = categoryOf(id);
    return { id: c.id, label: c.label, color: c.color, value };
  })
  .sort((a, b) => b.value - a.value);

export const MOCK_CHART_TOTAL = MOCK_CHART_SEGMENTS.reduce((s, c) => s + c.value, 0);
