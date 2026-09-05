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
 */
export const CONFIDENCE_THRESHOLD = 0.56;

/** Never claim more certainty than the holdout supports, however extreme the odds look. */
export const MAX_DISPLAYED_CONFIDENCE = 0.75;
