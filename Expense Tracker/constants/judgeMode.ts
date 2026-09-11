// TEMPORARY — Shipaton hackathon judging only.
//
// Judges need to see every paid feature without paying and without being
// asked personal questions, so the very first thing a fresh install shows is
// "Are you a judge?". Answering yes skips the age gate (the account is
// treated as 18+) and makes every subscribe button unlock the tier for free.
// Answering no runs the normal flow with nothing changed.
//
// The RevenueCat paywall is still shown to a judge — deliberately. This is a
// RevenueCat hackathon, so that integration is a large part of what is being
// judged, and hiding it would hide the work. presentPaywallAsJudge opens the
// real paywall and then grants the tier however the judge leaves it, so they
// see the genuine thing and still get in for nothing.
//
// HOW TO REMOVE AFTER JUDGING — flip the flag below to false and ship. That
// alone is enough: the prompt stops appearing, useAgeGateStage falls straight
// through to the age gate, and every judge-mode branch goes dead. To delete
// it properly afterwards, remove this file and follow the compiler errors.
// The flag itself is read in useAgeGateStage, useIsJudgeMode and
// bandForState; the judge-only code hanging off those is JudgeModeStep in
// AgeGateScreen, presentPaywallAsJudge in services/purchases/paywallUI.ts
// and its two callers (useUpgradeToTier, settings/upgrade.tsx), the
// RevenueCat sync skip in app/_layout.tsx, and the Settings › Privacy & age
// branch. Every one of them carries a TEMPORARY comment pointing here, so
// `grep -rn "judgeMode\|isJudge\|JUDGE_MODE"` finds the lot.
//
// Flipping the flag off applies to everyone on their next launch, existing
// judges included: their stored "yes" stops being honoured and they land on
// the normal age gate instead. That is the intended end state once judging
// is over, but it does mean the flag should not be flipped mid-event.
//
// Judge mode is also exitable per-device from Settings › Privacy & age,
// which is how to get back to the real age gate when testing the normal
// path on a device that already answered yes.
export const JUDGE_MODE_ENABLED = true;

// Shown on the prompt itself. Kept here rather than inline so the promise
// made to a judge and the behaviour implemented below cannot drift apart.
export const JUDGE_MODE_PROMISE: string[] = [
  'Tapping a plan opens the real RevenueCat paywall, so you can review the integration exactly as a paying user would see it',
  'Close that paywall without subscribing and the plan unlocks anyway — no card is needed for judge access',
  'You will not be asked your date of birth; the account is treated as 18+ so nothing is age-restricted',
  'Nothing else changes. Every feature, screen and number behaves exactly as it does for a normal user',
];
