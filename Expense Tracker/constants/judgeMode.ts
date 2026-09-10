// TEMPORARY — Shipaton hackathon judging only.
//
// Judges need to see every paid feature without paying and without being
// asked personal questions, so the very first thing a fresh install shows is
// "Are you a judge?". Answering yes skips the age gate (the account is
// treated as 18+) and makes every subscribe button grant the tier locally
// instead of opening a real paywall. Answering no runs the normal flow with
// nothing changed.
//
// HOW TO REMOVE AFTER JUDGING — flip the flag below to false and ship. That
// alone is enough: the prompt stops appearing, useAgeGateStage falls straight
// through to the age gate, and every judge-mode branch goes dead. To delete
// it properly afterwards, remove this file and follow the compiler errors —
// the flag is referenced in exactly five places (useAgeGateStage,
// bandForState, useUpgradeToTier, settings/upgrade.tsx, and the RevenueCat
// sync in app/_layout.tsx), plus the JudgeModeStep in AgeGateScreen.
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
  'Every subscription is free — tap any plan and it unlocks immediately, with no payment and no card required',
  'You will not be asked your date of birth; the account is treated as 18+ so nothing is age-restricted',
  'Nothing else changes. Every feature, screen and number behaves exactly as it does for a normal user',
];
