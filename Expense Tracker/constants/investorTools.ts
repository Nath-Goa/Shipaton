import type { Ionicons } from '@expo/vector-icons';

import type { Tier } from '@/constants/subscription';

export type InvestorToolInput = {
  key: string;
  label: string;
  defaultValue: string;
  prefix?: string;
  suffix?: string;
};

export type InvestorToolResult = { value: string; detail: string };

export type InvestorTool = {
  id: string;
  title: string;
  summary: string;
  category: 'Growth' | 'Trading' | 'Valuation' | 'Planning';
  tier: Tier;
  icon: keyof typeof Ionicons.glyphMap;
  inputs: InvestorToolInput[];
  calculate: (values: Record<string, number>) => InvestorToolResult | null;
};

const money = (value: number) => `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`;
const pct = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
const ratio = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}×`;
const valid = (...values: number[]) => values.every(Number.isFinite);

export const INVESTOR_TOOLS: InvestorTool[] = [
  {
    id: 'compound-growth', title: 'Compound growth', category: 'Growth', tier: 'free', icon: 'trending-up-outline',
    summary: 'See what a lump sum could become over time.',
    inputs: [
      { key: 'principal', label: 'Starting amount', defaultValue: '10000', prefix: '$' },
      { key: 'rate', label: 'Annual return', defaultValue: '8', suffix: '%' },
      { key: 'years', label: 'Years', defaultValue: '10' },
    ],
    calculate: ({ principal, rate, years }) => {
      if (!valid(principal, rate, years) || principal < 0 || years < 0 || rate <= -100) return null;
      const future = principal * Math.pow(1 + rate / 100, years);
      return { value: money(future), detail: `${money(future - principal)} of estimated growth before taxes and fees.` };
    },
  },
  {
    id: 'dca-projection', title: 'Monthly investing projection', category: 'Growth', tier: 'free', icon: 'calendar-outline',
    summary: 'Project regular monthly contributions with compounding.',
    inputs: [
      { key: 'monthly', label: 'Monthly contribution', defaultValue: '250', prefix: '$' },
      { key: 'rate', label: 'Annual return', defaultValue: '8', suffix: '%' },
      { key: 'years', label: 'Years', defaultValue: '10' },
    ],
    calculate: ({ monthly, rate, years }) => {
      if (!valid(monthly, rate, years) || monthly < 0 || years < 0 || rate <= -100) return null;
      const months = years * 12;
      const monthlyRate = rate / 1200;
      const future = monthlyRate === 0 ? monthly * months : monthly * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
      return { value: money(future), detail: `${money(monthly * months)} contributed; the rest is estimated growth.` };
    },
  },
  {
    id: 'position-size', title: 'Position size', category: 'Trading', tier: 'free', icon: 'resize-outline',
    summary: 'Size a trade from your maximum acceptable loss.',
    inputs: [
      { key: 'portfolio', label: 'Portfolio value', defaultValue: '100000', prefix: '$' },
      { key: 'risk', label: 'Risk per trade', defaultValue: '1', suffix: '%' },
      { key: 'stop', label: 'Stop distance', defaultValue: '5', suffix: '%' },
    ],
    calculate: ({ portfolio, risk, stop }) => {
      if (!valid(portfolio, risk, stop) || portfolio < 0 || risk < 0 || stop <= 0) return null;
      const lossBudget = portfolio * risk / 100;
      return { value: money(lossBudget / (stop / 100)), detail: `At the stop, the estimated loss is capped near ${money(lossBudget)}.` };
    },
  },
  {
    id: 'stop-loss', title: 'Stop-loss price', category: 'Trading', tier: 'free', icon: 'shield-outline',
    summary: 'Turn a percentage risk limit into a price.',
    inputs: [
      { key: 'entry', label: 'Entry price', defaultValue: '100', prefix: '$' },
      { key: 'loss', label: 'Maximum decline', defaultValue: '7', suffix: '%' },
    ],
    calculate: ({ entry, loss }) => {
      if (!valid(entry, loss) || entry < 0 || loss < 0 || loss > 100) return null;
      return { value: money(entry * (1 - loss / 100)), detail: `${money(entry * loss / 100)} below the entry price per share.` };
    },
  },
  {
    id: 'take-profit', title: 'Take-profit price', category: 'Trading', tier: 'free', icon: 'flag-outline',
    summary: 'Turn a return target into a price level.',
    inputs: [
      { key: 'entry', label: 'Entry price', defaultValue: '100', prefix: '$' },
      { key: 'gain', label: 'Target gain', defaultValue: '15', suffix: '%' },
    ],
    calculate: ({ entry, gain }) => {
      if (!valid(entry, gain) || entry < 0 || gain < 0) return null;
      return { value: money(entry * (1 + gain / 100)), detail: `${money(entry * gain / 100)} above the entry price per share.` };
    },
  },
  {
    id: 'risk-reward', title: 'Risk / reward ratio', category: 'Trading', tier: 'free', icon: 'scale-outline',
    summary: 'Compare the downside to your planned upside.',
    inputs: [
      { key: 'entry', label: 'Entry price', defaultValue: '100', prefix: '$' },
      { key: 'stop', label: 'Stop price', defaultValue: '92', prefix: '$' },
      { key: 'target', label: 'Target price', defaultValue: '116', prefix: '$' },
    ],
    calculate: ({ entry, stop, target }) => {
      const risk = entry - stop;
      const reward = target - entry;
      if (!valid(entry, stop, target) || risk <= 0 || reward < 0) return null;
      return { value: `${ratio(reward / risk)} reward`, detail: `${money(risk)} at risk for ${money(reward)} of planned upside per share.` };
    },
  },
  {
    id: 'average-cost', title: 'Average share cost', category: 'Trading', tier: 'free', icon: 'layers-outline',
    summary: 'Combine two purchases into one weighted average.',
    inputs: [
      { key: 'shares1', label: 'First shares', defaultValue: '10' },
      { key: 'price1', label: 'First price', defaultValue: '80', prefix: '$' },
      { key: 'shares2', label: 'New shares', defaultValue: '5' },
      { key: 'price2', label: 'New price', defaultValue: '70', prefix: '$' },
    ],
    calculate: ({ shares1, price1, shares2, price2 }) => {
      const shares = shares1 + shares2;
      if (!valid(shares1, price1, shares2, price2) || shares <= 0 || Math.min(shares1, price1, shares2, price2) < 0) return null;
      return { value: money((shares1 * price1 + shares2 * price2) / shares), detail: `${shares.toLocaleString()} total shares after the purchase.` };
    },
  },
  {
    id: 'percent-change', title: 'Percentage change', category: 'Trading', tier: 'free', icon: 'swap-vertical-outline',
    summary: 'Convert any start and end values into a return.',
    inputs: [
      { key: 'start', label: 'Starting value', defaultValue: '80', prefix: '$' },
      { key: 'end', label: 'Ending value', defaultValue: '100', prefix: '$' },
    ],
    calculate: ({ start, end }) => {
      if (!valid(start, end) || start === 0) return null;
      const change = ((end - start) / Math.abs(start)) * 100;
      return { value: pct(change), detail: `${signedMoney(end - start)} of absolute change.` };
    },
  },
  {
    id: 'break-even', title: 'Loss recovery', category: 'Trading', tier: 'pro', icon: 'return-up-forward-outline',
    summary: 'See the gain required to recover from a decline.',
    inputs: [{ key: 'loss', label: 'Portfolio decline', defaultValue: '20', suffix: '%' }],
    calculate: ({ loss }) => {
      if (!valid(loss) || loss < 0 || loss >= 100) return null;
      const required = loss === 0 ? 0 : loss / (100 - loss) * 100;
      return { value: pct(required), detail: `A ${pct(loss)} loss needs a larger percentage gain because it starts from a smaller base.` };
    },
  },
  {
    id: 'cagr', title: 'Annualized return (CAGR)', category: 'Growth', tier: 'pro', icon: 'analytics-outline',
    summary: 'Turn a multi-year result into one yearly rate.',
    inputs: [
      { key: 'start', label: 'Starting value', defaultValue: '10000', prefix: '$' },
      { key: 'end', label: 'Ending value', defaultValue: '18000', prefix: '$' },
      { key: 'years', label: 'Years', defaultValue: '5' },
    ],
    calculate: ({ start, end, years }) => {
      if (!valid(start, end, years) || start <= 0 || end < 0 || years <= 0) return null;
      return { value: pct((Math.pow(end / start, 1 / years) - 1) * 100), detail: 'The smoothed yearly rate that connects the start and end values.' };
    },
  },
  {
    id: 'dividend-income', title: 'Dividend income', category: 'Valuation', tier: 'pro', icon: 'cash-outline',
    summary: 'Estimate annual cash income from a position.',
    inputs: [
      { key: 'shares', label: 'Shares owned', defaultValue: '100' },
      { key: 'price', label: 'Share price', defaultValue: '50', prefix: '$' },
      { key: 'yield', label: 'Dividend yield', defaultValue: '3', suffix: '%' },
    ],
    calculate: ({ shares, price, yield: dividendYield }) => {
      if (!valid(shares, price, dividendYield) || Math.min(shares, price, dividendYield) < 0) return null;
      const annual = shares * price * dividendYield / 100;
      return { value: `${money(annual)}/year`, detail: `About ${money(annual / 12)} per month before taxes, assuming the dividend is maintained.` };
    },
  },
  {
    id: 'dividend-reinvestment', title: 'Dividend reinvestment', category: 'Growth', tier: 'pro', icon: 'repeat-outline',
    summary: 'Estimate growth when dividends are reinvested.',
    inputs: [
      { key: 'principal', label: 'Starting position', defaultValue: '10000', prefix: '$' },
      { key: 'yield', label: 'Dividend yield', defaultValue: '4', suffix: '%' },
      { key: 'years', label: 'Years', defaultValue: '10' },
    ],
    calculate: ({ principal, yield: dividendYield, years }) => {
      if (!valid(principal, dividendYield, years) || principal < 0 || dividendYield <= -100 || years < 0) return null;
      const future = principal * Math.pow(1 + dividendYield / 100, years);
      return { value: money(future), detail: 'Assumes a constant yield, annual reinvestment, and no price movement or taxes.' };
    },
  },
  {
    id: 'pe-price', title: 'P/E implied price', category: 'Valuation', tier: 'pro', icon: 'pricetag-outline',
    summary: 'Translate earnings and a P/E multiple into a price.',
    inputs: [
      { key: 'eps', label: 'Earnings per share', defaultValue: '5', prefix: '$' },
      { key: 'multiple', label: 'P/E multiple', defaultValue: '20', suffix: '×' },
    ],
    calculate: ({ eps, multiple }) => {
      if (!valid(eps, multiple) || eps < 0 || multiple < 0) return null;
      return { value: money(eps * multiple), detail: `${money(eps)} EPS valued at ${ratio(multiple)} earnings.` };
    },
  },
  {
    id: 'peg-ratio', title: 'PEG ratio', category: 'Valuation', tier: 'pro', icon: 'git-compare-outline',
    summary: 'Compare a P/E multiple with expected earnings growth.',
    inputs: [
      { key: 'pe', label: 'P/E ratio', defaultValue: '24', suffix: '×' },
      { key: 'growth', label: 'Expected EPS growth', defaultValue: '18', suffix: '%' },
    ],
    calculate: ({ pe, growth }) => {
      if (!valid(pe, growth) || pe < 0 || growth <= 0) return null;
      return { value: ratio(pe / growth), detail: 'A shortcut for comparison, not proof that a stock is cheap or expensive.' };
    },
  },
  {
    id: 'margin-safety', title: 'Margin of safety', category: 'Valuation', tier: 'pro', icon: 'umbrella-outline',
    summary: 'Compare your fair-value estimate with market price.',
    inputs: [
      { key: 'fair', label: 'Estimated fair value', defaultValue: '120', prefix: '$' },
      { key: 'market', label: 'Market price', defaultValue: '90', prefix: '$' },
    ],
    calculate: ({ fair, market }) => {
      if (!valid(fair, market) || fair <= 0 || market < 0) return null;
      return { value: pct((fair - market) / fair * 100), detail: `${signedMoney(fair - market)} difference versus your fair-value estimate.` };
    },
  },
  {
    id: 'real-return', title: 'Inflation-adjusted return', category: 'Growth', tier: 'pro', icon: 'thermometer-outline',
    summary: 'Convert a nominal return into purchasing-power growth.',
    inputs: [
      { key: 'nominal', label: 'Investment return', defaultValue: '8', suffix: '%' },
      { key: 'inflation', label: 'Inflation rate', defaultValue: '3', suffix: '%' },
    ],
    calculate: ({ nominal, inflation }) => {
      if (!valid(nominal, inflation) || nominal <= -100 || inflation <= -100) return null;
      return { value: pct(((1 + nominal / 100) / (1 + inflation / 100) - 1) * 100), detail: 'Estimated change in buying power, using the exact real-return formula.' };
    },
  },
  {
    id: 'fee-drag', title: 'Long-term fee drag', category: 'Growth', tier: 'max', icon: 'cut-outline',
    summary: 'See how a yearly fee compounds against you.',
    inputs: [
      { key: 'principal', label: 'Starting amount', defaultValue: '50000', prefix: '$' },
      { key: 'return', label: 'Gross annual return', defaultValue: '8', suffix: '%' },
      { key: 'fee', label: 'Annual fee', defaultValue: '1', suffix: '%' },
      { key: 'years', label: 'Years', defaultValue: '20' },
    ],
    calculate: ({ principal, return: grossReturn, fee, years }) => {
      if (!valid(principal, grossReturn, fee, years) || principal < 0 || years < 0 || grossReturn <= -100 || grossReturn - fee <= -100) return null;
      const gross = principal * Math.pow(1 + grossReturn / 100, years);
      const net = principal * Math.pow(1 + (grossReturn - fee) / 100, years);
      return { value: money(gross - net), detail: `Estimated value lost to fee drag; ending value after fees is ${money(net)}.` };
    },
  },
  {
    id: 'allocation-drift', title: 'Rebalancing amount', category: 'Planning', tier: 'max', icon: 'pie-chart-outline',
    summary: 'Calculate the trade needed to restore a target weight.',
    inputs: [
      { key: 'total', label: 'Portfolio value', defaultValue: '100000', prefix: '$' },
      { key: 'current', label: 'Current asset value', defaultValue: '28000', prefix: '$' },
      { key: 'target', label: 'Target allocation', defaultValue: '25', suffix: '%' },
    ],
    calculate: ({ total, current, target }) => {
      if (!valid(total, current, target) || total < 0 || current < 0 || target < 0 || target > 100) return null;
      const trade = total * target / 100 - current;
      return { value: `${trade >= 0 ? 'Buy' : 'Sell'} ${money(Math.abs(trade))}`, detail: `Target holding value: ${money(total * target / 100)}.` };
    },
  },
  {
    id: 'emergency-runway', title: 'Cash runway', category: 'Planning', tier: 'max', icon: 'battery-half-outline',
    summary: 'Measure how many months your liquid savings cover.',
    inputs: [
      { key: 'savings', label: 'Liquid savings', defaultValue: '15000', prefix: '$' },
      { key: 'expenses', label: 'Monthly essentials', defaultValue: '3000', prefix: '$' },
    ],
    calculate: ({ savings, expenses }) => {
      if (!valid(savings, expenses) || savings < 0 || expenses <= 0) return null;
      const months = savings / expenses;
      return { value: `${months.toLocaleString('en-US', { maximumFractionDigits: 1 })} months`, detail: `At ${money(expenses)} of essential spending per month.` };
    },
  },
  {
    id: 'savings-goal', title: 'Savings goal timeline', category: 'Planning', tier: 'max', icon: 'hourglass-outline',
    summary: 'Estimate when steady contributions reach a goal.',
    inputs: [
      { key: 'current', label: 'Saved now', defaultValue: '5000', prefix: '$' },
      { key: 'target', label: 'Goal amount', defaultValue: '20000', prefix: '$' },
      { key: 'monthly', label: 'Monthly addition', defaultValue: '500', prefix: '$' },
    ],
    calculate: ({ current, target, monthly }) => {
      if (!valid(current, target, monthly) || Math.min(current, target) < 0 || monthly <= 0) return null;
      const months = Math.max(0, Math.ceil((target - current) / monthly));
      const years = Math.floor(months / 12);
      const remainder = months % 12;
      const readable = years > 0 ? `${years}y ${remainder}m` : `${months} months`;
      return { value: readable, detail: `${money(Math.max(0, target - current))} remaining at ${money(monthly)} per month, before investment returns.` };
    },
  },
];
