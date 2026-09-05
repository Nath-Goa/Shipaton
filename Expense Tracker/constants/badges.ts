export type BadgeInfo = { label: string; icon: string };

export const BADGE_INFO: Record<string, BadgeInfo> = {
  streak_3: { label: '3-Day Streak', icon: '🔥' },
  streak_7: { label: '7-Day Streak', icon: '🔥' },
  streak_30: { label: '30-Day Streak', icon: '🏆' },
  pattern_master: { label: 'Pattern Master', icon: '🔍' },
  analyst: { label: 'Analyst', icon: '🎓' },
  first_trade: { label: 'First Trade', icon: '📈' },
  diversified: { label: 'Diversified', icon: '🧺' },
  budget_met: { label: 'Budget Met', icon: '🎯' },
  goal_reached: { label: 'Goal Reached', icon: '🏁' },
  // Course-path badges — see constants/courses.ts and store/useCourseStore.ts.
  course_market_basics: { label: 'Market Basics', icon: '🏢' },
  course_reading_charts: { label: 'Chart Reader', icon: '📊' },
  course_company_fundamentals: { label: 'Fundamentals', icon: '📄' },
  course_risk_diversification: { label: 'Risk-Aware', icon: '🛡️' },
  course_technical_analysis: { label: 'Technical Analyst', icon: '📈' },
  course_market_psychology: { label: 'Mind Reader', icon: '🌡️' },
  course_order_types: { label: 'Order Pro', icon: '🔁' },
  course_dividends_income: { label: 'Income Investor', icon: '💵' },
  course_macro_sectors: { label: 'Macro Thinker', icon: '🌐' },
  course_building_strategy: { label: 'Strategist', icon: '🚩' },
  stage_1_complete: { label: 'Foundations Complete', icon: '🥉' },
  stage_2_complete: { label: 'Building Skills Complete', icon: '🥈' },
  stage_3_complete: { label: 'Advanced Strategy Complete', icon: '🥇' },
  // Daily trivia battle — store/useTriviaStore.ts.
  trivia_first_win: { label: 'Beat the Bot', icon: '🤖' },
  trivia_streak_5: { label: '5-Win Trivia Streak', icon: '🔥' },
};

export function badgeInfo(id: string): BadgeInfo {
  return BADGE_INFO[id] ?? { label: id, icon: '⭐' };
}
