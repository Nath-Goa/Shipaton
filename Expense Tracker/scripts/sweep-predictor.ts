/* eslint-disable no-console */
import { buildDataset, splitByDate, type LabelMode } from '@/services/predictor/dataset';
import { evaluate } from '@/services/predictor/evaluate';
import { trainBatch } from '@/services/predictor/model';

import { loadBars, TRAINING_UNIVERSE } from './fetch-bars.ts';

// Picks the model's target and hyper-parameters by measurement instead of
// taste. Every row is trained only on data before the holdout and scored on
// the untouched recent window, so the comparison is apples to apples.
// Run: npm run sweep:predictor  (uses the cache from eval:predictor)

const HOLDOUT_MONTHS = Number(process.env.HOLDOUT_MONTHS ?? 10);

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

async function main() {
  const barsBySymbol = await loadBars(TRAINING_UNIVERSE, 'training-universe');

  const horizons = [5, 10, 20];
  const modes: LabelMode[] = ['absolute', 'relative'];
  const l2s = [1e-3, 5e-3, 2e-2];

  console.log(
    'horizon  label     l2      train    test   acc      base     edge     AUC     confAcc  cover'
  );
  console.log('-'.repeat(96));

  let best = { auc: 0, label: '' };

  for (const horizon of horizons) {
    for (const labelMode of modes) {
      const samples = buildDataset(barsBySymbol, { horizon, labelMode });
      if (samples.length === 0) continue;
      const lastDate = samples[samples.length - 1].date;
      const cutoff = new Date(lastDate);
      cutoff.setMonth(cutoff.getMonth() - HOLDOUT_MONTHS);
      const cutoffDate = cutoff.toISOString().slice(0, 10);
      const { train, test } = splitByDate(samples, cutoffDate, horizon);
      if (train.length < 500 || test.length < 200) continue;

      for (const l2 of l2s) {
        const model = trainBatch(
          train.map((s) => s.x),
          train.map((s) => s.y),
          { l2, iterations: 500 }
        );
        const m = evaluate(model, test);
        const row = [
          String(horizon).padStart(7),
          labelMode.padEnd(9),
          l2.toExponential(0).padEnd(7),
          String(train.length).padStart(6),
          String(test.length).padStart(7),
          pct(m.accuracy).padStart(7),
          pct(m.baselineAccuracy).padStart(8),
          `${m.edge >= 0 ? '+' : ''}${m.edge.toFixed(2)}`.padStart(8),
          m.auc.toFixed(4).padStart(7),
          pct(m.highConfidence.accuracy).padStart(8),
          pct(m.highConfidence.coverage).padStart(7),
        ].join(' ');
        console.log(row);
        if (m.auc > best.auc) best = { auc: m.auc, label: `horizon=${horizon} ${labelMode} l2=${l2}` };
      }
    }
  }

  console.log('-'.repeat(96));
  console.log(`best out-of-sample AUC: ${best.auc.toFixed(4)}  (${best.label})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
