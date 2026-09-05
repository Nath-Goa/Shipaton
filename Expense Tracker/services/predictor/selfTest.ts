import { predictProba, type Model } from '@/services/predictor/model';
import { SELF_TEST_BASELINE, SELF_TEST_SET } from '@/services/predictor/selfTestSet';

// Launch-time integrity check for the on-device model.
//
// What this does and does not claim: it re-scores 400 frozen samples of real
// market history from 2017-2018 that the shipped weights never trained on,
// and compares the result to what those shipped weights scored at build
// time. It is a *drift* detector, not a quality proof — the model's edge is
// regime-dependent and it scores below a coin flip on that particular era
// (AUC 0.48), which is exactly why the comparison is against the recorded
// shipped-weight result rather than against some absolute bar.
//
// The thing it actually protects against is real: online learning mutates
// the weights on this device, and a bad run of outcomes could in principle
// drag them somewhere useless. If that happens the app must stop making
// predictions rather than quietly serve corrupted ones.

export type PredictorHealth = {
  status: 'ok' | 'degraded';
  accuracy: number;
  baselineAccuracy: number;
  /** Percentage points below the shipped-weight result. */
  drift: number;
  samples: number;
  eraStart: string;
  eraEnd: string;
  checkedAt: number;
};

// 400 samples put the standard error near 2.5 points, so an 8-point drop is
// roughly three sigma — comfortably past noise, and only reachable if online
// learning has genuinely broken something.
const MAX_ACCURACY_DROP = 0.08;

export function runSelfTest(model: Model): PredictorHealth {
  let correct = 0;
  for (const sample of SELF_TEST_SET) {
    const p = predictProba(model, sample.x);
    if ((p >= 0.5 ? 1 : 0) === sample.y) correct += 1;
  }
  const accuracy = SELF_TEST_SET.length > 0 ? correct / SELF_TEST_SET.length : 0;
  const drift = SELF_TEST_BASELINE.accuracy - accuracy;

  return {
    status: drift > MAX_ACCURACY_DROP ? 'degraded' : 'ok',
    accuracy,
    baselineAccuracy: SELF_TEST_BASELINE.accuracy,
    drift,
    samples: SELF_TEST_SET.length,
    eraStart: SELF_TEST_BASELINE.eraStart,
    eraEnd: SELF_TEST_BASELINE.eraEnd,
    checkedAt: Date.now(),
  };
}
