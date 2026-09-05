/* eslint-disable no-console */
import { aggregateSentiment, scoreHeadline } from '@/services/news/sentiment';
import type { NewsItem } from '@/types/prediction';

// Verifies the two halves of the news pipeline independently: that the
// lexicon scores known-signal headlines in the right direction, and that
// Yahoo's search endpoint actually returns usable headlines right now.
// Run: npm run test:news

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CASES: { title: string; expect: 'pos' | 'neg' | 'neutral' }[] = [
  { title: 'Apple beats quarterly expectations, raises guidance', expect: 'pos' },
  { title: 'Nvidia surges to record high on strong AI demand', expect: 'pos' },
  { title: 'Analysts upgrade Microsoft citing cloud growth', expect: 'pos' },
  { title: 'Tesla misses delivery estimates, shares plunge', expect: 'neg' },
  { title: 'Boeing faces federal investigation over safety concerns', expect: 'neg' },
  { title: 'Intel announces layoffs amid weak demand', expect: 'neg' },
  { title: 'Disney downgraded by analysts on streaming losses', expect: 'neg' },
  { title: 'Company schedules annual shareholder meeting for June', expect: 'neutral' },
  { title: 'Stock does not beat expectations', expect: 'neg' },
  { title: 'Netflix stock slightly declines in early trading', expect: 'neg' },
];

function testLexicon(): boolean {
  console.log('=== LEXICON ===');
  let failures = 0;
  for (const testCase of CASES) {
    const score = scoreHeadline(testCase.title);
    const actual = score > 0.08 ? 'pos' : score < -0.08 ? 'neg' : 'neutral';
    const ok = actual === testCase.expect;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'}  ${score >= 0 ? '+' : ''}${score.toFixed(3)}  ${
        ok ? '' : `(expected ${testCase.expect}, got ${actual}) `
      }${testCase.title}`
    );
  }
  console.log(`  ${CASES.length - failures}/${CASES.length} passed\n`);
  return failures === 0;
}

async function testLiveFeed() {
  console.log('=== LIVE YAHOO NEWS ===');
  for (const symbol of ['AAPL', 'TSLA', 'NVDA']) {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&newsCount=8&quotesCount=0`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        console.log(`  ${symbol}: HTTP ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { news?: { title?: string; providerPublishTime?: number }[] };
      const items: NewsItem[] = (json.news ?? [])
        .filter((n) => typeof n.title === 'string')
        .map((n, i) => ({
          id: `${symbol}-${i}`,
          title: n.title as string,
          publisher: 'x',
          publishedAt: (n.providerPublishTime ?? Date.now() / 1000) * 1000,
          symbol,
        }));
      const sentiment = aggregateSentiment(items);
      console.log(
        `  ${symbol}: ${items.length} headlines, ${sentiment.scoredCount} scored -> ${sentiment.label} (${sentiment.score.toFixed(3)})`
      );
      for (const h of items.slice(0, 3)) {
        console.log(`      ${scoreHeadline(h.title) >= 0 ? '+' : ''}${scoreHeadline(h.title).toFixed(2)}  ${h.title}`);
      }
    } catch (e) {
      console.log(`  ${symbol}: ${e instanceof Error ? e.message : 'failed'}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function main() {
  const lexiconOk = testLexicon();
  await testLiveFeed();
  if (!lexiconOk) process.exitCode = 1;
}

main();
