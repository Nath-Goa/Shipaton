// Operating parameters for the direction model. Every value here was chosen
// by measurement over a holdout window the fit never saw, not by taste —
// scripts/sweep-predictor.ts prints the comparison these came from.

/**
 * Sessions ahead the model predicts. Re-measured against current market
 * data: pooled across the full 90-symbol training universe, 5/10/20 are all
 * within noise of each other (npm run sweep:predictor prints the current
 * comparison) — there is no dramatic winner. What actually decided this was
 * scripts/evaluate-predictor.ts's "ON THE APP'S 27 TICKERS ONLY" line, the
 * slice that matches what a user actually sees: 20 measured confident calls
 * at ~65% accuracy over ~17% of them, versus ~58% over ~14% at 10. Re-run
 * both scripts before changing this — the sweep drifts over time as the
 * rolling holdout window moves forward with the market.
 *
 * Note the in-app footnote (PRETRAINED_METRICS, PredictionCard.tsx) reports
 * the pooled 90-symbol number instead (a bigger, more statistically honest
 * sample — currently ~55% over ~15%), not this 27-ticker figure. Don't
 * "fix" that to show the flashier number; the pooled one is the one with
 * enough samples under it to actually trust.
 */
export const HORIZON_DAYS = 20;

/** L2 strength for the batch fit. Flat across 1e-3..2e-2; higher end measured slightly better at horizon=20. */
export const PREDICTOR_L2 = 2e-2;

/**
 * How sure the model must be before it says anything at all.
 *
 * This is the single most important number in the whole predictor. Below it
 * the app reports "no clear signal" instead of a call, because that is the
 * truth: near 0.5 the model has nothing to say, and dressing that up as a
 * prediction would be lying to a beginner with money-shaped decisions in
 * front of them. Measured on the holdout, calls above this threshold were
 * right meaningfully more often than the always-majority baseline, while
 * calls below it were not.
 *
 * Set to 0.555, not a rounder 0.56, chasing a specific request: could the
 * predictor reach 65% accuracy at 20% confident-call coverage (on the app's
 * own 27 tickers)? Four interaction features were added to features.ts to
 * try (rsiXmktVol, trendXmktDrawdown, gapXvolScaledMom, mktVol20Sq — see
 * FEATURE_NAMES's comment there) and genuinely helped: out-of-sample AUC on
 * the app's tickers moved 0.581→0.584, and confident accuracy at a given
 * threshold improved by ~1.5-2 points across the board. At this exact
 * threshold, measured: 64.03% accuracy over 20.30% coverage — real, close
 * to the target, not quite over the line on accuracy. 0.56 would land
 * 66.41%/16.12% instead (over 65%, under 20%) — every threshold in this
 * region is a real tradeoff along the same curve, there is no point that
 * clears both 65 and 20 at once with this model. Re-run npm run
 * eval:predictor before nudging this further; it drifts with the market.
 */
export const CONFIDENCE_THRESHOLD = 0.555;

/** Never claim more certainty than the holdout supports, however extreme the odds look. */
export const MAX_DISPLAYED_CONFIDENCE = 0.75;
