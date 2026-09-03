export type BankFlashcard = { front: string; back: string };

// Hand-written flashcards, four per topic in constants/quizTopics.ts — a
// full first pass through Learn's flashcards never requires an AI call.
// Once a topic's set here is exhausted, the flashcards screen falls back
// to AI generation (see app/(tabs)/learn/flashcards.tsx).
export const FLASHCARD_BANK: Record<string, BankFlashcard[]> = {
  pe_ratio: [
    { front: 'P/E Ratio', back: 'Price ÷ earnings per share. Shows how much investors pay for each $1 of a company’s annual profit.' },
    { front: 'What does a high P/E usually suggest?', back: 'The market expects faster future earnings growth — or the stock is simply expensive relative to current profits.' },
    { front: 'Forward P/E', back: 'A P/E ratio calculated using estimated future earnings instead of the last 12 months’ actual earnings.' },
    { front: 'Trailing P/E', back: 'A P/E ratio calculated using the company’s actual earnings from the past 12 months.' },
  ],
  market_cap: [
    { front: 'Market Capitalization', back: 'Share price × total shares outstanding. The total market value of a company’s equity.' },
    { front: 'Why can two companies with the same market cap have very different share prices?', back: 'Because share count differs — fewer shares outstanding means a higher price per share at the same total value.' },
    { front: 'Shares Outstanding', back: 'The total number of a company’s shares currently held by all shareholders.' },
    { front: 'Does a higher share price mean a company is "bigger"?', back: 'No — market cap (price × shares), not price alone, measures a company’s total size.' },
  ],
  dividend_yield: [
    { front: 'Dividend Yield', back: 'Annual dividend per share ÷ share price, as a percentage — the cash income rate relative to what you paid.' },
    { front: 'Why can a rising dividend yield actually be a bad sign?', back: 'If the dividend itself hasn’t changed, a rising yield usually means the share price is falling.' },
    { front: 'Dividend', back: 'A cash payment a company distributes to shareholders, usually out of its profits.' },
    { front: 'Do all stocks pay dividends?', back: 'No — many growth companies reinvest all profits into the business instead of paying a dividend.' },
  ],
  eps: [
    { front: 'EPS (Earnings Per Share)', back: 'Net income ÷ shares outstanding. Converts total company profit into a per-share figure.' },
    { front: 'How can EPS rise even if total profit stays flat?', back: 'If the company buys back and retires shares, the same profit is split among fewer shares.' },
    { front: 'Net Income', back: 'A company’s total profit after all expenses, taxes, and costs are subtracted from revenue.' },
    { front: 'Why is EPS useful for comparing companies?', back: 'It standardizes profit on a per-share basis, so companies of different sizes can be compared more fairly.' },
  ],
  moving_averages: [
    { front: 'Moving Average', back: 'The average closing price over a set recent period (e.g. 50 days), recalculated daily to smooth out noise.' },
    { front: 'Golden Cross', back: 'When a shorter-term moving average crosses above a longer-term one — often read as a bullish signal.' },
    { front: 'Death Cross', back: 'When a shorter-term moving average crosses below a longer-term one — often read as a bearish signal.' },
    { front: 'Why is a 200-day MA "slower" than a 20-day MA?', back: 'It averages far more days, so any single day’s price move has much less effect on it.' },
  ],
  rsi_oversold: [
    { front: 'RSI (Relative Strength Index)', back: 'A momentum indicator, scored 0–100, based on the size and speed of recent gains vs. losses.' },
    { front: 'Overbought (RSI)', back: 'RSI above roughly 70 — price has risen quickly and may be due for a pause.' },
    { front: 'Oversold (RSI)', back: 'RSI below roughly 30 — price has fallen quickly and may be due for a bounce.' },
    { front: 'Can a stock stay "overbought" for weeks in a strong trend?', back: 'Yes — RSI measures momentum, not a hard sell signal, so strong trends can stay overbought a long time.' },
  ],
  volume_analysis: [
    { front: 'Trading Volume', back: 'The number of shares of a stock that changed hands over a given period, usually one day.' },
    { front: 'Why does a price move on high volume carry more weight?', back: 'High volume means many participants are acting, suggesting broader conviction behind the move.' },
    { front: 'Volume Spike', back: 'A day where trading volume is unusually far above its recent average — often tied to news.' },
    { front: 'Bearish Volume Divergence', back: 'Price keeps rising while volume keeps shrinking — a sign the rally may be losing participation.' },
  ],
  support_resistance: [
    { front: 'Support Level', back: 'A price area where buying pressure has repeatedly stopped a stock from falling further.' },
    { front: 'Resistance Level', back: 'A price area where selling pressure has repeatedly stopped a stock from rising further.' },
    { front: 'What often happens to support once it’s decisively broken?', back: 'It frequently flips into a new resistance level going forward.' },
    { front: 'Why do more-tested levels carry more weight?', back: 'They reflect a wider consensus among traders about where the price is meaningful.' },
  ],
  candlestick_basics: [
    { front: 'Candlestick', back: 'A chart shape encoding one period’s open, high, low, and close price in a single "body" and "wicks."' },
    { front: 'Candlestick Wick (shadow)', back: 'The thin line above/below a candle’s body showing the high and low reached during that period.' },
    { front: 'What does a long lower wick with a small body near the top suggest?', back: 'Sellers pushed price down sharply, but buyers stepped in and pushed it back up by the close.' },
    { front: 'What does candle color typically indicate?', back: 'Whether the period closed higher (often green) or lower (often red) than it opened.' },
  ],
  volatility: [
    { front: 'Volatility', back: 'How much and how quickly a stock’s price moves up and down over time.' },
    { front: 'Does high volatility mean a stock is "bad"?', back: 'No — it means larger potential swings in both directions, i.e. more risk, not automatically a worse investment.' },
    { front: 'Why can a long-term investor tolerate short-term volatility?', back: 'Short-term price swings don’t necessarily reflect real changes in a company’s long-term value.' },
    { front: 'Low-Volatility Stock', back: 'A stock whose price tends to change gradually rather than swinging sharply day to day.' },
  ],
  market_cap_categories: [
    { front: 'Large-Cap', back: 'A company with a large market capitalization, typically around $10 billion or more.' },
    { front: 'Small-Cap', back: 'A company with a smaller market capitalization — generally more volatile, with more room to grow quickly.' },
    { front: 'Mid-Cap', back: 'A company with a market capitalization between small-cap and large-cap — a middle-ground risk/growth profile.' },
    { front: 'Why are large-caps often considered more stable?', back: 'They tend to have more diversified revenue, an established position, and easier access to capital.' },
  ],
  sectors: [
    { front: 'Sector', back: 'A group of companies operating in a similar area of the economy, e.g. Technology or Healthcare.' },
    { front: 'Sector Rotation', back: 'Investors shifting money from one sector into another as the economic outlook changes.' },
    { front: 'Why does diversifying across sectors reduce risk?', back: 'A shock to one sector (e.g. energy prices) doesn’t directly hit companies in unrelated sectors.' },
    { front: 'Consumer Staples (as a sector)', back: 'Companies selling everyday essentials (food, household goods) — often more stable in downturns.' },
  ],
  bull_bear_markets: [
    { front: 'Bull Market', back: 'A period of generally rising stock prices and high investor confidence.' },
    { front: 'Bear Market', back: 'A period of generally falling stock prices — commonly defined as a 20%+ drop from a recent high.' },
    { front: 'Market Correction', back: 'A decline of roughly 10% or more from a recent high — smaller and often shorter than a bear market.' },
    { front: 'Why is timing the exact bottom of a bear market so risky?', back: 'The bottom is usually only obvious in hindsight, and waiting often means missing the sharpest early recovery.' },
  ],
  diversification: [
    { front: 'Diversification', back: 'Spreading investments across different assets so that one investment doing badly doesn’t sink the whole portfolio.' },
    { front: 'Is owning 20 stocks in the same sector well-diversified?', back: 'Not really — they can all fall together on sector-wide bad news, so variety matters, not just quantity.' },
    { front: 'What kind of risk does diversification mainly reduce?', back: 'Company-specific risk — the danger tied to one single company’s bad news.' },
    { front: 'Does diversification guarantee a profit?', back: 'No — it reduces avoidable risk, but doesn’t eliminate overall market risk or guarantee returns.' },
  ],
  stop_loss_discipline: [
    { front: 'Stop-Loss Order', back: 'A standing order to automatically sell a position if it falls to a price you set in advance.' },
    { front: 'Why set a stop-loss before opening a position, not "in the moment"?', back: 'It removes emotional decision-making from a stressful, fast-moving situation.' },
    { front: 'Risk of setting a stop-loss too tight', back: 'Normal day-to-day price noise can trigger it even though the longer-term thesis hasn’t changed.' },
    { front: 'Trailing Stop', back: 'A stop-loss that automatically moves up as the price rises, locking in gains while still limiting downside.' },
  ],
  position_sizing: [
    { front: 'Position Sizing', back: 'Deciding how much money (or how many shares) to put into a single investment.' },
    { front: 'Why cap any single stock at, say, 10% of a portfolio?', back: 'To limit how much a single bad outcome in one stock can hurt the overall portfolio.' },
    { front: 'Why might a trader buy fewer shares of a more volatile stock at the same stop distance?', back: 'To keep the total dollar amount at risk roughly consistent across different trades.' },
    { front: 'Overconcentration', back: 'Having too much of a portfolio riding on one position, sector, or idea — amplifying the impact if it goes wrong.' },
  ],
  dollar_cost_averaging: [
    { front: 'Dollar-Cost Averaging (DCA)', back: 'Investing a fixed dollar amount at regular intervals, regardless of price, instead of one lump sum.' },
    { front: 'Main benefit of DCA', back: 'It smooths out the effect of buying at a single, possibly bad, price point over time.' },
    { front: 'Does DCA always beat investing a lump sum immediately?', back: 'No — lump-sum investing has historically outperformed slightly more often, but DCA can be easier to stick with emotionally.' },
    { front: 'Why does DCA naturally buy more shares when prices are low?', back: 'A fixed dollar amount buys more shares when the price per share is lower.' },
  ],
  risk_management: [
    { front: 'Risk Management', back: 'Deliberately controlling how much you could lose on any investment or portfolio, using tools like sizing and stops.' },
    { front: 'Can risk management guarantee no losses?', back: 'No — it limits and controls potential losses, it doesn’t eliminate risk entirely.' },
    { front: 'Why is risk management described as key to "surviving to see your winners pay off"?', back: 'One oversized, uncontrolled loss can erase many previous gains or force you out before a recovery.' },
    { front: 'Risk/Reward Ratio', back: 'A comparison of how much you stand to lose versus how much you stand to gain on a given trade.' },
  ],
};

export function bankFlashcardsFor(topicId: string): BankFlashcard[] {
  return FLASHCARD_BANK[topicId] ?? [];
}
