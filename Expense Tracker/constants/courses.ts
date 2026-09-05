import type { Ionicons } from '@expo/vector-icons';

export type SubpartType = 'lesson' | 'flashcards' | 'quiz' | 'practice' | 'mastery';

export const SUBPART_SEQUENCE: SubpartType[] = ['lesson', 'flashcards', 'quiz', 'practice', 'mastery'];

export const SUBPART_LABELS: Record<SubpartType, string> = {
  lesson: 'Lesson',
  flashcards: 'Flashcards',
  quiz: 'Quiz',
  practice: 'Practice it',
  mastery: 'Mastery check',
};

export type IconName = keyof typeof Ionicons.glyphMap;

export type KeyTerm = { term: string; def: string };

// Only 3 of 10 courses get real auto-detection off existing app state — the
// other 7 use a manual "Mark as done" confirm. Fragile bespoke detection for
// every course isn't worth the risk; see the plan's scoping note.
export type PracticeAction = 'stock-viewed' | 'trade-placed' | 'watchlist-added' | 'manual';

export type Course = {
  id: string;
  stage: 1 | 2 | 3;
  order: number; // 1-10, overall sequence
  title: string;
  icon: IconName;
  summary: string; // one-liner for the path node
  topicId: string; // primary constants/quizTopics.ts id used by this course's flashcards/quiz
  lesson: { paragraphs: string[]; keyTerms: KeyTerm[] };
  practice: { instruction: string; action: PracticeAction; ctaLabel: string; ctaRoute: string };
};

export const STAGES: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'Foundations' },
  { id: 2, label: 'Building Skills' },
  { id: 3, label: 'Advanced Strategy' },
];

export const COURSES: Course[] = [
  {
    id: 'market-basics',
    stage: 1,
    order: 1,
    title: 'Market Basics',
    icon: 'business-outline',
    summary: 'What a stock actually is, and how the market works.',
    topicId: 'market_cap',
    lesson: {
      paragraphs: [
        'A stock is a small slice of ownership in a real company. When you buy one share of a company, you literally own a tiny piece of that business — its factories, its brand, its future profits (or losses).',
        "Stocks trade on an exchange, like the NYSE or Nasdaq — a marketplace that matches buyers and sellers. The price you see isn't set by the company; it's set by whatever the last two people agreed to trade at, updated constantly throughout the trading day.",
        "A company's size is usually measured by market capitalization — the total value of all its shares combined. A company with a $2 trillion market cap and one with a $200 million market cap can both have a stock trading at, say, $50 a share; the price alone tells you nothing about the company's size.",
      ],
      keyTerms: [
        { term: 'Ticker symbol', def: 'The short letter code used to identify a stock, like AAPL for Apple.' },
        { term: 'Exchange', def: 'A marketplace where stocks are bought and sold, like the NYSE or Nasdaq.' },
        { term: 'Market capitalization', def: "A company's total value: share price × number of shares outstanding." },
      ],
    },
    practice: {
      instruction: "Open the Markets tab and tap into any stock's detail page — just get comfortable browsing.",
      action: 'stock-viewed',
      ctaLabel: 'Open Markets',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'reading-charts',
    stage: 1,
    order: 2,
    title: 'Reading a Quote & Chart',
    icon: 'analytics-outline',
    summary: 'Prices, candles, and what a chart is actually showing you.',
    topicId: 'candlestick_basics',
    lesson: {
      paragraphs: [
        "A stock quote shows more than a price. You'll usually see the current price, the day's change (in dollars and percent), and a high/low range — how far the price has swung since the market opened.",
        'Most charts show price over time using candlesticks — one "candle" per time period. Each candle has a body (between the opening and closing price) and thin wicks above and below (the high and low reached during that period). A green or hollow candle usually means the price rose; a red or filled candle means it fell.',
        "Zooming out on a chart shows the trend — the general direction price has moved over weeks or months — while zooming in shows short-term noise. Both matter, but they answer different questions: is this generally going up, and what's it doing right now?",
      ],
      keyTerms: [
        { term: 'Candlestick', def: "A chart symbol showing a period's open, close, high, and low price in one shape." },
        { term: 'Trend', def: 'The general direction a price has been moving over a longer stretch of time.' },
        { term: 'Volatility', def: 'How much and how quickly a price swings up and down.' },
      ],
    },
    practice: {
      instruction: "Open any stock's chart and switch between the 1W, 1M, and 3M ranges to see how the trend changes.",
      action: 'manual',
      ctaLabel: 'Open a stock chart',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'company-fundamentals',
    stage: 1,
    order: 3,
    title: 'Company Fundamentals',
    icon: 'document-text-outline',
    summary: 'P/E ratios, earnings, and judging if a price is "expensive."',
    topicId: 'pe_ratio',
    lesson: {
      paragraphs: [
        "\"Expensive\" and \"cheap\" don't mean much for a stock price alone — a $5 stock can be wildly overpriced and a $500 stock can be a bargain. Fundamentals are the numbers that let you compare companies fairly, regardless of share price.",
        'The most common one is the P/E ratio (price-to-earnings): the share price divided by the company\'s annual earnings per share. A P/E of 20 means investors are paying $20 for every $1 the company earns per year — roughly how many years of current profit it would take to "pay back" the stock at today\'s price.',
        "A high P/E isn't automatically bad — it often means investors expect fast future growth. A low P/E isn't automatically a bargain — it can mean the market expects trouble ahead. The number is a starting question, not a final answer.",
      ],
      keyTerms: [
        { term: 'P/E ratio', def: "Share price divided by earnings per share — how much investors pay per dollar of profit." },
        { term: 'Earnings per share (EPS)', def: "A company's profit divided by its number of outstanding shares." },
        { term: 'Growth expectations', def: "The market's built-in guess about how much a company's profits will grow." },
      ],
    },
    practice: {
      instruction: "Open two different stocks and compare their direction calls and price trends side by side.",
      action: 'manual',
      ctaLabel: 'Compare two stocks',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'risk-diversification',
    stage: 1,
    order: 4,
    title: 'Risk & Diversification',
    icon: 'shield-checkmark-outline',
    summary: 'Why "don\'t put all your eggs in one basket" is real strategy.',
    topicId: 'diversification',
    lesson: {
      paragraphs: [
        "Every stock carries risk specific to that one company — a bad product launch, a lawsuit, a scandal. Diversification means spreading money across many different stocks (and ideally different sectors) so that no single company's bad news can sink your whole portfolio.",
        "It doesn't eliminate risk entirely — if the whole market drops, a diversified portfolio drops too, just usually less violently than a single bad stock would. What diversification protects you from is company-specific risk, not market-wide risk.",
        'A simple gut-check: if you couldn\'t explain in one sentence why you own 40% of your portfolio in one stock, you\'re probably concentrated more than you meant to be.',
      ],
      keyTerms: [
        { term: 'Diversification', def: 'Spreading investments across many assets so no single one can sink your portfolio.' },
        { term: 'Sector', def: 'A group of companies in the same broad industry, like Technology or Healthcare.' },
        { term: 'Concentration risk', def: "The extra risk from having too much money in too few holdings." },
      ],
    },
    practice: {
      instruction: 'Open Portfolio (under Markets) and check how many different sectors your current holdings span.',
      action: 'manual',
      ctaLabel: 'Check your portfolio',
      ctaRoute: '/markets/portfolio',
    },
  },
  {
    id: 'technical-analysis',
    stage: 2,
    order: 5,
    title: 'Technical Analysis Basics',
    icon: 'pulse-outline',
    summary: 'Moving averages and reading momentum in a price trend.',
    topicId: 'moving_averages',
    lesson: {
      paragraphs: [
        'Technical analysis studies price movement itself — patterns and momentum — rather than what a company actually does or earns. One of its simplest tools is the moving average: the average closing price over the last N days, recalculated every day so it "moves" along with the chart.',
        "A short moving average (like 5 days) reacts quickly to recent price changes; a long one (like 20 or 50 days) smooths out the noise and shows the bigger trend. When the short average crosses above the long one, it's often read as a sign of building upward momentum — and the reverse for downward momentum.",
        "No indicator predicts the future with certainty. Moving averages describe what has already happened and are best used as one input among several, not a crystal ball.",
      ],
      keyTerms: [
        { term: 'Moving average', def: "A price average that updates daily over a fixed rolling window, like the last 20 days." },
        { term: 'Momentum', def: "The tendency of a price trend to keep moving in the same direction, for now." },
        { term: 'Crossover', def: 'When a short-term average moves above or below a longer-term one.' },
      ],
    },
    practice: {
      instruction: "Open a stock with a clear up or down trend and read its Direction Call reasoning on the detail page.",
      action: 'manual',
      ctaLabel: 'Read a Direction Call',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'market-psychology',
    stage: 2,
    order: 6,
    title: 'Market Psychology & Sentiment',
    icon: 'thermometer-outline',
    summary: 'Bull and bear markets, and why fear and greed move prices.',
    topicId: 'bull_bear_markets',
    lesson: {
      paragraphs: [
        'Markets aren\'t purely rational — they\'re driven by millions of people\'s expectations, and expectations swing between optimism and fear. A "bull market" describes a sustained period of rising prices and investor confidence; a "bear market" describes a sustained decline, usually accompanied by pessimism and caution.',
        'Sentiment — the overall mood of investors toward a stock or the market — can move prices even before any real news changes. A stock can drop on a rumor and recover once it turns out to be false; that gap between rumor and fact is sentiment at work.',
        "Strong emotions make for weak decisions. Recognizing when you're trading out of fear (panic-selling a dip) or greed (chasing a stock after it's already spiked) is one of the most useful skills in investing — arguably more useful than any single indicator.",
      ],
      keyTerms: [
        { term: 'Bull market', def: 'A sustained period of rising prices and investor optimism.' },
        { term: 'Bear market', def: 'A sustained period of falling prices and investor pessimism.' },
        { term: 'Sentiment', def: 'The overall mood — optimistic or pessimistic — investors hold toward a stock or market.' },
      ],
    },
    practice: {
      instruction: "Open a stock and check its Sentiment score and headlines — does the mood match the price trend?",
      action: 'manual',
      ctaLabel: 'Check sentiment',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'order-types',
    stage: 2,
    order: 7,
    title: 'Order Types & Trade Mechanics',
    icon: 'swap-horizontal-outline',
    summary: 'Market orders, limit orders, and stop-losses in practice.',
    topicId: 'stop_loss_discipline',
    lesson: {
      paragraphs: [
        "A market order buys or sells immediately at whatever the current price is — simple and fast, but you accept whatever price you get. A limit order instead sets a specific price you're willing to buy or sell at, and only fills if the market reaches it — you control the price, but the trade might never happen.",
        "A stop-loss is a standing instruction to sell automatically if a price drops to a certain level — a pre-decided exit that removes emotion from the decision. Setting one before you're anxious about a position is far more effective than trying to decide calmly while watching it drop in real time.",
        "None of these order types guarantee a good outcome — they're tools for controlling exactly how and when a trade executes, which matters just as much as deciding what to trade in the first place.",
      ],
      keyTerms: [
        { term: 'Market order', def: 'An order that executes immediately at the current price.' },
        { term: 'Limit order', def: 'An order that only executes at a price you specify or better.' },
        { term: 'Stop-loss', def: 'A pre-set order to sell automatically if a price falls to a chosen level.' },
      ],
    },
    practice: {
      instruction: 'Place a mock trade in your Portfolio — a market buy or sell, using your paper cash.',
      action: 'trade-placed',
      ctaLabel: 'Place a trade',
      ctaRoute: '/markets/portfolio',
    },
  },
  {
    id: 'dividends-income',
    stage: 3,
    order: 8,
    title: 'Dividends & Passive Income',
    icon: 'cash-outline',
    summary: 'How companies pay shareholders, and what yield really means.',
    topicId: 'dividend_yield',
    lesson: {
      paragraphs: [
        'Some companies pay part of their profit directly to shareholders in cash, usually every quarter — this is a dividend. Not every company pays one; fast-growing companies often reinvest all their profit back into the business instead.',
        "Dividend yield expresses the payout as a percentage of the current share price — a $2/year dividend on a $50 stock is a 4% yield. A very high yield can be a genuine bargain, or it can be a warning sign that the price has fallen because the market doubts the dividend can be sustained.",
        "Reinvesting dividends back into more shares — rather than spending the cash — compounds over time and is one of the quieter, less exciting ways long-term investors build wealth.",
      ],
      keyTerms: [
        { term: 'Dividend', def: "A portion of a company's profit paid directly to shareholders, usually quarterly." },
        { term: 'Dividend yield', def: "Annual dividend per share divided by the current share price." },
        { term: 'Reinvestment', def: 'Using dividend cash to buy more shares instead of taking it as cash.' },
      ],
    },
    practice: {
      instruction: 'Check Portfolio (under Markets) for any dividend income you\'ve received on your current holdings.',
      action: 'manual',
      ctaLabel: 'Check dividend income',
      ctaRoute: '/markets/portfolio',
    },
  },
  {
    id: 'macro-sectors',
    stage: 3,
    order: 9,
    title: 'Macro Forces & Sectors',
    icon: 'globe-outline',
    summary: 'Interest rates, inflation, and how whole sectors move together.',
    topicId: 'sectors',
    lesson: {
      paragraphs: [
        "Individual companies matter, but so does the broader economy they operate in. Interest rates, inflation, and overall growth all ripple through the market — when borrowing gets more expensive, for instance, growth-focused companies that rely on future profits often get hit harder than stable, established ones.",
        "The market groups companies into sectors — Technology, Healthcare, Energy, Financials, and so on. Stocks in the same sector often move together, because they share the same customers, costs, and regulatory environment, even if their individual businesses are quite different.",
        '"Sector rotation" describes money moving from one sector to another as economic conditions change — for example, shifting from growth-heavy tech into steadier consumer staples when investors get more cautious.',
      ],
      keyTerms: [
        { term: 'Interest rates', def: "The cost of borrowing money, set largely by central bank policy." },
        { term: 'Sector', def: 'A group of companies in the same broad industry.' },
        { term: 'Sector rotation', def: 'Money shifting from one sector into another as conditions change.' },
      ],
    },
    practice: {
      instruction: 'Browse the Markets tab and note which sector each of your holdings — or watchlist picks — belongs to.',
      action: 'manual',
      ctaLabel: 'Browse sectors',
      ctaRoute: '/markets',
    },
  },
  {
    id: 'building-strategy',
    stage: 3,
    order: 10,
    title: 'Building a Strategy',
    icon: 'flag-outline',
    summary: 'Putting it together: sizing, discipline, and a plan you\'ll stick to.',
    topicId: 'risk_management',
    lesson: {
      paragraphs: [
        "Everything so far has been individual tools — fundamentals, charts, sentiment, order types. A strategy is what ties them together: a written-down (even if just mentally) plan for what you buy, why, how much, and when you'll sell.",
        "Position sizing — how much of your portfolio goes into any one trade — often matters more than which stock you pick. A strategy that risks a small, consistent slice per trade survives being wrong sometimes; one that bets big on every idea can be wiped out by a single mistake.",
        "Dollar-cost averaging — investing a fixed amount on a regular schedule regardless of price — is a simple, low-effort strategy that removes the pressure of trying to time the market perfectly. It won't catch the exact bottom, but it also won't catch you frozen with indecision.",
        "The best strategy isn't the most complicated one — it's the one you'll actually follow consistently, especially when the market gets uncomfortable.",
      ],
      keyTerms: [
        { term: 'Position sizing', def: 'Deciding how much of your portfolio to put into any single trade.' },
        { term: 'Dollar-cost averaging', def: 'Investing a fixed amount on a regular schedule, regardless of price.' },
        { term: 'Risk management', def: 'The practice of controlling how much you can lose, not just how much you might gain.' },
      ],
    },
    practice: {
      instruction: 'Add at least one stock to your watchlist — the start of tracking candidates for a real strategy.',
      action: 'watchlist-added',
      ctaLabel: 'Build a watchlist',
      ctaRoute: '/markets',
    },
  },
];

const COURSE_MAP = new Map(COURSES.map((c) => [c.id, c]));

export function courseOf(id: string): Course | undefined {
  return COURSE_MAP.get(id);
}

export function coursesForStage(stage: 1 | 2 | 3): Course[] {
  return COURSES.filter((c) => c.stage === stage).sort((a, b) => a.order - b.order);
}

export function nextCourseId(id: string): string | undefined {
  const course = COURSE_MAP.get(id);
  if (!course) return undefined;
  return COURSES.find((c) => c.order === course.order + 1)?.id;
}
