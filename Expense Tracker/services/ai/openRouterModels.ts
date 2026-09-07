// Runtime discovery of OpenRouter's currently-free ($0-priced, ":free"
// suffixed) models, so the app never hardcodes a specific model id that
// OpenRouter could delist at any time — their free-model roster changes
// often. A model only ever gets used here if BOTH its id ends in ":free"
// (OpenRouter's own convention for a zero-cost route) AND its live pricing
// is verified as $0/$0 — belt and suspenders, so a malformed or unexpected
// API response can't accidentally select a paid model.

type OpenRouterModel = {
  id: string;
  pricing?: { prompt?: string; completion?: string };
};

// Used only if live discovery itself fails (network error) — every entry
// still ends in ":free", so even a since-removed id here 404s instead of
// ever silently routing to a paid one.
const STATIC_FALLBACK_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'qwen/qwen-2.5-7b-instruct:free',
];

// OpenRouter's own free-tier rate limit resets daily and is shared across
// every free model under one key — no benefit to re-discovering more than a
// couple of times a day.
const DISCOVERY_TTL_MS = 12 * 60 * 60 * 1000;

let cachedModels: string[] | null = null;
let cachedAt = 0;
let inFlight: Promise<void> | null = null;

function isFree(m: OpenRouterModel): boolean {
  if (!m.id.endsWith(':free')) return false;
  const prompt = Number(m.pricing?.prompt ?? '1');
  const completion = Number(m.pricing?.completion ?? '1');
  return prompt === 0 && completion === 0;
}

async function discoverFreeModels(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout('https://openrouter.ai/api/v1/models');
    if (!res.ok) return [];
    const json = await res.json();
    const list = (json?.data as OpenRouterModel[] | undefined) ?? [];
    return list.filter(isFree).map((m) => m.id);
  } catch {
    return [];
  }
}

// Fire-and-forget background refresh — callers always get an immediate
// answer from cache/static fallback and never block a chat send on this.
function refreshInBackground(): void {
  if (inFlight) return;
  inFlight = discoverFreeModels()
    .then((ids) => {
      if (ids.length > 0) {
        cachedModels = ids;
        cachedAt = Date.now();
      }
    })
    .finally(() => {
      inFlight = null;
    });
}

// OpenRouter doesn't expose live latency, so this is a naming heuristic —
// small/instruct-tuned models named this way are typically the fastest to
// respond among free-tier options.
const FAST_HINTS = ['8b', '9b', '7b', 'mini', 'flash', 'instant', 'small'];

function fastestFirst(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const aFast = FAST_HINTS.some((h) => a.toLowerCase().includes(h)) ? 0 : 1;
    const bFast = FAST_HINTS.some((h) => b.toLowerCase().includes(h)) ? 0 : 1;
    return aFast - bFast;
  });
}

// Best-effort pick of the currently-free model most likely to respond
// fastest. Always returns synchronously (cache or the static fallback);
// triggers a background refresh when the cache is stale/empty rather than
// making a caller wait on a network round trip before their chat can send.
export function getBestFreeOpenRouterModel(): string {
  if (Date.now() - cachedAt > DISCOVERY_TTL_MS) refreshInBackground();
  const pool = cachedModels && cachedModels.length > 0 ? cachedModels : STATIC_FALLBACK_MODELS;
  return fastestFirst(pool)[0];
}
import { fetchWithTimeout } from '@/services/network/fetchWithTimeout';
