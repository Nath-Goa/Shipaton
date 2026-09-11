import { bandForState, permissionsFor, type AgePermissions } from '@/constants/ageCompliance';
import { JUDGE_MODE_ENABLED } from '@/constants/judgeMode';
import { useAgeStore } from '@/store/useAgeStore';

// Derived on read rather than stored, so a 17-year-old becomes an adult on
// their birthday without needing a migration or a re-prompt. Both the
// selected fields and the returned object are referentially stable:
// birthDate/judgeMode are primitives, and permissionsFor hands back one of
// AGE_PERMISSIONS' frozen objects rather than building a new one (CLAUDE.md
// §7 rule #1).
export function useAgePermissions(): AgePermissions {
  const birthDate = useAgeStore((s) => s.birthDate);
  const judgeMode = useAgeStore((s) => s.judgeMode);
  return permissionsFor(bandForState({ birthDate, judgeMode }));
}

// For the AI surfaces: a minor must have explicitly opted in before any
// prompt is sent to a third-party provider. Adults are governed by the
// privacy policy alone, exactly as before.
export function useAiDataAllowed(): boolean {
  const permissions = useAgePermissions();
  const consent = useAgeStore((s) => s.aiDataConsent);
  return !permissions.requiresAiConsent || consent === true;
}

export type AgeGateStage = 'judge-check' | 'birth-date' | 'blocked' | 'ai-consent' | 'complete';

// The one place that decides how far through the gate someone is, so
// app/_layout.tsx and AgeGateScreen can never disagree about it.
export function useAgeGateStage(): AgeGateStage {
  const birthDate = useAgeStore((s) => s.birthDate);
  const consent = useAgeStore((s) => s.aiDataConsent);
  const judgeMode = useAgeStore((s) => s.judgeMode);
  const permissions = useAgePermissions();

  // TEMPORARY, hackathon judging only (constants/judgeMode.ts). Asked before
  // the age gate rather than after, because answering yes is what makes the
  // age question unnecessary. Flipping JUDGE_MODE_ENABLED off skips straight
  // past this without stranding anyone who already answered.
  if (JUDGE_MODE_ENABLED && judgeMode === null) return 'judge-check';
  if (JUDGE_MODE_ENABLED && judgeMode) return 'complete';

  if (!birthDate) return 'birth-date';
  if (!permissions.appAccess) return 'blocked';
  if (permissions.requiresAiConsent && consent === null) return 'ai-consent';
  return 'complete';
}

// TEMPORARY (constants/judgeMode.ts) — read by the purchase paths so a
// subscribe tap opens the real paywall and grants the selected preview tier
// locally after the judge closes it.
export function useIsJudgeMode(): boolean {
  const judgeMode = useAgeStore((s) => s.judgeMode);
  return JUDGE_MODE_ENABLED && judgeMode === true;
}
