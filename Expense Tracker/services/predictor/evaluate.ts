import type { Sample } from '@/services/predictor/dataset';
import { predictProba, type Model } from '@/services/predictor/model';

// Honest scoring for the direction model. Accuracy alone is close to
// meaningless here: stocks drift up, so "always predict up" already scores
// well above 50%. Everything below is reported against that baseline, plus
// calibration — a model that says 60% should be right about 60% of the time,
// and one that is confidently wrong is worse than useless in an app that
// shows the number to a beginner.

export type Metrics = {
  samples: number;
  accuracy: number;
  /** Accuracy of always predicting the majority class in the test window. */
  baselineAccuracy: number;
  /** Accuracy above baseline, in percentage points. The number that matters. */
  edge: number;
  auc: number;
  brier: number;
  logLoss: number;
  meanProba: number;
  positiveRate: number;
  /** Accuracy restricted to the model's most confident calls. */
  highConfidence: { threshold: number; coverage: number; accuracy: number };
  calibration: { bucket: string; count: number; predicted: number; actual: number }[];
};

function auc(scores: number[], labels: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  let positives = 0;
  let negatives = 0;
  for (const p of pairs) {
    if (p.y === 1) positives += 1;
    else negatives += 1;
  }
  if (positives === 0 || negatives === 0) return 0.5;

  // Rank-sum with ties averaged.
  let rankSum = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].s === pairs[i].s) j += 1;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (pairs[k].y === 1) rankSum += avgRank;
    i = j + 1;
  }
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

export function evaluate(model: Model, samples: Sample[], confidenceThreshold = 0.56): Metrics {
  const empty: Metrics = {
    samples: 0,
    accuracy: 0,
    baselineAccuracy: 0,
    edge: 0,
    auc: 0.5,
    brier: 0,
    logLoss: 0,
    meanProba: 0,
    positiveRate: 0,
    highConfidence: { threshold: confidenceThreshold, coverage: 0, accuracy: 0 },
    calibration: [],
  };
  if (samples.length === 0) return empty;

  const scores: number[] = [];
  const labels: number[] = [];
  let correct = 0;
  let positives = 0;
  let brier = 0;
  let logLoss = 0;
  let probaSum = 0;
  let confidentTotal = 0;
  let confidentCorrect = 0;

  const buckets = new Map<number, { count: number; predicted: number; actual: number }>();

  for (const sample of samples) {
    const p = predictProba(model, sample.x);
    scores.push(p);
    labels.push(sample.y);
    probaSum += p;
    if (sample.y === 1) positives += 1;
    if ((p >= 0.5 ? 1 : 0) === sample.y) correct += 1;
    brier += (p - sample.y) ** 2;
    const clamped = Math.min(1 - 1e-9, Math.max(1e-9, p));
    logLoss += -(sample.y * Math.log(clamped) + (1 - sample.y) * Math.log(1 - clamped));

    const confident = p >= confidenceThreshold || p <= 1 - confidenceThreshold;
    if (confident) {
      confidentTotal += 1;
      if ((p >= 0.5 ? 1 : 0) === sample.y) confidentCorrect += 1;
    }

    const bucketKey = Math.min(9, Math.floor(p * 10));
    const bucket = buckets.get(bucketKey) ?? { count: 0, predicted: 0, actual: 0 };
    bucket.count += 1;
    bucket.predicted += p;
    bucket.actual += sample.y;
    buckets.set(bucketKey, bucket);
  }

  const n = samples.length;
  const positiveRate = positives / n;
  const baselineAccuracy = Math.max(positiveRate, 1 - positiveRate);
  const accuracy = correct / n;

  return {
    samples: n,
    accuracy,
    baselineAccuracy,
    edge: (accuracy - baselineAccuracy) * 100,
    auc: auc(scores, labels),
    brier: brier / n,
    logLoss: logLoss / n,
    meanProba: probaSum / n,
    positiveRate,
    highConfidence: {
      threshold: confidenceThreshold,
      coverage: confidentTotal / n,
      accuracy: confidentTotal > 0 ? confidentCorrect / confidentTotal : 0,
    },
    calibration: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, b]) => ({
        bucket: `${(key * 10).toFixed(0)}-${(key * 10 + 10).toFixed(0)}%`,
        count: b.count,
        predicted: b.predicted / b.count,
        actual: b.actual / b.count,
      })),
  };
}
