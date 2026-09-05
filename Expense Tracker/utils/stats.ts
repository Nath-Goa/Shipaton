// Standard normal CDF via the Abramowitz & Stegun erf approximation
// (max absolute error ~1.5e-7) — plenty precise for a probability estimate
// used as a UI confidence number, and avoids pulling in a stats library for
// one function. Used by services/market/signals.ts to turn a stock's own
// recent volatility into an honest probability of a "flat" outcome.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}
