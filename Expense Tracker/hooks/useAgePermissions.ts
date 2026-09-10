import { ageBandFor, permissionsFor, type AgePermissions } from '@/constants/ageCompliance';
import { useAgeStore } from '@/store/useAgeStore';

// Derived on read rather than stored, so a 17-year-old becomes an adult on
// their birthday without needing a migration or a re-prompt. Both the
// selected field and the returned object are referentially stable: birthDate
// is a string, and permissionsFor hands back one of AGE_PERMISSIONS' frozen
// objects rather than building a new one (CLAUDE.md §7 rule #1).
export function useAgePermissions(): AgePermissions {
  const birthDate = useAgeStore((s) => s.birthDate);
  return permissionsFor(ageBandFor(birthDate));
}

// For the AI surfaces: a minor must have explicitly opted in before any
// prompt is sent to a third-party provider. Adults are governed by the
// privacy policy alone, exactly as before.
export function useAiDataAllowed(): boolean {
  const permissions = useAgePermissions();
  const consent = useAgeStore((s) => s.aiDataConsent);
  return !permissions.requiresAiConsent || consent === true;
}

export type AgeGateStage = 'birth-date' | 'blocked' | 'ai-consent' | 'complete';

// The one place that decides how far through the gate someone is, so
// app/_layout.tsx and AgeGateScreen can never disagree about it.
export function useAgeGateStage(): AgeGateStage {
  const birthDate = useAgeStore((s) => s.birthDate);
  const consent = useAgeStore((s) => s.aiDataConsent);
  const permissions = useAgePermissions();
  if (!birthDate) return 'birth-date';
  if (!permissions.appAccess) return 'blocked';
  if (permissions.requiresAiConsent && consent === null) return 'ai-consent';
  return 'complete';
}
