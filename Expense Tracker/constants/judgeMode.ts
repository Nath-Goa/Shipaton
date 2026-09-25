// TEMPORARY — Shipaton hackathon judging only.
//
// Judges need to see every paid feature without paying and without being
// asked personal questions, so the very first thing a fresh install shows is
// "Are you a judge?". Answering yes skips the age gate (the account is
// treated as 18+) and routes subscription taps through RevenueCat Test Store.
// Answering no runs the normal flow with nothing changed.
//
// The RevenueCat paywall is still shown to a judge — deliberately. This is a
// RevenueCat hackathon, so that integration is a large part of what is being
// judged, and hiding it would hide the work. A simulated successful purchase
// updates CustomerInfo and entitlements exactly like a real purchase, without
// entering Google Play billing or charging money.
//
// HOW TO REMOVE AFTER JUDGING — production builds already disable the flag.
// To delete it properly afterwards, remove this file and follow the compiler
// errors.
// The flag itself is read in useAgeGateStage, useIsJudgeMode and
// bandForState; the judge-only code hanging off those is JudgeModeStep in
// AgeGateScreen, presentPaywallAsJudge in services/purchases/paywallUI.ts
// and its two callers (useUpgradeToTier, settings/upgrade.tsx), the
// RevenueCat sync skip in app/_layout.tsx, and the Settings › Privacy & age
// branch. Every one of them carries a TEMPORARY comment pointing here, so
// `grep -rn "judgeMode\|isJudge\|JUDGE_MODE"` finds the lot.
//
// Judge mode is also exitable per-device from Settings › Privacy & age,
// which is how to get back to the real age gate when testing the normal
// path on a device that already answered yes.
import { IS_JUDGE_BUILD } from '@/constants/build';

export const JUDGE_MODE_ENABLED = IS_JUDGE_BUILD;

// Shown on the prompt itself. Kept here rather than inline so the promise
// made to a judge and the behaviour implemented below cannot drift apart.
export const JUDGE_MODE_PROMISE: string[] = [
  'Tapping a plan opens the real RevenueCat paywall, so you can review the integration exactly as a paying user would see it',
  'Tap “Test valid purchase” in RevenueCat Test Store to unlock it — no card or real payment is involved',
  'You will not be asked your date of birth; the account is treated as 18+ so nothing is age-restricted',
  'Nothing else changes. Every feature, screen and number behaves exactly as it does for a normal user',
];
