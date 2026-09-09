import type { Tier } from '@/constants/subscription';

export type LearningRewardTier = Exclude<Tier, 'free'>;

export type LearningReward = {
  milestone: number;
  tier: LearningRewardTier;
  days: number;
  durationLabel: string;
};

export type LearningRewardGrant = LearningReward & { expiresAt: number };

export const LEARNING_REWARDS: LearningReward[] = [
  { milestone: 10, tier: 'pro', days: 1, durationLabel: '1 day' },
  { milestone: 20, tier: 'pro', days: 2, durationLabel: '2 days' },
  { milestone: 30, tier: 'pro', days: 5, durationLabel: '5 days' },
  { milestone: 45, tier: 'pro', days: 14, durationLabel: '2 weeks' },
  { milestone: 60, tier: 'max', days: 5, durationLabel: '5 days' },
  { milestone: 80, tier: 'max', days: 7, durationLabel: '1 week' },
  { milestone: 100, tier: 'max', days: 14, durationLabel: '2 weeks' },
  { milestone: 104, tier: 'max', days: 30, durationLabel: '1 month' },
];

export function learningRewardAt(milestone: number): LearningReward | undefined {
  return LEARNING_REWARDS.find((reward) => reward.milestone === milestone);
}
