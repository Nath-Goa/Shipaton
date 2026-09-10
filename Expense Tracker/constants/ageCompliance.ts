// Age-based access rules. Deliberately separate from TIER_FEATURES: that
// table is about what someone paid for, this one is about what the law
// allows regardless of payment — a Max subscriber who is 15 still gets every
// teen restriction below, and no upgrade path removes them.
//
// The Play Console listing declares a target audience of 13+, so 'child' is
// a hard stop rather than a reduced mode. COPPA requires verifiable parental
// consent before collecting anything from an under-13, and a local-first app
// with no backend has no way to obtain or verify that — so the only
// compliant response to a self-declared under-13 is not to serve them.

export type AgeBand = 'child' | 'teen' | 'adult';

export const MINIMUM_AGE = 13;
export const ADULT_AGE = 18;

export type AgePermissions = {
  band: AgeBand;
  /** May use the app at all. */
  appAccess: boolean;
  /** Supabase sign-up, friends, families, duels — the only account in the app. */
  socialAccounts: boolean;
  /** Sending a camera/library photo to a third-party AI provider. */
  aiPhotoUpload: boolean;
  /** Buying a subscription. */
  purchases: boolean;
  /** Streak-risk, daily check-in and study-time nudges. */
  engagementNudges: boolean;
  /** Bill "due tomorrow" reminders — a reminder the user asked for, not a nudge. */
  utilityReminders: boolean;
  /** Whether the predictor may train on this device's own usage by default. */
  behavioralLearning: boolean;
  /** Text AI features need a separate, revocable opt-in before any call runs. */
  requiresAiConsent: boolean;
};

// Frozen so AGE_PERMISSIONS[band] is referentially stable across renders —
// hooks/useAgePermissions.ts hands these objects straight to components, and
// a fresh object per call would break memoization (see CLAUDE.md §7 rule #1).
export const AGE_PERMISSIONS: Record<AgeBand, AgePermissions> = {
  child: Object.freeze({
    band: 'child',
    appAccess: false,
    socialAccounts: false,
    aiPhotoUpload: false,
    purchases: false,
    engagementNudges: false,
    utilityReminders: false,
    behavioralLearning: false,
    requiresAiConsent: true,
  }),
  // Each denial below maps to a specific obligation rather than caution for
  // its own sake:
  //  - socialAccounts: an account means an email address and a display name
  //    other users can search, plus contact between strangers. Blocking it
  //    avoids GDPR Art. 8 parental consent entirely (EU member states set the
  //    digital-consent age anywhere from 13 to 16, so there is no single teen
  //    age that clears every market). The in-app leaderboard is deliberately
  //    NOT restricted alongside it: those opponents are seeded local bots
  //    (services/leaderboard/leaderboard.ts), nothing about it is transmitted
  //    or visible to another person.
  //  - aiPhotoUpload: a receipt or product photo is the highest-sensitivity
  //    thing this app can transmit — it can carry faces, addresses and
  //    location. Manual entry covers the same ground without the transfer.
  //  - purchases: takes the strictest reading of the various unfair-commercial
  //    -practice rules on marketing to minors. Flip this one line to allow it.
  //  - engagementNudges: the UK Age Appropriate Design Code names nudge
  //    techniques that extend engagement as something to design out for
  //    under-18s. Bill reminders survive because the user asked for them.
  //  - behavioralLearning: privacy by default. Stays available as an explicit
  //    opt-in in Settings, it just never starts on.
  teen: Object.freeze({
    band: 'teen',
    appAccess: true,
    socialAccounts: false,
    aiPhotoUpload: false,
    purchases: false,
    engagementNudges: false,
    utilityReminders: true,
    behavioralLearning: false,
    requiresAiConsent: true,
  }),
  adult: Object.freeze({
    band: 'adult',
    appAccess: true,
    socialAccounts: true,
    aiPhotoUpload: true,
    purchases: true,
    engagementNudges: true,
    utilityReminders: true,
    behavioralLearning: true,
    requiresAiConsent: false,
  }),
};

// Component-wise comparison rather than any Date mutation — CLAUDE.md §7
// rule #5 exists because setMonth/setDate silently roll over, and a birthday
// on the 29th of February is exactly the input that would expose it.
export function ageFromBirthDate(birthDate: string, now: Date = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  if (!year || !month || !day) return Number.NaN;
  let age = now.getFullYear() - year;
  const monthsAhead = now.getMonth() + 1 - month;
  if (monthsAhead < 0 || (monthsAhead === 0 && now.getDate() < day)) age -= 1;
  return age;
}

export function ageBandFor(birthDate: string | null, now: Date = new Date()): AgeBand | null {
  if (!birthDate) return null;
  const age = ageFromBirthDate(birthDate, now);
  if (Number.isNaN(age)) return null;
  if (age < MINIMUM_AGE) return 'child';
  if (age < ADULT_AGE) return 'teen';
  return 'adult';
}

// An unknown band resolves to the teen rules, not the adult ones. The age
// gate makes this unreachable in practice, but a permission check that fails
// open is the one failure mode that turns a bug into a compliance breach.
export function permissionsFor(band: AgeBand | null): AgePermissions {
  return AGE_PERMISSIONS[band ?? 'teen'];
}

// What a minor is told, in one place, so the age gate, Settings and every
// blocked surface describe the same restrictions in the same words.
export const TEEN_RESTRICTIONS: string[] = [
  'Friends, families and duels are off — those need an account, and an account means storing your email address',
  'Photo scanning is off, so no picture of yours is ever sent to an AI provider',
  'Subscriptions cannot be bought in-app',
  'Streak and study reminders are off — only bill reminders you set up yourself will arrive',
];
