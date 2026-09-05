import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { CONFIDENCE_THRESHOLD, HORIZON_DAYS } from '@/services/predictor/config';
import { onlineUpdate, type Model } from '@/services/predictor/model';
import { PRETRAINED } from '@/services/predictor/pretrained';
import { runSelfTest, type PredictorHealth } from '@/services/predictor/selfTest';
import type { PendingPrediction, PredictorAccuracy, ResolvedPrediction } from '@/types/prediction';

// Owns the live model and its track record.
//
// Ships with weights fitted offline over ~150k samples and 90 symbols
// (services/predictor/pretrained.ts), then adapts on device: every
// prediction is logged with the features that produced it, and when the
// 20-session horizon elapses the realised outcome is folded back in with a
// single small SGD step. That is the "gets better the more you use it" loop,
// and it is also what makes the accuracy figure shown in the app a real
// measurement of this install rather than a marketing number.

const MAX_PENDING = 300;
const MAX_RESOLVED = 500;

type PredictorState = {
  model: Model;
  pending: PendingPrediction[];
  resolved: ResolvedPrediction[];
  lastNewsScanAt: number;
  /** Set when the persisted model predates a feature-set change. */
  modelVersion: number;
  /** Result of the most recent launch-time integrity check. */
  health: PredictorHealth | null;

  recordPrediction: (entry: Omit<PendingPrediction, 'id' | 'resolveAfter'>) => void;
  resolvePending: (priceLookup: (symbol: string) => number | null) => number;
  markNewsScanned: () => void;
  checkHealth: () => PredictorHealth;
  accuracy: () => PredictorAccuracy;
  resetModel: () => void;
};

function freshModel(): Model {
  // Structured-cloned so an online update can never mutate the imported
  // constant, which would silently corrupt the reset path.
  return JSON.parse(JSON.stringify(PRETRAINED)) as Model;
}

// One prediction per symbol per day is plenty of training signal, and it
// keeps the log from filling with near-identical rows if a user opens a
// stock repeatedly.
function alreadyLoggedToday(pending: PendingPrediction[], symbol: string, now: number): boolean {
  const dayMs = 24 * 60 * 60 * 1000;
  return pending.some((p) => p.symbol === symbol && now - p.createdAt < dayMs);
}

export const usePredictorStore = create<PredictorState>()(
  persist(
    (set, get) => ({
      model: freshModel(),
      pending: [],
      resolved: [],
      lastNewsScanAt: 0,
      modelVersion: PRETRAINED.version,
      health: null,

      recordPrediction: (entry) => {
        const now = Date.now();
        const state = get();
        if (alreadyLoggedToday(state.pending, entry.symbol, now)) return;
        // ~7 calendar days per 5 sessions; the resolver also re-checks that
        // the price actually moved on, so an early wake-up is harmless.
        const resolveAfter = now + HORIZON_DAYS * 1.45 * 24 * 60 * 60 * 1000;
        const pending: PendingPrediction = {
          ...entry,
          id: `${entry.symbol}-${now}`,
          resolveAfter,
        };
        set({ pending: [...state.pending, pending].slice(-MAX_PENDING) });
      },

      resolvePending: (priceLookup) => {
        const now = Date.now();
        const state = get();
        const stillPending: PendingPrediction[] = [];
        const newlyResolved: ResolvedPrediction[] = [];
        let model = state.model;

        for (const entry of state.pending) {
          if (entry.resolveAfter > now) {
            stillPending.push(entry);
            continue;
          }
          const price = priceLookup(entry.symbol);
          if (price === null || !(price > 0) || !(entry.priceAtPrediction > 0)) {
            // No usable price to score against — drop rather than keep
            // retrying forever against a symbol that never resolves.
            continue;
          }
          const actualReturn = price / entry.priceAtPrediction - 1;
          const label = actualReturn > 0 ? 1 : 0;
          const predictedUp = entry.probabilityUp >= 0.5 ? 1 : 0;

          model = onlineUpdate(model, entry.features, label);
          newlyResolved.push({
            id: entry.id,
            symbol: entry.symbol,
            createdAt: entry.createdAt,
            resolvedAt: now,
            probabilityUp: entry.probabilityUp,
            priceAtPrediction: entry.priceAtPrediction,
            priceAtResolution: price,
            wasCorrect: predictedUp === label,
            actualReturn,
          });
        }

        if (newlyResolved.length === 0) {
          if (stillPending.length !== state.pending.length) set({ pending: stillPending });
          return 0;
        }

        set({
          model,
          pending: stillPending,
          resolved: [...state.resolved, ...newlyResolved].slice(-MAX_RESOLVED),
        });
        return newlyResolved.length;
      },

      markNewsScanned: () => set({ lastNewsScanAt: Date.now() }),

      checkHealth: () => {
        const health = runSelfTest(get().model);
        set({ health });
        return health;
      },

      accuracy: () => {
        const { resolved } = get();
        let correct = 0;
        let confidentResolved = 0;
        let confidentCorrect = 0;
        for (const r of resolved) {
          if (r.wasCorrect) correct += 1;
          const confident =
            r.probabilityUp >= CONFIDENCE_THRESHOLD || r.probabilityUp <= 1 - CONFIDENCE_THRESHOLD;
          if (confident) {
            confidentResolved += 1;
            if (r.wasCorrect) confidentCorrect += 1;
          }
        }
        return {
          resolved: resolved.length,
          correct,
          accuracy: resolved.length > 0 ? correct / resolved.length : 0,
          confidentResolved,
          confidentCorrect,
          confidentAccuracy: confidentResolved > 0 ? confidentCorrect / confidentResolved : 0,
        };
      },

      resetModel: () => set({ model: freshModel(), pending: [], resolved: [], health: null }),
    }),
    {
      name: 'predictor-store',
      storage: createJSONStorage(() => AsyncStorage),
      // A shipped-weights or feature-set change makes every stored weight
      // and every pending row meaningless — they describe a different model.
      // Rehydrating them would produce confident nonsense, so they're
      // dropped rather than migrated.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stale =
          state.modelVersion !== PRETRAINED.version ||
          state.model?.weights?.length !== PRETRAINED.weights.length;
        if (stale) {
          state.model = freshModel();
          state.pending = [];
          state.resolved = [];
          state.modelVersion = PRETRAINED.version;
          state.health = null;
        }
      },
    }
  )
);
