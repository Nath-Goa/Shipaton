export type BadgeInfo = { label: string; icon: string };

export const BADGE_INFO: Record<string, BadgeInfo> = {
  streak_3: { label: '3-Day Streak', icon: '🔥' },
  streak_7: { label: '7-Day Streak', icon: '🔥' },
  streak_30: { label: '30-Day Streak', icon: '🏆' },
  pattern_master: { label: 'Pattern Master', icon: '🔍' },
  analyst: { label: 'Analyst', icon: '🎓' },
};

export function badgeInfo(id: string): BadgeInfo {
  return BADGE_INFO[id] ?? { label: id, icon: '⭐' };
}
