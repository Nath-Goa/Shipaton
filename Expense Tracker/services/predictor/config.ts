// Operating parameters for the direction model. Every value here was chosen
// by measurement over a holdout window the fit never saw, not by taste —
// scripts/sweep-predictor.ts prints the comparison these came from.

/**
 * Sessions ahead the model predicts. 10 (~2 weeks) measured best across the
 * sweep: 5 is dominated by noise, and 20 drifts toward simply restating the
 * market's long-run upward drift.
 */
export const HORIZON_DAYS = 10;

/** L2 strength for the batch fit. Flat across 1e-3..2e-2; middle chosen. */
export const PREDICTOR_L2 = 5e-3;

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
