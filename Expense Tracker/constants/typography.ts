// Size-specific letter-spacing per the apple-design skill (§15): large
// display text wants negative tracking (letters read too far apart as they
// grow), small text wants slightly positive tracking for legibility, body
// stays near zero. A fixed letterSpacing for every size is wrong somewhere —
// this is a tiered lookup (not a continuous formula) calibrated against the
// font sizes already in use across this app (roughly 10.5–27px), not an
// invented scale.
//
// Calibration check: trackingFor(11.5, { uppercase: true }) === 0.5, which
// is exactly AppText's existing hand-picked `label` variant value — real
// evidence these tiers line up with this app's own prior tuning, not just a
// plausible-looking formula.
export function trackingFor(fontSize: number, options: { uppercase?: boolean } = {}): number {
  const base =
    fontSize >= 26 ? -0.7 : // matches TopBar's existing hand-tuned 27px title exactly
    fontSize >= 22 ? -0.5 : // AppText 'title' (24px) and similar large headings
    fontSize >= 17 ? -0.2 : // prominent numerals / subtitle-adjacent (17–20px)
    fontSize >= 13 ? 0 :    // body/default (13–16px) — no override, matches system default
    0.2;                    // small/caption text (this app's ~10.5–12.5px range)
  return options.uppercase ? base + 0.3 : base;
}
