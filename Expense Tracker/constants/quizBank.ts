import type { Difficulty, QuizQuestion } from '@/types/quiz';

export type BankQuizQuestion = QuizQuestion & { difficulty: Difficulty };

// Hand-written questions, one easy/medium/hard set per topic in
// constants/quizTopics.ts — so a full first pass through Learn never
// requires an AI call. Once a topic's set here is exhausted, the quiz
// screen falls back to AI generation (see app/(tabs)/learn/quiz.tsx).
export const QUIZ_BANK: Record<string, BankQuizQuestion[]> = {
  pe_ratio: [
    {
      difficulty: 'easy',
      question: 'What does the P/E ratio compare?',
      options: [
        "A stock's price to its earnings per share",
        "A stock's price to its dividend payment",
        'A company’s revenue to its expenses',
        "A stock's high price to its low price",
      ],
      correctIndex: 0,
      explanation:
        'P/E stands for "price-to-earnings." It divides the current share price by earnings per share (EPS), showing how much investors are paying for each dollar of profit the company makes.',
      learningObjective: 'Recognize what the P/E ratio actually measures.',
      followUpTopic: 'Earnings Per Share',
    },
    {
      difficulty: 'medium',
      question: 'A stock trades at $60 with EPS of $3. What is its P/E ratio?',
      options: ['20', '3', '180', '0.05'],
      correctIndex: 0,
      explanation:
        'P/E = price ÷ EPS, so $60 ÷ $3 = 20. Investors are paying $20 for every $1 of the company’s annual earnings.',
      learningObjective: 'Practice calculating P/E from price and EPS.',
      followUpTopic: 'Market Capitalization',
    },
    {
      difficulty: 'hard',
      question: 'A very high P/E ratio compared to industry peers most likely suggests the market believes the company will:',
      options: [
        'Grow earnings faster than peers in the future',
        'Go bankrupt within the year',
        'Pay a larger dividend than peers',
        'Have lower revenue than peers',
      ],
      correctIndex: 0,
      explanation:
        'A high P/E often reflects growth expectations — investors are willing to pay more per dollar of current earnings because they expect those earnings to grow quickly. It can also simply mean the stock is expensive relative to its profits, so it’s not proof of anything on its own.',
      learningObjective: 'Interpret what a high or low P/E signals about market expectations.',
      followUpTopic: 'Dividend Yield',
    },
  ],
  market_cap: [
    {
      difficulty: 'easy',
      question: 'How is a company’s market capitalization calculated?',
      options: [
        'Share price × total shares outstanding',
        'Annual revenue × profit margin',
        'Total assets − total liabilities',
        'Share price ÷ earnings per share',
      ],
      correctIndex: 0,
      explanation:
        'Market cap is the total value the market places on a company’s equity: current share price multiplied by the number of shares outstanding.',
      learningObjective: 'Learn the market capitalization formula.',
      followUpTopic: 'Small vs. Large Cap',
    },
    {
      difficulty: 'medium',
      question: 'A company has 2 million shares outstanding trading at $50 each. What is its market cap?',
      options: ['$100 million', '$2.5 million', '$25 million', '$1 billion'],
      correctIndex: 0,
      explanation: '2,000,000 shares × $50 = $100,000,000, or $100 million.',
      learningObjective: 'Practice calculating market cap from share count and price.',
      followUpTopic: 'Small vs. Large Cap',
    },
    {
      difficulty: 'hard',
      question: 'Two companies have identical market caps of $10 billion. Company A has 100 million shares; Company B has 1 billion shares. What does this tell you?',
      options: [
        'A’s share price is roughly 10x higher than B’s, but they’re equally valuable overall',
        'Company A is worth more than Company B',
        'Company B has more revenue than Company A',
        'The share count has no effect on price at a given market cap',
      ],
      correctIndex: 0,
      explanation:
        'Market cap is price × shares, so with the same market cap, fewer shares means a proportionally higher price per share. A $100 share price says nothing about whether a company is "expensive" — total market cap is the real measure of size.',
      learningObjective: 'Understand that share price alone doesn’t indicate company size.',
      followUpTopic: 'P/E Ratio',
    },
  ],
  dividend_yield: [
    {
      difficulty: 'easy',
      question: 'What does dividend yield measure?',
      options: [
        'Annual dividend payments as a percentage of share price',
        'The total profit a company made last year',
        'How many shares a company has issued',
        'The percentage change in a stock’s price over a year',
      ],
      correctIndex: 0,
      explanation:
        'Dividend yield = annual dividend per share ÷ share price, expressed as a percentage. It shows how much cash income you’d earn relative to what you paid for the stock.',
      learningObjective: 'Understand what dividend yield represents.',
      followUpTopic: 'Earnings Per Share',
    },
    {
      difficulty: 'medium',
      question: 'A stock pays $2 in annual dividends and trades at $40. What is its dividend yield?',
      options: ['5%', '2%', '20%', '0.5%'],
      correctIndex: 0,
      explanation: 'Dividend yield = $2 ÷ $40 = 0.05, or 5%.',
      learningObjective: 'Practice calculating dividend yield.',
      followUpTopic: 'P/E Ratio',
    },
    {
      difficulty: 'hard',
      question: 'A stock’s dividend yield suddenly jumps from 3% to 9% with no change in the dividend payment. What most likely happened?',
      options: [
        'The share price dropped sharply',
        'The company tripled its dividend',
        'The company issued more shares',
        'The stock split 3-for-1',
      ],
      correctIndex: 0,
      explanation:
        'Since yield = dividend ÷ price, and the dividend didn’t change, a tripled yield means the price fell to roughly a third of what it was. A sky-high yield is often a warning sign the market expects the dividend to be cut, not a bargain.',
      learningObjective: 'Recognize that a spiking yield can signal a falling share price, not a growing payout.',
      followUpTopic: 'Volatility',
    },
  ],
  eps: [
    {
      difficulty: 'easy',
      question: 'What does EPS (Earnings Per Share) tell you?',
      options: [
        'How much profit a company makes for each outstanding share',
        'The total revenue a company earned this year',
        'How many shares a company plans to issue',
        'The dividend paid per share',
      ],
      correctIndex: 0,
      explanation:
        'EPS = net income ÷ shares outstanding. It converts total company profit into a per-share figure, making it easy to compare profitability across companies of different sizes.',
      learningObjective: 'Understand what EPS measures.',
      followUpTopic: 'P/E Ratio',
    },
    {
      difficulty: 'medium',
      question: 'A company earns $50 million in net income and has 10 million shares outstanding. What is its EPS?',
      options: ['$5.00', '$0.20', '$500', '$50.00'],
      correctIndex: 0,
      explanation: 'EPS = $50,000,000 ÷ 10,000,000 shares = $5.00 per share.',
      learningObjective: 'Practice calculating EPS from net income and share count.',
      followUpTopic: 'P/E Ratio',
    },
    {
      difficulty: 'hard',
      question: 'A company’s EPS rises even though its total net income stayed flat year over year. What could explain this?',
      options: [
        'The company bought back and retired some of its own shares',
        'The company issued more new shares',
        'The stock price went up',
        'The company paid a larger dividend',
      ],
      correctIndex: 0,
      explanation:
        'EPS = net income ÷ shares outstanding. If income is flat but the share count shrinks (via a buyback), the same profit is now split among fewer shares, so EPS rises — even though the company didn’t actually become more profitable.',
      learningObjective: 'Recognize how share buybacks can move EPS independent of actual profit growth.',
      followUpTopic: 'Market Capitalization',
    },
  ],
  moving_averages: [
    {
      difficulty: 'easy',
      question: 'What does a moving average show on a stock chart?',
      options: [
        'The average price over a set recent period, updated each day',
        'The highest price the stock has ever reached',
        'The total trading volume for the day',
        'The company’s average annual profit',
      ],
      correctIndex: 0,
      explanation:
        'A moving average (e.g. the 50-day MA) is the average closing price over the last N days, recalculated daily. It smooths out day-to-day noise so you can see the underlying trend more clearly.',
      learningObjective: 'Understand the basic purpose of a moving average.',
      followUpTopic: 'Support & Resistance',
    },
    {
      difficulty: 'medium',
      question: 'A stock’s price crosses above its 50-day moving average after being below it for weeks. Traders often read this as:',
      options: [
        'A potential bullish (upward) trend signal',
        'A guaranteed sign the stock will crash',
        'Proof the company just reported record earnings',
        'A sign trading has been halted',
      ],
      correctIndex: 0,
      explanation:
        'A price crossing above its moving average is a commonly watched bullish signal — it suggests recent momentum has turned upward. It’s a signal to watch, not a guarantee, since price can just as easily cross back down.',
      learningObjective: 'Interpret a price/moving-average crossover as a trend signal.',
      followUpTopic: 'RSI: Overbought & Oversold',
    },
    {
      difficulty: 'hard',
      question: 'Why is a 200-day moving average generally "slower to react" than a 20-day moving average?',
      options: [
        'It averages over far more days, so any single day’s move has less weight',
        'It only updates once every 200 days',
        'It ignores the most recent trading days entirely',
        'It is calculated using volume instead of price',
      ],
      correctIndex: 0,
      explanation:
        'A 200-day average blends 200 days of prices together, so one big move barely shifts the overall average. A 20-day average is dominated by a much smaller, more recent set of prices, so it reacts to new moves faster.',
      learningObjective: 'Understand why longer-period moving averages are smoother and lag more.',
      followUpTopic: 'Volatility',
    },
  ],
  rsi_oversold: [
    {
      difficulty: 'easy',
      question: 'RSI (Relative Strength Index) is scored on a scale of:',
      options: ['0 to 100', '-100 to 100', '0 to 10', '1 to 5 stars'],
      correctIndex: 0,
      explanation:
        'RSI is a momentum indicator that ranges from 0 to 100, based on the size and speed of recent price gains versus losses.',
      learningObjective: 'Know the basic scale RSI is measured on.',
      followUpTopic: 'Moving Averages',
    },
    {
      difficulty: 'medium',
      question: 'An RSI reading above 70 is generally considered:',
      options: ['Overbought', 'Oversold', 'Neutral', 'Invalid'],
      correctIndex: 0,
      explanation:
        'RSI above 70 typically signals "overbought" — the price has risen quickly and may be due for a pause or pullback. Below 30 signals "oversold," the opposite situation.',
      learningObjective: 'Learn the standard overbought threshold for RSI.',
      followUpTopic: 'Support & Resistance',
    },
    {
      difficulty: 'hard',
      question: 'A stock’s RSI stays above 70 for several weeks while the price keeps climbing. What’s the key lesson here?',
      options: [
        '"Overbought" doesn’t mean "sell now" — a strong trend can stay overbought a long time',
        'RSI is broken and should be ignored going forward',
        'The stock is guaranteed to crash immediately',
        'RSI above 70 always means the company is unprofitable',
      ],
      correctIndex: 0,
      explanation:
        'RSI measures momentum, not a hard limit. In a strong, sustained uptrend, RSI can stay elevated for a long time as the price keeps climbing. Treat it as one input among several, not an automatic sell signal.',
      learningObjective: 'Understand the limits of using RSI as a standalone trading signal.',
      followUpTopic: 'Trading Volume',
    },
  ],
  volume_analysis: [
    {
      difficulty: 'easy',
      question: 'What does "trading volume" measure?',
      options: [
        'The number of shares traded over a given period',
        'The dollar value of a company’s total assets',
        'How volatile a stock’s price has been',
        'The number of analysts covering a stock',
      ],
      correctIndex: 0,
      explanation:
        'Volume is simply a count: how many shares of a stock changed hands during a period (usually a trading day).',
      learningObjective: 'Understand the basic definition of trading volume.',
      followUpTopic: 'Support & Resistance',
    },
    {
      difficulty: 'medium',
      question: 'A stock jumps 8% on volume far above its recent average. Compared to the same move on unusually light volume, this generally suggests:',
      options: [
        'Stronger, more broadly-confirmed conviction behind the move',
        'The move is definitely about to reverse',
        'The company is being delisted',
        'The price move doesn’t count because volume was high',
      ],
      correctIndex: 0,
      explanation:
        'High volume means many market participants are acting, which traders read as stronger confirmation of a price move. The same move on thin volume could just be a few trades pushing price around with little real conviction behind it.',
      learningObjective: 'Learn how volume is used to gauge the strength of a price move.',
      followUpTopic: 'RSI: Overbought & Oversold',
    },
    {
      difficulty: 'hard',
      question: 'A stock hits a new high, but volume has been steadily declining on each successive push upward. Technical analysts call this a warning sign because it suggests:',
      options: [
        'Fewer participants are backing the rally, so it may be losing steam',
        'The company’s earnings must be declining',
        'The stock is about to be added to a major index',
        'Volume declining always means a stock split is coming',
      ],
      correctIndex: 0,
      explanation:
        'When price keeps rising but volume keeps shrinking, it can mean the rally is running out of active buyers — a classic "bearish divergence" that sometimes precedes a reversal, though it’s a caution flag, not a certainty.',
      learningObjective: 'Recognize a volume/price divergence as a warning sign, not a guarantee.',
      followUpTopic: 'Moving Averages',
    },
  ],
  support_resistance: [
    {
      difficulty: 'easy',
      question: 'A "support level" on a stock chart is best described as:',
      options: [
        'A price area where buying pressure has repeatedly stopped a decline',
        'The company’s official price target from analysts',
        'The lowest price the stock is legally allowed to trade at',
        'A level set by the stock exchange',
      ],
      correctIndex: 0,
      explanation:
        'Support is a price zone where a stock has historically found buyers and stopped falling — not an official rule, just a pattern traders watch for.',
      learningObjective: 'Understand what a support level represents.',
      followUpTopic: 'Moving Averages',
    },
    {
      difficulty: 'medium',
      question: 'What happens, conceptually, when a stock breaks decisively below a well-established support level?',
      options: [
        'That old support level often becomes a new resistance level',
        'The stock is automatically halted from trading',
        'Support levels never matter again after being broken once',
        'The company must issue a press release',
      ],
      correctIndex: 0,
      explanation:
        'A classic pattern: once a support level breaks, that same price zone often flips into resistance — a level where the stock now struggles to rise back above, since traders who bought there may sell just to break even.',
      learningObjective: 'Learn how support and resistance can flip roles once broken.',
      followUpTopic: 'Trading Volume',
    },
    {
      difficulty: 'hard',
      question: 'Why do many traders consider a support or resistance level "more significant" the more times a price has bounced off it?',
      options: [
        'More tested levels reflect a wider consensus among market participants about where price is meaningful',
        'Each touch physically strengthens the price barrier',
        'Exchanges officially certify levels after three touches',
        'It has no real significance — more touches are purely coincidental',
      ],
      correctIndex: 0,
      explanation:
        'Support/resistance isn’t a physical barrier — it reflects where many traders have decided to buy or sell. The more times a level has held, the more traders are watching and reacting to it, which can become somewhat self-reinforcing.',
      learningObjective: 'Understand why repeatedly-tested levels carry more psychological weight.',
      followUpTopic: 'Candlestick Charts',
    },
  ],
  candlestick_basics: [
    {
      difficulty: 'easy',
      question: 'On a standard candlestick chart, what does a single candlestick represent?',
      options: [
        'The open, high, low, and close price over one time period',
        'Only the closing price for the day',
        'The total number of shares traded that day',
        'A company’s quarterly earnings report',
      ],
      correctIndex: 0,
      explanation:
        'Each candlestick packs four data points — open, high, low, close — for one period (often a day) into a single visual shape: a "body" and thin "wicks."',
      learningObjective: 'Understand what one candlestick represents.',
      followUpTopic: 'Support & Resistance',
    },
    {
      difficulty: 'medium',
      question: 'On most candlestick charts, a green (or unfilled) candle means:',
      options: [
        'The stock closed higher than it opened during that period',
        'The stock hit an all-time high',
        'Trading volume was above average',
        'The company reported positive earnings',
      ],
      correctIndex: 0,
      explanation:
        'Color just encodes direction: green/unfilled usually means the close was above the open (price rose that period); red/filled usually means the close was below the open (price fell).',
      learningObjective: 'Learn what candle color indicates.',
      followUpTopic: 'Trading Volume',
    },
    {
      difficulty: 'hard',
      question: 'A candlestick has a very long lower "wick" but a small body near the top of its range. What does this typically suggest happened during that period?',
      options: [
        'Sellers pushed the price down sharply, but buyers stepped in and pushed it back up before the close',
        'The stock traded in an extremely narrow range all period',
        'No trading occurred during that period',
        'The company announced a stock split',
      ],
      correctIndex: 0,
      explanation:
        'The long lower wick shows price fell far below the open at some point, while the small body near the top shows it recovered by the close — a classic sign buyers absorbed the selling pressure, sometimes called a "hammer" pattern.',
      learningObjective: 'Interpret what a candle’s wick length reveals about intraperiod price action.',
      followUpTopic: 'Support & Resistance',
    },
  ],
  volatility: [
    {
      difficulty: 'easy',
      question: 'In investing, "volatility" refers to:',
      options: [
        'How much and how quickly a price moves up and down',
        'How many shares a company has issued',
        'A company’s total debt level',
        'Whether a stock pays a dividend',
      ],
      correctIndex: 0,
      explanation:
        'Volatility measures the size and speed of price swings. A highly volatile stock can move a lot in a single day; a low-volatility stock tends to change more gradually.',
      learningObjective: 'Understand the basic concept of volatility.',
      followUpTopic: 'Risk Management',
    },
    {
      difficulty: 'medium',
      question: 'Which of these is generally true about higher-volatility stocks?',
      options: [
        'They carry the potential for larger gains and larger losses',
        'They are always a bad investment',
        'They never pay dividends',
        'Their price never changes',
      ],
      correctIndex: 0,
      explanation:
        'Volatility cuts both ways — bigger swings mean bigger potential upside AND bigger potential downside. It’s a measure of uncertainty/risk, not a judgment on whether a stock is "good" or "bad."',
      learningObjective: 'Understand that volatility represents risk in both directions.',
      followUpTopic: 'Diversification',
    },
    {
      difficulty: 'hard',
      question: 'Why might a long-term investor tolerate holding a volatile stock, even though its price swings are uncomfortable day to day?',
      options: [
        'Short-term volatility doesn’t necessarily reflect the company’s long-term fundamental value',
        'Volatile stocks are required to eventually go up',
        'Volatility guarantees a higher return over any time period',
        'Volatility only affects stocks you plan to sell tomorrow',
      ],
      correctIndex: 0,
      explanation:
        'Day-to-day price swings are often driven by short-term sentiment and trading flows, not changes in a company’s actual long-term prospects. An investor with a long time horizon can ride out volatility that would matter a lot to someone trading short-term.',
      learningObjective: 'Connect volatility tolerance to investment time horizon.',
      followUpTopic: 'Dollar-Cost Averaging',
    },
  ],
  market_cap_categories: [
    {
      difficulty: 'easy',
      question: 'Which term describes a company with a very large market capitalization (typically $10 billion or more)?',
      options: ['Large-cap', 'Small-cap', 'Micro-cap', 'No-cap'],
      correctIndex: 0,
      explanation:
        'Companies are commonly grouped by market cap size: large-cap (roughly $10B+), mid-cap, small-cap, and micro-cap, from biggest to smallest.',
      learningObjective: 'Learn the basic large-cap vs. small-cap terminology.',
      followUpTopic: 'Market Capitalization',
    },
    {
      difficulty: 'medium',
      question: 'Compared to large-cap stocks, small-cap stocks tend to be:',
      options: [
        'More volatile, with higher potential growth and higher risk',
        'Always less risky',
        'Impossible to buy or sell',
        'Guaranteed to pay higher dividends',
      ],
      correctIndex: 0,
      explanation:
        'Smaller companies are generally less established and more sensitive to setbacks, which tends to make their stock prices swing more — but also gives them more room to grow quickly compared to an already-massive company.',
      learningObjective: 'Compare typical risk/growth characteristics of small-cap vs. large-cap stocks.',
      followUpTopic: 'Volatility',
    },
    {
      difficulty: 'hard',
      question: 'Why might a large-cap company generally be considered more "stable" than a small-cap company, all else equal?',
      options: [
        'It often has more diversified revenue, established market position, and easier access to capital',
        'Large-cap companies are legally protected from losing value',
        'Large-cap stocks can’t be affected by market crashes',
        'Small-cap companies are not allowed to trade on major exchanges',
      ],
      correctIndex: 0,
      explanation:
        'Scale often brings advantages: multiple product lines or markets to fall back on, established customer relationships, and easier/cheaper access to financing — all of which can cushion a large company against shocks that would hit a smaller, less diversified one harder.',
      learningObjective: 'Understand the structural reasons large-caps tend to be more stable.',
      followUpTopic: 'Diversification',
    },
  ],
  sectors: [
    {
      difficulty: 'easy',
      question: 'A "sector" in the stock market refers to:',
      options: [
        'A group of companies operating in a similar area of the economy',
        'A single company’s different product lines',
        'A specific stock exchange, like the NYSE',
        'A time period for trading, like pre-market hours',
      ],
      correctIndex: 0,
      explanation:
        'Sectors group companies by what they do — e.g. Technology, Healthcare, Energy, Financials — so investors can analyze or invest in a broad slice of the economy at once.',
      learningObjective: 'Understand what a market sector is.',
      followUpTopic: 'Diversification',
    },
    {
      difficulty: 'medium',
      question: 'What does "sector rotation" describe?',
      options: [
        'Investors shifting money from one sector into another as the economic outlook changes',
        'A company switching which sector it’s classified in every year',
        'Stock exchanges rotating which sectors are allowed to trade each day',
        'A sector’s companies literally rotating their business models',
      ],
      correctIndex: 0,
      explanation:
        'As economic conditions shift, money often flows out of sectors expected to struggle and into ones expected to benefit — for example, out of consumer discretionary and into consumer staples when a recession looks likely.',
      learningObjective: 'Understand the concept of money moving between sectors.',
      followUpTopic: 'Bull & Bear Markets',
    },
    {
      difficulty: 'hard',
      question: 'Why might an investor holding stocks across many different sectors weather an industry-specific downturn better than one concentrated in a single sector?',
      options: [
        'A shock to one sector (e.g. an energy price crash) doesn’t directly hit companies in unrelated sectors',
        'Every sector always moves in the exact same direction',
        'Spreading across sectors guarantees positive overall returns',
        'Sector diversification eliminates all forms of investment risk',
      ],
      correctIndex: 0,
      explanation:
        'Different sectors often respond differently to the same event — e.g. rising oil prices can hurt airlines but help energy producers. Spreading investments across sectors reduces exposure to any single industry’s bad news, though it doesn’t remove market-wide risk.',
      learningObjective: 'Connect sector diversification to reducing industry-specific risk.',
      followUpTopic: 'Diversification',
    },
  ],
  bull_bear_markets: [
    {
      difficulty: 'easy',
      question: 'A "bull market" refers to a period when:',
      options: [
        'Stock prices are generally rising and investor confidence is high',
        'Stock prices are generally falling and investor confidence is low',
        'The stock market is closed for a holiday',
        'A company’s stock has just gone public',
      ],
      correctIndex: 0,
      explanation:
        '"Bull" = rising, optimistic market. Its opposite, a "bear" market, describes a period of generally falling prices and pessimism.',
      learningObjective: 'Learn the basic bull vs. bear market definitions.',
      followUpTopic: 'Market Sectors',
    },
    {
      difficulty: 'medium',
      question: 'A stock index is commonly said to be in a "bear market" once it has fallen roughly what amount from a recent high?',
      options: ['20% or more', '2% or more', '50% or more', '90% or more'],
      correctIndex: 0,
      explanation:
        'A drop of 20%+ from a recent peak is the widely used rule-of-thumb threshold for calling a bear market; a 10% drop is typically called a "correction" instead.',
      learningObjective: 'Learn the common percentage threshold used to define a bear market.',
      followUpTopic: 'Volatility',
    },
    {
      difficulty: 'hard',
      question: 'Why do many long-term investors specifically avoid trying to "time" the exact bottom of a bear market before buying back in?',
      options: [
        'The exact bottom is only ever obvious in hindsight, and waiting for certainty often means missing the early, sharpest part of the recovery',
        'Bear markets never actually end',
        'It’s illegal to buy stocks during a bear market',
        'Prices only recover if you wait for a bull market to be officially declared',
      ],
      correctIndex: 0,
      explanation:
        'Markets often turn upward well before the economic news looks good, and some of the strongest recovery days cluster right around the bottom. An investor waiting for a clear "all clear" signal frequently misses that early rebound entirely.',
      learningObjective: 'Understand why timing the exact market bottom is difficult and risky to attempt.',
      followUpTopic: 'Dollar-Cost Averaging',
    },
  ],
  diversification: [
    {
      difficulty: 'easy',
      question: 'What is the main idea behind diversification?',
      options: [
        'Spreading investments across different assets to reduce the impact of any single loss',
        'Putting all your money into the single best stock you can find',
        'Only investing in one sector you understand well',
        'Trading as frequently as possible',
      ],
      correctIndex: 0,
      explanation:
        'Diversification means not putting all your eggs in one basket — spreading money across different stocks, sectors, or asset types so that one investment doing badly doesn’t sink your whole portfolio.',
      learningObjective: 'Understand the core purpose of diversification.',
      followUpTopic: 'Market Sectors',
    },
    {
      difficulty: 'medium',
      question: 'Which portfolio is generally considered better diversified?',
      options: [
        '20 stocks across 8 different sectors',
        '20 stocks that are all in the technology sector',
        '1 stock split across 2 different brokerage accounts',
        '20 shares of the exact same stock',
      ],
      correctIndex: 0,
      explanation:
        'True diversification isn’t just about the number of holdings — 20 tech stocks can all fall together on bad tech-sector news. Spreading across different sectors reduces that shared exposure.',
      learningObjective: 'Recognize that diversification requires variety, not just quantity.',
      followUpTopic: 'Position Sizing',
    },
    {
      difficulty: 'hard',
      question: 'Why can diversification reduce risk without necessarily reducing expected long-term returns?',
      options: [
        'It mainly reduces the impact of any single company’s bad news, without requiring you to give up exposure to overall market growth',
        'Diversified portfolios are legally guaranteed a minimum return',
        'Adding more stocks always increases your expected return',
        'Diversification eliminates the need to ever check your portfolio',
      ],
      correctIndex: 0,
      explanation:
        'Diversification mostly smooths out "company-specific" risk (one firm’s scandal, product failure, etc.) while still letting you participate in the broader market’s growth — it’s reducing avoidable risk, not sacrificing return for safety.',
      learningObjective: 'Understand why diversification targets avoidable risk specifically.',
      followUpTopic: 'Risk Management',
    },
  ],
  stop_loss_discipline: [
    {
      difficulty: 'easy',
      question: 'A "stop-loss order" is designed to:',
      options: [
        'Automatically sell a position if it falls to a set price, limiting further loss',
        'Automatically buy more of a stock as its price falls',
        'Guarantee you never lose money on a trade',
        'Stop a company from being able to lose value',
      ],
      correctIndex: 0,
      explanation:
        'A stop-loss is a standing order to sell if the price drops to a level you choose in advance — a way to cap how much a single losing position can cost you.',
      learningObjective: 'Understand the basic purpose of a stop-loss order.',
      followUpTopic: 'Position Sizing',
    },
    {
      difficulty: 'medium',
      question: 'Why might a trader set a stop-loss BEFORE opening a position, rather than deciding "in the moment" if it starts falling?',
      options: [
        'It removes emotional decision-making from a stressful, fast-moving situation',
        'It guarantees the stock will never fall that low',
        'It’s legally required for every trade',
        'It has no real benefit either way',
      ],
      correctIndex: 0,
      explanation:
        'Deciding your exit plan calmly, before you have money on the line and prices are moving, avoids the common trap of freezing up or hoping a falling stock "comes back" past the point where the loss becomes painful.',
      learningObjective: 'Understand the behavioral benefit of pre-planned stop-losses.',
      followUpTopic: 'Risk Management',
    },
    {
      difficulty: 'hard',
      question: 'A trader sets a stop-loss extremely close to their entry price, on a stock with normal day-to-day price noise. What is the likely downside?',
      options: [
        'Ordinary volatility could trigger the stop and sell the position even though the longer-term thesis hasn’t actually changed',
        'A tight stop-loss guarantees a bigger profit',
        'Tight stop-losses are not allowed by most brokers',
        'There is no downside to setting the stop as close as possible',
      ],
      correctIndex: 0,
      explanation:
        'If a stop is set tighter than the stock’s normal day-to-day wiggle, routine noise — not any real change in the story — can trigger it, forcing an unwanted sale (sometimes called getting "stopped out" by noise).',
      learningObjective: 'Understand the tradeoff between a tight stop-loss and normal price volatility.',
      followUpTopic: 'Volatility',
    },
  ],
  position_sizing: [
    {
      difficulty: 'easy',
      question: '"Position sizing" refers to:',
      options: [
        'Deciding how much money or how many shares to put into a single investment',
        'Deciding which stock exchange to trade on',
        'The physical size of a company’s headquarters',
        'How many total stocks exist in the market',
      ],
      correctIndex: 0,
      explanation:
        'Position sizing is about how big any one bet is relative to your total portfolio — a key risk-management decision separate from picking which stock to buy.',
      learningObjective: 'Understand what position sizing means.',
      followUpTopic: 'Risk Management',
    },
    {
      difficulty: 'medium',
      question: 'Why might an investor deliberately avoid putting more than, say, 10% of their portfolio into any single stock?',
      options: [
        'To limit how much a single bad outcome can hurt the overall portfolio',
        'Because it’s illegal to own more than 10% of your portfolio in one stock',
        'Because stocks above 10% weighting automatically go up',
        'It has no real effect on portfolio risk',
      ],
      correctIndex: 0,
      explanation:
        'Capping any single position’s weight limits the damage if that one company has unexpected bad news — a form of risk control that works alongside diversification.',
      learningObjective: 'Connect position size limits to overall portfolio risk control.',
      followUpTopic: 'Diversification',
    },
    {
      difficulty: 'hard',
      question: 'Two trades both have the same stop-loss distance in dollars per share. Why might a disciplined trader still buy fewer shares of the more volatile stock?',
      options: [
        'To keep the total dollar risk if the stop is hit roughly consistent across different trades',
        'More volatile stocks are always illegal to buy in large amounts',
        'Fewer shares always means a lower total cost, which is the only consideration',
        'Volatility has no bearing on how many shares to buy',
      ],
      correctIndex: 0,
      explanation:
        'Sizing a position based on volatility (not just conviction) keeps the dollar amount at risk consistent trade to trade — a stock that swings more per share warrants a smaller share count to risk the same total amount.',
      learningObjective: 'Understand how volatility factors into disciplined position sizing.',
      followUpTopic: 'Stop-Loss Orders',
    },
  ],
  dollar_cost_averaging: [
    {
      difficulty: 'easy',
      question: 'Dollar-cost averaging means:',
      options: [
        'Investing a fixed amount of money at regular intervals, regardless of price',
        'Only buying a stock when its price hits a specific dollar amount',
        'Averaging the prices of two different stocks together',
        'Selling a fixed dollar amount every month',
      ],
      correctIndex: 0,
      explanation:
        'With dollar-cost averaging, you invest the same dollar amount on a set schedule (e.g. $200/month) rather than trying to time a single "best" moment to invest a lump sum.',
      learningObjective: 'Understand the basic mechanics of dollar-cost averaging.',
      followUpTopic: 'Volatility',
    },
    {
      difficulty: 'medium',
      question: 'What is the main benefit dollar-cost averaging is meant to provide?',
      options: [
        'It smooths out the effect of buying at a single, possibly bad, price point',
        'It guarantees a profit on every investment',
        'It always outperforms investing a lump sum all at once',
        'It removes all risk from investing entirely',
      ],
      correctIndex: 0,
      explanation:
        'By spreading purchases over time, you naturally buy more shares when prices are low and fewer when prices are high, smoothing out your average cost instead of betting everything on one moment’s price.',
      learningObjective: 'Understand the smoothing benefit of regular, scheduled investing.',
      followUpTopic: 'Bull & Bear Markets',
    },
    {
      difficulty: 'hard',
      question: 'Why might dollar-cost averaging particularly appeal to a beginner investor, even though a lump sum invested immediately has historically outperformed it slightly more often?',
      options: [
        'It reduces the emotional stress and regret of a single badly-timed lump-sum entry, making it easier to stick with the plan',
        'It is mathematically guaranteed to produce a higher return every time',
        'Lump-sum investing is not allowed for new investors',
        'It has literally no drawback compared to a lump sum',
      ],
      correctIndex: 0,
      explanation:
        'The behavioral case for DCA matters as much as the math: spreading purchases reduces the fear of "buying at the top" all at once, which can help a nervous investor actually follow through rather than staying in cash out of hesitation.',
      learningObjective: 'Weigh the behavioral benefits of dollar-cost averaging against its statistical tradeoffs.',
      followUpTopic: 'Risk Management',
    },
  ],
  risk_management: [
    {
      difficulty: 'easy',
      question: 'In investing, "risk management" broadly means:',
      options: [
        'Deliberately controlling how much you could lose on any investment or portfolio',
        'Avoiding the stock market entirely',
        'Only investing in companies with no debt',
        'Guaranteeing that you never lose money',
      ],
      correctIndex: 0,
      explanation:
        'Risk management is the general practice of controlling potential losses — through tools like diversification, position sizing, and stop-losses — rather than trying to eliminate risk (which isn’t possible) or ignoring it.',
      learningObjective: 'Understand the general concept of risk management.',
      followUpTopic: 'Diversification',
    },
    {
      difficulty: 'medium',
      question: 'Which of these is an example of a risk-management technique?',
      options: [
        'Limiting any single position to a small percentage of your portfolio',
        'Putting your entire portfolio into one stock you feel confident about',
        'Ignoring how much you could lose on a trade',
        'Trading only based on rumors you hear online',
      ],
      correctIndex: 0,
      explanation:
        'Capping position size is a direct, practical risk-management tool — it limits how much any single mistake or piece of bad news can hurt your overall portfolio.',
      learningObjective: 'Identify a concrete risk-management technique.',
      followUpTopic: 'Position Sizing',
    },
    {
      difficulty: 'hard',
      question: 'Why is risk management often described as "the thing that determines whether you survive to see your winners pay off"?',
      options: [
        'A single oversized loss can wipe out gains from many previous good trades, or force you out of the market before a recovery',
        'Risk management guarantees every trade will be profitable',
        'It only matters for professional traders, not individual investors',
        'It has no real bearing on long-term investing outcomes',
      ],
      correctIndex: 0,
      explanation:
        'Investing is a long game — you don’t need to be right every time, but one uncontrolled, oversized loss can erase months of gains or force you to sell at the worst moment. Good risk management is what lets you stay in the game long enough for good decisions to compound.',
      learningObjective: 'Understand why controlling downside is central to long-term investing success.',
      followUpTopic: 'Diversification',
    },
  ],
};

export function bankQuestionsFor(topicId: string): BankQuizQuestion[] {
  return QUIZ_BANK[topicId] ?? [];
}
