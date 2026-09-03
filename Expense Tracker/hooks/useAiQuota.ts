import { AI_FEATURE_DAILY_LIMIT } from '@/constants/subscription';
import { useHasApiKey } from '@/hooks/useHasApiKey';
import { useAiUsageStore } from '@/store/useAiUsageStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { todayStr } from '@/utils/date';

// The single gate every AI-feature screen checks before letting the user
// start an action (or to show a "X left today" hint) — a working personal
// key is unlimited, so this only ever reflects the shared-key quota
// (AI_FEATURE_DAILY_LIMIT[tier], one pool across every AI feature). Actual
// enforcement still happens inside the request in services/ai/client.ts;
// this is for pre-emptive UI only (disabling a button, showing a count) so
// a request isn't attempted needlessly.
export function useAiQuota(): { remaining: number | null; locked: boolean } {
  const { hasKey } = useHasApiKey();
  const tier = useSettingsStore((s) => s.tier);
  // hasKey === true (working personal key) or null (still loading, don't
  // flash a locked state) both mean "don't show the shared-key quota".
  const usedToday = useAiUsageStore((s) => (s.date === todayStr() ? s.count : 0));

  if (hasKey !== false) return { remaining: null, locked: false };

  const remaining = Math.max(0, AI_FEATURE_DAILY_LIMIT[tier] - usedToday);
  return { remaining, locked: remaining <= 0 };
}
