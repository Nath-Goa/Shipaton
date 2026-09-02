export type PatternSignal = {
  name: string;
  confidence: number; // 0-100
  signal: string; // e.g. "buy_signal" | "sell_signal" | "neutral" | "investigate"
  reasoning: string;
  technicalDetails?: string;
  learningMoment?: string;
};

export type Anomaly = {
  type: string;
  magnitude: number;
  signal: string;
  reasoning: string;
  possibleCauses?: string[];
};

export type PatternDetectionResult = {
  patterns: PatternSignal[];
  anomalies: Anomaly[];
  summary: string;
  nextActions: string[];
};
