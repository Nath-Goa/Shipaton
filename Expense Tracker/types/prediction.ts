export type NewsItem = {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  publishedAt: number;
  symbol: string;
};

export type NewsSentiment = {
  /** -1..1, recency-weighted across scored headlines. */
  score: number;
  label: 'positive' | 'negative' | 'neutral';
  headlineCount: number;
  /** How many headlines actually contained scoreable language. */
  scoredCount: number;
  topHeadlines: { title: string; score: number }[];
};

export type PredictionDirection = 'up' | 'down' | 'unclear';

export type Prediction = {
  symbol: string;
  /** Calibrated probability the close is higher `horizonDays` sessions out. */
  probabilityUp: number;
  /** 'unclear' whenever the model is not confident enough to commit. */
  direction: PredictionDirection;
  /** Distance from a coin flip, 0..1 — what the UI shows as confidence. */
  confidence: number;
  horizonDays: number;
  /** Model probability before the news adjustment, for transparency. */
  baseProbability: number;
  newsAdjustment: number;
  news: NewsSentiment | null;
  /** Biggest contributors to this call, most influential first. */
  drivers: { feature: string; label: string; contribution: number }[];
  createdAt: number;
};

/** A prediction snapshot awaiting its outcome, used for online learning. */
export type PendingPrediction = {
  id: string;
  symbol: string;
  createdAt: number;
  /** Session-count target date this resolves on. */
  resolveAfter: number;
  priceAtPrediction: number;
  probabilityUp: number;
  features: number[];
};

export type ResolvedPrediction = {
  id: string;
  symbol: string;
  createdAt: number;
  resolvedAt: number;
  probabilityUp: number;
  priceAtPrediction: number;
  priceAtResolution: number;
  wasCorrect: boolean;
  actualReturn: number;
};

export type PredictorAccuracy = {
  resolved: number;
  correct: number;
  accuracy: number;
  /** Restricted to calls the model was confident enough to commit to. */
  confidentResolved: number;
  confidentCorrect: number;
  confidentAccuracy: number;
};
