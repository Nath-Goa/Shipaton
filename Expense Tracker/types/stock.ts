export type PriceBar = {
  date: string; // "YYYY-MM-DD"
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Quote = {
  symbol: string;
  price: number;
  changeAbs: number;
  changePct: number;
  dayHigh: number;
  dayLow: number;
};

export type Direction = 'up' | 'down' | 'flat';

export type DirectionCall = {
  direction: Direction;
  confidence: number; // 0-1
  reason: string;
  horizonDays: number;
};

export type ForecastBand = {
  horizonDays: number;
  low: number;
  mid: number;
  high: number;
};

export type Range = '1W' | '1M' | '3M' | '1Y';
