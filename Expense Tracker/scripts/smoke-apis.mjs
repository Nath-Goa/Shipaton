const TIMEOUT_MS = 15_000;

async function request(name, url, init, validate) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = await response.json().catch(() => null);
    const ok = response.ok && validate(data);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${response.status})`);
    return ok;
  } catch (error) {
    console.log(`FAIL  ${name} (${error instanceof Error ? error.name : 'request error'})`);
    return false;
  }
}

const checks = [];

checks.push(
  request(
    'Yahoo Finance quote',
    'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d',
    { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } },
    (data) => Number.isFinite(data?.chart?.result?.[0]?.meta?.regularMarketPrice)
  )
);

const twelveDataKey = process.env.EXPO_PUBLIC_TWELVEDATA_API_KEY?.trim();
if (twelveDataKey) {
  const params = new URLSearchParams({ symbol: 'AAPL', interval: '1day', outputsize: '2', apikey: twelveDataKey });
  checks.push(
    request('Twelve Data', `https://api.twelvedata.com/time_series?${params}`, {}, (data) => data?.values?.length > 0)
  );
} else {
  console.log('SKIP  Twelve Data (no key in selected environment)');
}

const geminiKey = process.env.EXPO_PUBLIC_SHARED_GEMINI_API_KEY?.trim();
if (geminiKey) {
  const model = 'gemini-3.6-flash';
  checks.push(
    request(
      'Gemini',
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }] }),
      },
      (data) => typeof data?.candidates?.[0]?.content?.parts?.[0]?.text === 'string'
    )
  );
} else {
  console.log('SKIP  Gemini shared AI (no key in selected environment)');
}

const openRouterKey = process.env.EXPO_PUBLIC_SHARED_OPENROUTER_API_KEY?.trim();
if (openRouterKey) {
  checks.push(
    request(
      'OpenRouter models',
      'https://openrouter.ai/api/v1/models',
      { headers: { Authorization: `Bearer ${openRouterKey}` } },
      (data) => Array.isArray(data?.data) && data.data.length > 0
    )
  );
} else {
  console.log('SKIP  OpenRouter shared AI (no key in selected environment)');
}

const revenueCatKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim()
  || process.env.EXPO_PUBLIC_REVENUECAT_API_KEY?.trim();
const revenueCatValid = !!revenueCatKey && /^(goog|appl)_[A-Za-z0-9]+$/.test(revenueCatKey);
console.log(`${revenueCatValid ? 'PASS' : 'SKIP'}  RevenueCat Android key${revenueCatKey ? ' format' : ' (no key in selected environment)'}`);

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
let sentryValid = false;
if (sentryDsn) {
  try {
    const parsed = new URL(sentryDsn);
    sentryValid = parsed.protocol === 'https:' && parsed.username.length > 0 && parsed.pathname.length > 1;
  } catch {}
}
console.log(`${sentryValid ? 'PASS' : 'SKIP'}  Sentry DSN${sentryDsn ? ' format' : ' (no DSN in selected environment)'}`);

const results = await Promise.all(checks);
if (results.some((ok) => !ok)) process.exitCode = 1;
