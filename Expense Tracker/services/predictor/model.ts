import { FEATURE_COUNT } from '@/services/predictor/features';

// L2-regularised logistic regression, trained by full-batch gradient descent
// at bootstrap and then nudged by online SGD as real outcomes land.
//
// Why this and not something bigger: it trains on ~13k samples in well under
// a second on a phone, it updates incrementally from a single labelled
// sample (which is exactly the shape of "the user opened the app and a
// 5-day-old prediction just resolved"), and every weight is directly
// readable as "this feature pushes the odds up/down by this much" — so the
// UI can show *why* a call was made instead of asserting a number.
//
// Features are standardised with statistics frozen at bootstrap. Those stats
// must never be recomputed from live data alone, or the online updates would
// be applied on a drifting scale and quietly corrupt the earlier weights.

export type Model = {
  version: number;
  weights: number[];
  bias: number;
  mean: number[];
  std: number[];
  /** Samples the batch fit saw. Online updates add to this. */
  samples: number;
  trainedAt: number;
};

export const MODEL_VERSION = 2;
const STANDARDIZED_FEATURE_LIMIT = 6;

export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export function standardize(model: Pick<Model, 'mean' | 'std'>, features: number[]): number[] {
  const out = new Array<number>(features.length);
  for (let i = 0; i < features.length; i++) {
    const std = model.std[i];
    const value = std > 1e-9 ? (features[i] - model.mean[i]) / std : 0;
    out[i] = Number.isFinite(value)
      ? Math.max(-STANDARDIZED_FEATURE_LIMIT, Math.min(STANDARDIZED_FEATURE_LIMIT, value))
      : 0;
  }
  return out;
}

/** Probability that the forward return is positive. */
export function predictProba(model: Model, features: number[]): number {
  const z = standardize(model, features);
  let sum = model.bias;
  for (let i = 0; i < z.length; i++) sum += model.weights[i] * z[i];
  return sigmoid(sum);
}

export function emptyModel(): Model {
  return {
    version: MODEL_VERSION,
    weights: new Array<number>(FEATURE_COUNT).fill(0),
    bias: 0,
    mean: new Array<number>(FEATURE_COUNT).fill(0),
    std: new Array<number>(FEATURE_COUNT).fill(1),
    samples: 0,
    trainedAt: 0,
  };
}

function fitStandardizer(rows: number[][]): { mean: number[]; std: number[] } {
  const n = rows.length;
  const dim = rows[0]?.length ?? FEATURE_COUNT;
  const mean = new Array<number>(dim).fill(0);
  const std = new Array<number>(dim).fill(1);
  if (n === 0) return { mean, std };

  for (const row of rows) {
    for (let i = 0; i < dim; i++) mean[i] += row[i];
  }
  for (let i = 0; i < dim; i++) mean[i] /= n;

  const variance = new Array<number>(dim).fill(0);
  for (const row of rows) {
    for (let i = 0; i < dim; i++) variance[i] += (row[i] - mean[i]) ** 2;
  }
  for (let i = 0; i < dim; i++) {
    const v = variance[i] / Math.max(1, n - 1);
    std[i] = Math.sqrt(v) || 1;
  }
  return { mean, std };
}

export type TrainOptions = {
  iterations?: number;
  learningRate?: number;
  l2?: number;
};

/**
 * Full-batch gradient descent. Deterministic — the same dataset always
 * produces the same model, which matters because the app rebuilds this
 * locally on each device rather than shipping trained weights.
 */
export function trainBatch(rows: number[][], labels: number[], options: TrainOptions = {}): Model {
  const iterations = options.iterations ?? 400;
  const learningRate = options.learningRate ?? 0.35;
  const l2 = options.l2 ?? 2e-3;

  const model = emptyModel();
  if (rows.length === 0) return model;

  const { mean, std } = fitStandardizer(rows);
  model.mean = mean;
  model.std = std;

  const n = rows.length;
  const dim = model.weights.length;
  const z: number[][] = rows.map((row) => standardize(model, row));

  const gradW = new Array<number>(dim).fill(0);
  for (let step = 0; step < iterations; step++) {
    gradW.fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const row = z[i];
      let sum = model.bias;
      for (let j = 0; j < dim; j++) sum += model.weights[j] * row[j];
      const error = sigmoid(sum) - labels[i];
      gradB += error;
      for (let j = 0; j < dim; j++) gradW[j] += error * row[j];
    }
    model.bias -= (learningRate * gradB) / n;
    for (let j = 0; j < dim; j++) {
      model.weights[j] -= learningRate * (gradW[j] / n + l2 * model.weights[j]);
    }
  }

  model.samples = n;
  model.trainedAt = Date.now();
  return model;
}

// Deliberately small: one resolved prediction should refine the model, never
// jerk it around. With L2 pulling weights toward zero on every update, a
// long quiet stretch decays gently instead of drifting.
const ONLINE_LEARNING_RATE = 0.002;
const ONLINE_L2 = 1e-4;

/** Fold a single newly-resolved outcome into the model, in place-safe form. */
export function onlineUpdate(model: Model, features: number[], label: number): Model {
  const z = standardize(model, features);
  let sum = model.bias;
  for (let i = 0; i < z.length; i++) sum += model.weights[i] * z[i];
  const error = sigmoid(sum) - label;

  const weights = model.weights.slice();
  for (let i = 0; i < weights.length; i++) {
    weights[i] -= ONLINE_LEARNING_RATE * (error * z[i] + ONLINE_L2 * weights[i]);
  }
  return {
    ...model,
    weights,
    bias: model.bias - ONLINE_LEARNING_RATE * error,
    samples: model.samples + 1,
  };
}
